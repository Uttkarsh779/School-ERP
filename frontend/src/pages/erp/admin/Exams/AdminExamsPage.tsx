import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";
import type { SelectOption } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import {
  useEnterExamResultsMutation,
  useGetExamResultsQuery,
  useGetExamsQuery,
  useSetExamLockMutation,
  useSetResultsPublishedMutation,
  type EnterExamResultInput,
} from "../../../../store/api/exams.api";
import styles from "./AdminExamsPage.module.css";
import ExamResultsView from "./ExamResultsView";
import AdmitCardModal from "./AdmitCardModal";
import PlanExamModal from "./PlanExamModal";
import ExamSubjectsModal from "./ExamSubjectsModal";
import ResultsTab from "./ResultsTab";
import SchemesTab from "./SchemesTab";
import { EXAM_TYPE_LABEL, useGetExamMetaQuery, useGetExamPlanQuery, type PlanGroup } from "../../../../store/api/examPlan.api";
import { isAbsentText, validateMarksCell } from "./marksCell";

interface MarksCell {
  marksObtained: string;
  maxMarks: string;
}

const cellKey = (studentId: number, subjectId: number) => `${studentId}:${subjectId}`;

type StatusFilter = "all" | "open" | "locked" | "published";
const statusOf = (e: IExam): Exclude<StatusFilter, "all"> => (e.resultsPublished ? "published" : e.isLocked ? "locked" : "open");
const STATUS_LABEL: Record<Exclude<StatusFilter, "all">, string> = { open: "Marks entry open", locked: "Marks locked", published: "Published" };
// Class names are stored either as "10" or "Class 10"; show "Class 10 - A" either way
// (and "Nursery - A", not "Class Nursery - A").
const classLabelOf = (e: IExam) => {
  if (!e.classSection) return "Class not set";
  const name = e.classSection.className.replace(/^class\s*/i, "");
  return `${/^\d/.test(name) ? `Class ${name}` : name} - ${e.classSection.section}`;
};
// Letters and digits only, so "9-A", "9 a", "Class 9A" and "class 9 - a" all match each other.
const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const PAGE = 20;
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
const shortDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

