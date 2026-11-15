import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, ConfirmDialog, EmptyState, Icon, Input, PageHeader, Select, Spinner } from "../../../../components/ui";
import type { SelectOption } from "../../../../components/ui";
import { useGetExamsQuery, useSetExamLockMutation, useSetResultsPublishedMutation } from "../../../../store/api/exams.api";
import { useDeleteExamMutation, useGetExamMetaQuery, useGetExamPlanQuery, type PlanGroup } from "../../../../store/api/examPlan.api";
import styles from "./AdminExamsPage.module.css";
import AdmitCardModal from "./AdmitCardModal";
import ExamGroupCard, { type ExamGroup } from "./ExamGroupCard";
import { classLabelOf, STATUS_LABEL, statusOf, type ExamStatus } from "./examStatus";
import ExamProgressModal from "./ExamProgressModal";
import ExamResultsView from "./ExamResultsView";
import ExamSubjectsModal from "./ExamSubjectsModal";
import PlanExamModal from "./PlanExamModal";
import ResultsTab from "./ResultsTab";
import SchemesTab from "./SchemesTab";

type StatusFilter = "all" | ExamStatus;
// Letters and digits only, so "9-A", "9 a", "Class 9A" and "class 9 - a" all match each other.
const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
// School order: Nursery, LKG, UKG, then Class 1, 2 … 12 (not alphabetical "1, 10, 2").
const PRE_PRIMARY = ["playgroup", "nursery", "lkg", "ukg", "kg"];
const classRank = (e: IExam) => {
  const name = squash(e.classSection?.className.replace(/^class\s*/i, "") ?? "");
  const pre = PRE_PRIMARY.indexOf(name);
  if (pre >= 0) return pre - PRE_PRIMARY.length;
  const n = parseInt(name, 10);
  return Number.isFinite(n) ? n : 100;
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

type PageTab = "exams" | "results" | "schemes";
const TYPE_FILTERS = [
  { label: "All types", value: "" },
  { label: "Term exams", value: "TERM_EXAM" },
  { label: "Periodic tests", value: "PERIODIC_TEST" },
  { label: "Class tests", value: "CLASS_TEST" },
];

// Exams grouped the way they were planned: one group per exam, with its classes inside. Class
// tests come last, together. Term order, then the order they were set up.
const groupExams = (exams: IExam[], plan: PlanGroup[] | undefined): ExamGroup[] => {
  const groups = new Map<string, ExamGroup>();
  for (const e of exams) {
    const type = e.type ?? "TERM_EXAM";
    const key = type === "CLASS_TEST" ? "class-tests" : (e.groupKey ?? `single:${e.id}`);
    if (!groups.has(key)) groups.set(key, { key, name: e.name, type, term: e.term ?? 1, marksDeadline: e.marksDeadline ?? null, exams: [], plan: plan?.find((p) => p.groupKey === e.groupKey) });
    groups.get(key)!.exams.push(e);
  }
  const firstId = (g: ExamGroup) => Math.min(...g.exams.map((e) => e.id));
  return [...groups.values()].sort((a, b) => Number(a.type === "CLASS_TEST") - Number(b.type === "CLASS_TEST") || a.term - b.term || firstId(a) - firstId(b));
};

// Exam coordinator's page (admins, and teachers given the permission): plan exams for many
// classes, set max marks, date sheets and admit cards, follow marks entry and lock; the Super
// Admin / Principal publish. Marks are entered by subject teachers on their own Exams page.
// Tabs: Exams, Results (term/final), Schemes.
const AdminExamsPage = () => {
  const { data: meta } = useGetExamMetaQuery();
  const coordinator = !!meta?.permissions.coordinator;
  const publisher = !!meta?.permissions.publisher;
  const [params, setParams] = useSearchParams();
  const pageTab = ((["exams", "results", "schemes"] as const).find((k) => k === params.get("tab")) ?? "exams") as PageTab;

  // The current session unless an earlier one is picked.
  const [sessionPick, setSessionPick] = useState("");
  const current = meta?.sessions.find((s) => s.isCurrent);
  const sessionId = sessionPick ? Number(sessionPick) : undefined;
  const pastSession = !!sessionId && sessionId !== current?.id;
  const sessionOptions: SelectOption[] = (meta?.sessions ?? []).map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }));

  const { data: plan } = useGetExamPlanQuery(sessionId, { skip: !coordinator });
  const { data: exams, isLoading: isLoadingExams, isError: examsError, refetch: refetchExams } = useGetExamsQuery(sessionId ? { sessionId } : undefined);

  // Filters run in the browser on the session's exams.
  const [typeFilter, setTypeFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const [planOpen, setPlanOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<PlanGroup | null>(null);
  const [subjectsExam, setSubjectsExam] = useState<IExam | null>(null);
  const [admitExam, setAdmitExam] = useState<IExam | null>(null);
  const [progressExam, setProgressExam] = useState<IExam | null>(null);
  const [resultsExamId, setResultsExamId] = useState<number | null>(null);
  const [pendingPublish, setPendingPublish] = useState<IExam | null>(null);
  const [pendingLock, setPendingLock] = useState<IExam | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IExam | null>(null);
  const [bulk, setBulk] = useState<{ action: "lock" | "publish"; exams: IExam[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lockingId, setLockingId] = useState<number | null>(null);
  const [setPublished, { isLoading: publishing }] = useSetResultsPublishedMutation();
  const [setExamLock] = useSetExamLockMutation();
  const [deleteExam, { isLoading: deleting }] = useDeleteExamMutation();

  const toggleLock = async (exam: IExam) => {
    setLockingId(exam.id);
    try {
      await setExamLock({ examId: exam.id, locked: !exam.isLocked }).unwrap();
      toast.success(exam.isLocked ? "Marks unlocked. Teachers can edit again." : "Marks locked. Teachers can no longer edit.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the lock."));
    } finally {
      setLockingId(null);
      setPendingLock(null);
    }
  };

  const runBulk = async () => {
    if (!bulk) return;
    setBulkBusy(true);
    let done = 0;
    let firstError = "";
    // One at a time: a class that can't be changed mustn't stop the rest.
    for (const exam of bulk.exams) {
      try {
        if (bulk.action === "lock") await setExamLock({ examId: exam.id, locked: true }).unwrap();
        else await setPublished({ examId: exam.id, published: true }).unwrap();
        done += 1;
      } catch (err) {
        firstError ||= `${classLabelOf(exam)}: ${getErrorMessage(err, "couldn't be updated")}`;
      }
    }
    const failed = bulk.exams.length - done;
    if (done) toast.success(`${bulk.action === "lock" ? "Locked" : "Published"} for ${done} class${done === 1 ? "" : "es"}`);
    if (failed) toast.error(`${failed} not updated. ${firstError}`);
    setBulkBusy(false);
    setBulk(null);
  };

  // Exams in class order, then section, then the order they were created.
  const sortedExams = useMemo(
    () => [...(exams ?? [])].sort((a, b) => classRank(a) - classRank(b) || classLabelOf(a).localeCompare(classLabelOf(b), undefined, { numeric: true }) || a.id - b.id),
    [exams]
  );
  const classFilterOptions: SelectOption[] = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of sortedExams) if (!seen.has(e.classSectionId)) seen.set(e.classSectionId, classLabelOf(e));
    return [{ label: "All classes", value: "" }, ...[...seen].map(([id, label]) => ({ label, value: String(id) }))];
  }, [sortedExams]);

  const inClass = useMemo(
    () => sortedExams.filter((e) => (!classFilter || e.classSectionId === Number(classFilter)) && (!typeFilter || (e.type ?? "TERM_EXAM") === typeFilter)),
    [sortedExams, classFilter, typeFilter]
  );
  const matching = useMemo(() => {
    const phrase = squash(searchQuery);
    if (!phrase) return inClass;
    // 1) The whole phrase inside the exam name, class or session ("Unit Test 2", "9-A", "class 9 a").
    const byPhrase = inClass.filter((e) => [e.name, classLabelOf(e), e.session?.name ?? ""].some((f) => squash(f).includes(phrase)));
    if (byPhrase.length) return byPhrase;
    // 2) Otherwise every word on its own ("half 9a" = Half Yearly of Class 9 - A). Words with
    //    digits must match exactly, so "2" doesn't match "2026-27" or "Class 12".
    const tokens = searchQuery.split(/\s+/).map(squash).filter(Boolean);
    return inClass.filter((e) => {
      const cls = e.classSection ? squash(e.classSection.className.replace(/^class\s*/i, "")) : "";
      const words = [...`${e.name} ${classLabelOf(e)} ${e.session?.name ?? ""}`.toLowerCase().split(/[^a-z0-9]+/), cls + squash(e.classSection?.section ?? "")].filter(Boolean);
      return tokens.every((t) => (/^[a-z]+$/.test(t) ? words.some((w) => w.startsWith(t)) : words.includes(t)));
    });
  }, [inClass, searchQuery]);
  const counts = useMemo(() => {
    const c = { all: matching.length, open: 0, locked: 0, published: 0 };
    for (const e of matching) c[statusOf(e)] += 1;
    return c;
  }, [matching]);
  const filteredExams = useMemo(() => (statusFilter === "all" ? matching : matching.filter((e) => statusOf(e) === statusFilter)), [matching, statusFilter]);
  const groups = useMemo(() => groupExams(filteredExams, plan), [filteredExams, plan]);
  const filtersActive = !!(classFilter || searchQuery.trim() || statusFilter !== "all" || typeFilter);
  const clearFilters = () => {
    setTypeFilter("");
    setClassFilter("");
    setSearchQuery("");
    setStatusFilter("all");
  };

  // Other classes sharing this exam that can still take a copied change.
  const siblingsOf = (exam: IExam) => (exam.groupKey ? (exams ?? []).filter((e) => e.groupKey === exam.groupKey && e.id !== exam.id && !e.isLocked && !e.resultsPublished).length : 0);

  if (resultsExamId !== null) {
    return <ExamResultsView examId={resultsExamId} onBack={() => setResultsExamId(null)} />;
  }

  const publishMessage = (exam: IExam) => {
    if (exam.resultsPublished) return `Students will no longer see their "${exam.name}" marks until you publish again.`;
    const lockNote = exam.isLocked ? "" : exam.readyAt ? " Marks are locked when published." : " The class teacher hasn't marked it ready yet; publishing locks the marks as they are.";
    return `Students of ${classLabelOf(exam)} will see their "${exam.name}" marks.${lockNote} Term and final report cards are published from the "Term & final results" tab.`;
  };

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Plan exams, check marks, and publish term and final results"
        actions={
          coordinator && pageTab === "exams" && !pastSession ? (
            <Button type="button" icon={<Icon name="plus" size={16} />} onClick={() => setPlanOpen(true)}>
              Plan exam
            </Button>
          ) : undefined
        }
      />

      <div className={styles.pageBar}>
        <div className={styles.pageTabs} role="tablist" aria-label="Exam sections">
          {(
            [
              ["exams", "Exams"],
              ["results", "Term & final results"],
              ["schemes", "Assessment schemes"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={pageTab === k}
              className={`${styles.pageTab} ${pageTab === k ? styles.pageTabOn : ""}`}
              onClick={() => setParams(k === "exams" ? {} : { tab: k }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </div>
        {sessionOptions.length > 1 && pageTab !== "schemes" && (
          <div className={styles.sessionBox}>
            <Select
              aria-label="Session"
              options={sessionOptions}
              value={sessionPick || String(current?.id ?? "")}
              onChange={(e) => {
                setSessionPick(e.target.value);
                setClassFilter("");
              }}
            />
          </div>
        )}
      </div>

      {pageTab === "results" && <ResultsTab sessionId={sessionId} />}
      {pageTab === "schemes" && <SchemesTab />}

      {pageTab === "exams" && (
        <div className={styles.listPage}>
          {/* How an exam moves along: what each status means */}
          <ol className={styles.flowSteps} aria-label="How an exam moves along">
            {[
              ["Plan exam", "Coordinator"],
              ["Enter marks", "Subject teachers"],
              ["Mark ready", "Class teacher"],
              ["Lock marks", "Coordinator"],
              ["Publish", "Principal"],
            ].map(([step, who], i) => (
              <li key={step}>
                <span className={styles.flowNum}>{i + 1}</span>
                <span className={styles.flowText}>
                  <b>{step}</b>
                  <small>{who}</small>
                </span>
              </li>
            ))}
          </ol>

          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <Input label="Search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Exam or class, e.g. Half Yearly 9-A" />
            </div>
            <div className={styles.classBox}>
              <Select label="Class" options={classFilterOptions} value={classFilter} onChange={(e) => setClassFilter(e.target.value)} />
            </div>
            <div className={styles.classBox}>
              <Select label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
            </div>
          </div>

          <div className={styles.chips} role="tablist" aria-label="Filter by status">
            {(["all", "open", "locked", "published"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={statusFilter === k}
                className={`${styles.chip} ${statusFilter === k ? styles.chipOn : ""}`}
                onClick={() => setStatusFilter(k)}
              >
                {k === "all" ? "All" : STATUS_LABEL[k]}
                <span className={styles.chipCount}>{counts[k]}</span>
              </button>
            ))}
          </div>

          {isLoadingExams ? (
            <Spinner />
          ) : examsError ? (
            <EmptyState
              title="Couldn't load exams"
              action={
                <Button variant="outline" onClick={() => refetchExams()}>
                  Retry
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <EmptyState
              title={filtersActive ? "No exams match" : "No exams yet"}
              description={filtersActive ? "Try another class, type, status or search." : pastSession ? "No exams were planned in this session." : "Set up the first exam with Plan exam."}
              action={
                filtersActive ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {filtersActive && (
                <p className={styles.resultCount}>
                  {filteredExams.length} result{filteredExams.length === 1 ? "" : "s"}
                  <button type="button" className={styles.linkBtn} onClick={clearFilters}>
                    Clear filters
                  </button>
                </p>
              )}
              <div className={styles.groupList}>
                {groups.map((group) => (
                  <ExamGroupCard
                    key={group.key}
                    group={group}
                    // Closed overview by default; a filter opens what it found.
                    open={toggled[group.key] ?? (filtersActive || groups.length === 1)}
                    onToggle={() => setToggled((t) => ({ ...t, [group.key]: !(t[group.key] ?? (filtersActive || groups.length === 1)) }))}
                    coordinator={coordinator}
                    publisher={publisher}
                    lockingId={lockingId}
                    onEdit={setEditGroup}
                    onLockAll={(list) => setBulk({ action: "lock", exams: list })}
                    onPublishAll={(list) => setBulk({ action: "publish", exams: list })}
                    onProgress={setProgressExam}
                    onResults={(e) => setResultsExamId(e.id)}
                    onMaxMarks={setSubjectsExam}
                    onDateSheet={setAdmitExam}
                    onLock={setPendingLock}
                    onPublish={setPendingPublish}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {progressExam && (
        <ExamProgressModal
          exam={progressExam}
          title={`${progressExam.name} · ${classLabelOf(progressExam)}`}
          onClose={() => setProgressExam(null)}
          onResults={() => {
            setResultsExamId(progressExam.id);
            setProgressExam(null);
          }}
        />
      )}
      {admitExam && <AdmitCardModal examId={admitExam.id} siblings={siblingsOf(admitExam)} onClose={() => setAdmitExam(null)} />}
      {planOpen && <PlanExamModal onClose={() => setPlanOpen(false)} />}
      {editGroup && <PlanExamModal group={editGroup} onClose={() => setEditGroup(null)} />}
      {subjectsExam && <ExamSubjectsModal examId={subjectsExam.id} title={`${subjectsExam.name} · ${classLabelOf(subjectsExam)}`} siblings={siblingsOf(subjectsExam)} onClose={() => setSubjectsExam(null)} />}

      {pendingPublish && (
        <ConfirmDialog
          title={pendingPublish.resultsPublished ? "Unpublish results?" : "Publish results?"}
          message={publishMessage(pendingPublish)}
          confirmLabel={pendingPublish.resultsPublished ? "Unpublish" : "Publish"}
          tone={pendingPublish.resultsPublished ? "danger" : "primary"}
          isLoading={publishing}
          onCancel={() => setPendingPublish(null)}
          onConfirm={async () => {
            try {
              await setPublished({ examId: pendingPublish.id, published: !pendingPublish.resultsPublished }).unwrap();
              toast.success(pendingPublish.resultsPublished ? "Results unpublished" : "Results published. Students can now see their marks.");
            } catch (err) {
              toast.error(getErrorMessage(err, "Couldn't update"));
            } finally {
              setPendingPublish(null);
            }
          }}
        />
      )}

      {pendingLock && (
        <ConfirmDialog
          title={pendingLock.isLocked ? "Unlock marks?" : "Lock marks?"}
          message={
            pendingLock.isLocked
              ? `Teachers will be able to edit marks for "${pendingLock.name}" again, and the class teacher will need to confirm them once more. Every change is recorded in the change history.`
              : `Teachers will no longer be able to enter or edit marks for "${pendingLock.name}" (${classLabelOf(pendingLock)}).${pendingLock.readyAt ? "" : " The class teacher hasn't marked it ready yet."} You can unlock it later for corrections.`
          }
          confirmLabel={pendingLock.isLocked ? "Unlock" : "Lock marks"}
          tone={pendingLock.isLocked ? "danger" : "primary"}
          isLoading={lockingId === pendingLock.id}
          onCancel={() => setPendingLock(null)}
          onConfirm={() => toggleLock(pendingLock)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this exam?"
          message={`"${pendingDelete.name}" will be removed for ${classLabelOf(pendingDelete)}, with its max marks and date sheet. No marks have been entered.`}
          confirmLabel="Delete"
          isLoading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await deleteExam(pendingDelete.id).unwrap();
              toast.success("Exam deleted");
            } catch (err) {
              toast.error(getErrorMessage(err, "Couldn't delete the exam"));
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      )}

      {bulk && (
        <ConfirmDialog
          title={`${bulk.action === "lock" ? "Lock marks" : "Publish marks"} for ${bulk.exams.length} class${bulk.exams.length === 1 ? "" : "es"}?`}
          message={
            bulk.action === "lock"
              ? `Teachers can no longer enter or edit marks for ${bulk.exams[0].name} in these classes.${bulk.exams.some((e) => !e.readyAt) ? ` ${bulk.exams.filter((e) => !e.readyAt).length} of them aren't marked ready by the class teacher yet.` : ""}`
              : `Students of these classes will see their ${bulk.exams[0].name} marks, and marks are locked as they are. Classes with no marks are left out.`
          }
          confirmLabel={bulk.action === "lock" ? "Lock all" : "Publish all"}
          tone="primary"
          isLoading={bulkBusy}
          onCancel={() => setBulk(null)}
          onConfirm={runBulk}
        />
      )}
    </div>
  );
};

export default AdminExamsPage;