// Exam coordinator's page (admins, and teachers given the permission): plan exams for many
// classes, set max marks, date sheets and admit cards, lock marks; the Super Admin /
// Principal publish. Marks are entered by subject teachers on their own Exams page, so the
// marks grid here is read-only. Tabs: Exams, Results (term/final), Schemes.
const AdminExamsPage = () => {
  // Marks entry happens on the teacher's Exams page; here they are only reviewed.
  const isTeacher = false;
  const { data: meta } = useGetExamMetaQuery();
  const coordinator = !!meta?.permissions.coordinator;
  const publisher = !!meta?.permissions.publisher;
  const { data: plan } = useGetExamPlanQuery(undefined, { skip: !coordinator });
  const [params, setParams] = useSearchParams();
  const pageTab = ((["exams", "results", "schemes"] as const).find((k) => k === params.get("tab")) ?? "exams") as PageTab;
  const [typeFilter, setTypeFilter] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<PlanGroup | null>(null);
  const [subjectsExam, setSubjectsExam] = useState<IExam | null>(null);

  const [classSectionId, setClassSectionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shown, setShown] = useState(PAGE);
  const [selectedExam, setSelectedExam] = useState<IExam | null>(null);
  const [marks, setMarks] = useState<Record<string, MarksCell>>({});
  const [lastOutcomes, setLastOutcomes] = useState<IExamResultOutcome[] | null>(null);
  const [resultsExamId, setResultsExamId] = useState<number | null>(null);
  const [admitExamId, setAdmitExamId] = useState<number | null>(null);
  const [pendingPublish, setPendingPublish] = useState<IExam | null>(null);
  const [setPublished, { isLoading: publishing }] = useSetResultsPublishedMutation();
  const [pendingLock, setPendingLock] = useState<IExam | null>(null);
  const [lockingId, setLockingId] = useState<number | null>(null);
  const [setExamLock] = useSetExamLockMutation();

  const toggleLock = async (exam: IExam) => {
    setLockingId(exam.id);
    try {
      await setExamLock({ examId: exam.id, locked: !exam.isLocked }).unwrap();
      toast.success(exam.isLocked ? "Marks unlocked — teachers can edit again." : "Marks locked — teachers can no longer edit.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the lock."));
    } finally {
      setLockingId(null);
      setPendingLock(null);
    }
  };

  const examCsId = selectedExam?.classSectionId;

  const { data: classSections } = useGetClassSectionsQuery();

  // All exams are loaded once; class, status and search filter them instantly in the browser.
  const { data: exams, isLoading: isLoadingExams, isError: examsError, refetch: refetchExams } = useGetExamsQuery();

  const { data: subjects } = useGetSubjectsQuery({ classSectionId: examCsId ?? 0 }, { skip: !selectedExam });
  const { data: students, isLoading: isLoadingStudents } = useGetStudentsQuery(
    { classSectionId: examCsId ?? 0 },
    { skip: !selectedExam }
  );
  const { data: existingResults, isLoading: isLoadingResults } = useGetExamResultsQuery(selectedExam?.id ?? 0, {
    skip: !selectedExam,
  });

  const [enterResults, { isLoading: isSavingMarks }] = useEnterExamResultsMutation();

  useEffect(() => {
    if (!existingResults) return;
    const seeded: Record<string, MarksCell> = {};
    for (const result of existingResults) {
      seeded[cellKey(result.studentId, result.subjectId)] = {
        marksObtained: result.isAbsent ? "AB" : String(result.marksObtained),
        maxMarks: String(result.maxMarks),
      };
    }
    setMarks(seeded);
  }, [existingResults]);

  const currentClassSection = classSections?.find((cs) => cs.id === examCsId);

  const openMarksEntry = (exam: IExam) => {
    setSelectedExam(exam);
    setMarks({});
    setLastOutcomes(null);
  };

  const closeMarksEntry = () => {
    setSelectedExam(null);
    setMarks({});
    setLastOutcomes(null);
  };

  const setCell = (studentId: number, subjectId: number, field: keyof MarksCell, value: string) => {
    if (!isTeacher) return;
    const key = cellKey(studentId, subjectId);
    setMarks((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { marksObtained: "", maxMarks: "" }), [field]: value },
    }));
  };

  const handleSaveMarks = async () => {
    if (!isTeacher) {
      toast.error("Only teachers assigned to teach subjects in this class can enter or modify marks.");
      return;
    }
    if (!selectedExam || !students || !subjects) return;

    const results: EnterExamResultInput[] = [];
    for (const student of students) {
      for (const subject of subjects) {
        const cell = marks[cellKey(student.id, subject.id)];
        if (!cell || cell.marksObtained.trim() === "" || cell.maxMarks === "") continue;
        const error = validateMarksCell(cell.marksObtained, cell.maxMarks);
        if (error) {
          toast.error(`${student.name} — ${subject.name}: ${error}`);
          return;
        }
        const absent = isAbsentText(cell.marksObtained);
        results.push({
          studentId: student.id,
          subjectId: subject.id,
          marksObtained: absent ? 0 : Number(cell.marksObtained),
          maxMarks: Number(cell.maxMarks),
          isAbsent: absent,
        });
      }
    }

    if (results.length === 0) {
      toast.error("Enter at least one student's marks before saving.");
      return;
    }

    try {
      const outcomes = await enterResults({ examId: selectedExam.id, results }).unwrap();
      setLastOutcomes(outcomes);
      const failures = outcomes.filter((o) => !o.success);
      if (failures.length === 0) {
        toast.success("Marks saved successfully.");
      } else {
        toast.error(`${failures.length} of ${outcomes.length} result(s) could not be saved.`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save marks."));
    }
  };

  // Exams grouped by class in school order, then section, then the order they were created.
  const sortedExams = useMemo(
    () =>
      [...(exams ?? [])].sort(
        (a, b) => classRank(a) - classRank(b) || classLabelOf(a).localeCompare(classLabelOf(b), undefined, { numeric: true }) || a.id - b.id
      ),
    [exams]
  );
  const classFilterOptions: SelectOption[] = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of sortedExams) if (!seen.has(e.classSectionId)) seen.set(e.classSectionId, classLabelOf(e));
    return [{ label: "All classes", value: "" }, ...[...seen].map(([id, label]) => ({ label, value: String(id) }))];
  }, [sortedExams]);

  const inClass = useMemo(
    () => sortedExams.filter((e) => (!classSectionId || e.classSectionId === Number(classSectionId)) && (!typeFilter || (e.type ?? "TERM_EXAM") === typeFilter)),
    [sortedExams, classSectionId, typeFilter]
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
  const visibleExams = filteredExams.slice(0, shown);
  const filtersActive = !!(classSectionId || searchQuery.trim() || statusFilter !== "all" || typeFilter);
  useEffect(() => setShown(PAGE), [classSectionId, searchQuery, statusFilter, typeFilter]);
  const clearFilters = () => {
    setTypeFilter("");
    setClassSectionId("");
    setSearchQuery("");
    setStatusFilter("all");
  };

  const studentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (students ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [students]);

  const failures = (lastOutcomes ?? []).filter((o) => !o.success);

  if (resultsExamId !== null) {
    return <ExamResultsView examId={resultsExamId} onBack={() => setResultsExamId(null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Plan exams, check marks, and publish term and final results"
        actions={
          !selectedExam && coordinator && pageTab === "exams" ? (
            <Button type="button" icon={<Icon name="plus" size={16} />} onClick={() => setPlanOpen(true)}>
              Plan exam
            </Button>
          ) : undefined
        }
      />

      {!selectedExam && (
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
      )}

      {!selectedExam && pageTab === "results" && <ResultsTab />}
      {!selectedExam && pageTab === "schemes" && <SchemesTab />}

      {!selectedExam && pageTab === "exams" && (
        <div className={styles.listPage}>
          {/* How an exam moves along: what each status means */}
          <p className={styles.flowHint}>
            <span>Coordinator plans exam</span>
            <Icon name="chevronRight" size={14} />
            <span>Teachers enter marks</span>
            <Icon name="chevronRight" size={14} />
            <span>Class teacher marks ready</span>
            <Icon name="chevronRight" size={14} />
            <span>Coordinator locks</span>
            <Icon name="chevronRight" size={14} />
            <span>Principal publishes</span>
          </p>

          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <Input
                label="Search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Exam or class, e.g. Half Yearly 9-A"
              />
            </div>
            <div className={styles.classBox}>
              <Select label="Class" options={classFilterOptions} value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)} />
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
          ) : filteredExams.length === 0 ? (
            <EmptyState
              title={filtersActive ? "No exams match" : "No exams yet"}
              description={filtersActive ? "Try another class, type, status or search." : "Set up the first exam with Plan exam."}
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
              <p className={styles.resultCount}>
                {filteredExams.length} exam{filteredExams.length === 1 ? "" : "s"}
                {filtersActive && (
                  <button type="button" className={styles.linkBtn} onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </p>
              <ul className={styles.examList}>
                {visibleExams.map((exam) => {
                  const status = statusOf(exam);
                  return (
                    <li key={exam.id} className={styles.examRow}>
                      <div className={styles.examInfo}>
                        <div className={styles.examTitle}>
                          <strong>{exam.name}</strong>
                          <Badge tone={status === "published" ? "success" : status === "locked" ? "warning" : "info"}>{STATUS_LABEL[status]}</Badge>
                        </div>
                        <div className={styles.examMeta}>
                          <span className={styles.classPill}>{classLabelOf(exam)}</span>
                          <span>{EXAM_TYPE_LABEL[exam.type ?? "TERM_EXAM"]}</span>
                          {exam.type !== "CLASS_TEST" && <span>Term {exam.term ?? 1}</span>}
                          {exam.testDate && <span>{shortDate(exam.testDate)}</span>}
                          {exam.marksDeadline && !exam.isLocked && <span>Marks by {shortDate(exam.marksDeadline)}</span>}
                          {exam.readyAt && !exam.isLocked && <span className={styles.readyPill}>✓ Class teacher: ready</span>}
                        </div>
                      </div>
                      <div className={styles.examActions}>
                        <div className={styles.quiet}>
                          <button type="button" className={styles.quietBtn} onClick={() => openMarksEntry(exam)}>
                            Marks
                          </button>
                          <button type="button" className={styles.quietBtn} onClick={() => setResultsExamId(exam.id)}>
                            Results
                          </button>
                          {coordinator && exam.type !== "CLASS_TEST" && (
                            <button type="button" className={styles.quietBtn} onClick={() => setSubjectsExam(exam)}>
                              Max marks
                            </button>
                          )}
                          {coordinator && exam.admitCard && (
                            <button type="button" className={styles.quietBtn} onClick={() => setAdmitExamId(exam.id)}>
                              Admit cards
                            </button>
                          )}
                          {coordinator && exam.groupKey && plan?.some((g) => g.groupKey === exam.groupKey) && (
                            <button type="button" className={styles.quietBtn} onClick={() => setEditGroup(plan.find((g) => g.groupKey === exam.groupKey) ?? null)}>
                              Edit
                            </button>
                          )}
                          {coordinator && exam.type !== "CLASS_TEST" && status !== "published" && (
                            <button type="button" className={styles.quietBtn} disabled={lockingId === exam.id} onClick={() => setPendingLock(exam)}>
                              {exam.isLocked ? "Unlock" : "Lock"}
                            </button>
                          )}
                        </div>
                        {publisher && exam.type !== "CLASS_TEST" && (
                          <Button type="button" size="sm" variant={status === "published" ? "outline" : "primary"} onClick={() => setPendingPublish(exam)}>
                            {status === "published" ? "Unpublish" : "Publish marks"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {filteredExams.length > shown && (
                <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({filteredExams.length - shown})
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {selectedExam && (
        <Card
          title={`${selectedExam.name} — ${isTeacher ? "Marks Entry Grid" : "Marks Review (Read-Only)"}`}
          subtitle={currentClassSection ? `${currentClassSection.className} - ${currentClassSection.section}` : undefined}
          action={
            <Button type="button" variant="outline" size="sm" onClick={closeMarksEntry}>
              ← All exams
            </Button>
          }
        >
          {!isTeacher && (
            <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem 1rem", borderRadius: "var(--erp-radius-sm)", marginBottom: "1.25rem", color: "var(--erp-text-muted)", fontSize: "0.88rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
              <span>
                <strong>Read-only:</strong> subject teachers enter marks from their own Exams page.
              </span>
            </div>
          )}

          {failures.length > 0 && (
            <div className={styles.failureBox}>
              <p className={styles.failureTitle}>Some results could not be saved</p>
              <ul className={styles.failureList}>
                {failures.map((f) => (
                  <li key={cellKey(f.studentId, f.subjectId)}>
                    <strong>{studentNameById.get(f.studentId) ?? `Student #${f.studentId}`}</strong>: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoadingStudents || isLoadingResults || !subjects ? (
            <Spinner />
          ) : !students || students.length === 0 ? (
            <EmptyState
              title="No students in this class"
              description="Once students are added to this class section, they'll show up here for marks entry."
            />
          ) : subjects.length === 0 ? (
            <EmptyState
              title="No subjects for this class"
              description="Add subjects to this class section before entering marks."
            />
          ) : (
            <>
              <div className={styles.gridWrapper}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Roll No</th>
                      <th className={styles.stickyCol2}>Student</th>
                      {subjects.map((subject) => (
                        <th key={subject.id} colSpan={2} className={styles.subjectHeader}>
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={styles.stickyCol} />
                      <th className={styles.stickyCol2} />
                      {subjects.map((subject) => (
                        <Fragment key={subject.id}>
                          <th className={styles.subHeader}>Marks</th>
                          <th className={styles.subHeader}>Max</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td className={styles.stickyCol}>{student.rollNo}</td>
                        <td className={styles.stickyCol2}>{student.name}</td>
                        {subjects.map((subject) => {
                          const cell = marks[cellKey(student.id, subject.id)] ?? { marksObtained: "", maxMarks: "" };
                          return (
                            <Fragment key={subject.id}>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className={styles.cellInput}
                                  disabled={!isTeacher}
                                  value={cell.marksObtained}
                                  onChange={(e) => setCell(student.id, subject.id, "marksObtained", e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={styles.cellInput}
                                  min={0}
                                  disabled={!isTeacher}
                                  value={cell.maxMarks}
                                  onChange={(e) => setCell(student.id, subject.id, "maxMarks", e.target.value)}
                                />
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isTeacher && (
                <div className={styles.saveBar}>
                  <Button variant="primary" isLoading={isSavingMarks} onClick={handleSaveMarks}>
                    Save Marks
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {admitExamId !== null && <AdmitCardModal examId={admitExamId} onClose={() => setAdmitExamId(null)} />}
      {planOpen && <PlanExamModal onClose={() => setPlanOpen(false)} />}
      {editGroup && <PlanExamModal group={editGroup} onClose={() => setEditGroup(null)} />}
      {subjectsExam && <ExamSubjectsModal examId={subjectsExam.id} title={`${subjectsExam.name} · ${classLabelOf(subjectsExam)}`} onClose={() => setSubjectsExam(null)} />}

      {pendingPublish && (
        <ConfirmDialog
          title={pendingPublish.resultsPublished ? "Unpublish results?" : "Publish results?"}
          message={
            pendingPublish.resultsPublished
              ? `Students will no longer see their "${pendingPublish.name}" marks until you publish again.`
              : `Students will see their "${pendingPublish.name}" marks. Marks are locked when published. Term and final report cards are published from the "Term & final results" tab.`
          }
          confirmLabel={pendingPublish.resultsPublished ? "Unpublish" : "Publish"}
          tone={pendingPublish.resultsPublished ? "danger" : "primary"}
          isLoading={publishing}
          onCancel={() => setPendingPublish(null)}
          onConfirm={async () => {
            try {
              await setPublished({ examId: pendingPublish.id, published: !pendingPublish.resultsPublished }).unwrap();
              toast.success(pendingPublish.resultsPublished ? "Results unpublished" : "Results published — students can now see their report cards");
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
              ? `Teachers will be able to edit marks for "${pendingLock.name}" again. Every change is recorded in the change history.`
              : `Teachers will no longer be able to enter or edit marks for "${pendingLock.name}". You can unlock it later for corrections.`
          }
          confirmLabel={pendingLock.isLocked ? "Unlock" : "Lock marks"}
          tone={pendingLock.isLocked ? "danger" : "primary"}
          isLoading={lockingId === pendingLock.id}
          onCancel={() => setPendingLock(null)}
          onConfirm={() => toggleLock(pendingLock)}
        />
      )}

    </div>
  );
};

export default AdminExamsPage;
