import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, ConfirmDialog, EmptyState, Icon, PageHeader, Spinner } from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useGetClassRosterQuery } from "../../../../store/api/teaching.api";
import { useGetMyProfileQuery } from "../../../../store/api/profile.api";
import { useGetExamProgressQuery, useGetExamsQuery } from "../../../../store/api/exams.api";
import { EXAM_TYPE_LABEL, useDeleteExamMutation, useGetDateSheetsQuery, useGetExamMetaQuery, useGetSchemesQuery, useSetExamReadyMutation } from "../../../../store/api/examPlan.api";
import { DateSheetTable } from "../../../../components/shared/DateSheet/DateSheet";
import ExamResultsView from "../../admin/Exams/ExamResultsView";
import ClassResultView from "../../admin/Exams/ClassResultView";
import MarksEntry from "./MarksEntry";
import NewClassTestSheet from "./NewClassTestSheet";
import AssessmentEntry from "./AssessmentEntry";
import SubjectResults from "./SubjectResults";
import styles from "./TeacherExams.module.css";

const classLabel = (c?: { className: string; section: string } | null) => (c ? `${c.className} - ${c.section}` : "");

const statusOf = (exam: IExam) =>
  exam.resultsPublished
    ? { label: "Published", tone: "success" as const }
    : exam.isLocked
      ? { label: "Locked", tone: "warning" as const }
      : { label: "Marks open", tone: "info" as const };

const deadlinePassed = (exam: IExam) => !!exam.marksDeadline && new Date(exam.marksDeadline) < new Date();
const deadlineText = (exam: IExam) => (exam.marksDeadline ? new Date(exam.marksDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "");
const TYPE_TABS = [
  ["", "All"],
  ["TERM_EXAM", "Term exams"],
  ["PERIODIC_TEST", "Periodic tests"],
  ["CLASS_TEST", "Class tests"],
] as const;

// Teacher exams (phone first). Who can do what — mirrors the server rules:
//  - The exam coordinator plans term exams and periodic tests (Exam planner).
//  - Subject teacher: enters marks for their subjects, sets max marks for their periodic and
//    class tests, creates class tests (progress only), and fills the term's periodic
//    assessment (notebook, enrichment..., and an adjustable final mark out of 20).
//  - Class teacher: follows every subject's progress, marks an exam "ready" when all marks
//    are in, writes term remarks and co-scholastic grades, and sees the term results.
// Screens are kept in the URL (?classSectionId, exam, subject, view) so the phone's back
// button steps back through them.
const TeacherExamsPage = () => {
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const [typeTab, setTypeTab] = useState("");
  const { data: meta } = useGetExamMetaQuery();
  const { data: schemes } = useGetSchemesQuery();

  const { data: classes, isLoading: classesLoading } = useGetMyClassSectionsQuery();
  const { data: me } = useGetMyProfileQuery();
  const staffId = me?.staff?.id;

  const csParam = Number(params.get("classSectionId"));
  const cls = classes?.find((c) => c.id === csParam) ?? classes?.[0];
  const csId = cls?.id;
  const examId = Number(params.get("exam")) || null;
  const subjectId = Number(params.get("subject")) || null;
  const view = params.get("view");

  const go = (next: Record<string, string | number | null>, replace = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p, { replace });
  };

  // Keep a valid class in the URL.
  useEffect(() => {
    if (csId && csParam !== csId) go({ classSectionId: csId }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csId]);

  const { data: exams, isLoading: examsLoading } = useGetExamsQuery({ classSectionId: csId ?? 0 }, { skip: !csId });
  const { data: subjects } = useGetSubjectsQuery({ classSectionId: csId ?? 0 }, { skip: !csId });
  const { data: roster } = useGetClassRosterQuery(csId ?? 0, { skip: !csId || !examId });

  const isClassTeacher = !!cls?.isClassTeacher;
  const mySubjects = useMemo(
    () => (subjects ?? []).filter((s) => staffId && s.teacherSubjects?.some((t) => t.staffId === staffId)),
    [subjects, staffId]
  );
  // Other teachers' class tests aren't this teacher's work (the class teacher follows them all).
  const myExams = useMemo(
    () => (exams ?? []).filter((e) => e.type !== "CLASS_TEST" || isClassTeacher || mySubjects.some((s) => s.id === e.subjectId)),
    [exams, isClassTeacher, mySubjects]
  );
  const shownExams = myExams.filter((e) => !typeTab || (e.type ?? "TERM_EXAM") === typeTab);
  const typesPresent = new Set(myExams.map((e) => e.type ?? "TERM_EXAM"));
  const exam = exams?.find((e) => e.id === examId) ?? null;
  const subject = mySubjects.find((s) => s.id === subjectId) ?? null;
  const students = roster?.students ?? [];
  const scheme = schemes?.find((s) => cls && s.classNames.includes(cls.className));
  const terms = scheme?.terms ?? 2;
  const coordinator = !!meta?.permissions.coordinator;

  if (classesLoading) {
    return (
      <div>
        <PageHeader title="Exams" />
        <Spinner />
      </div>
    );
  }
  if (!classes?.length || !cls) {
    return (
      <div>
        <PageHeader title="Exams" />
        <EmptyState
          title="No classes yet"
          description="You'll see exams here once you're made a class teacher or given a subject to teach."
          action={
            coordinator ? (
              <Link to="/teacher/exam-planner">
                <Button variant="outline">Open the exam planner</Button>
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  // ---- Deeper screens ----
  if (view === "assessment" && subject && csId) {
    return <AssessmentEntry classSectionId={csId} subject={subject} terms={terms} onBack={() => go({ view: null, subject: null })} />;
  }
  if (view === "termresults" && isClassTeacher && csId) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backBtn} onClick={() => go({ view: null })}>
          <Icon name="arrowLeft" size={16} /> Exams
        </button>
        <ClassResultView classSectionId={csId} />
      </div>
    );
  }
  if (exam && view === "class" && isClassTeacher) {
    return <ExamResultsView examId={exam.id} onBack={() => go({ view: null })} />;
  }
  if (exam && subject && (view === "marks" || view === "results")) {
    if (!roster) return <Spinner />;
    return view === "marks" ? (
      <MarksEntry exam={exam} subject={subject} students={students} coordinator={coordinator} onDone={() => go({ view: null, subject: null })} />
    ) : (
      <SubjectResults exam={exam} subject={subject} students={students} onBack={() => go({ view: null, subject: null })} />
    );
  }
  if (exam) {
    return (
      <>
        <ExamDetail
          exam={exam}
          classText={classLabel(cls)}
          isClassTeacher={isClassTeacher}
          coordinator={coordinator}
          onBack={() => go({ exam: null, view: null, subject: null })}
          onEnter={(sid) => go({ subject: sid, view: "marks" })}
          onSubjectResults={(sid) => go({ subject: sid, view: "results" })}
          onClassResults={() => go({ view: "class" })}
        />
      </>
    );
  }

  // ---- Exam list ----
  return (
    <div className={styles.page}>
      <PageHeader
        title="Exams"
        subtitle="Enter marks, class tests and periodic assessment for your classes"
        actions={
          meta?.permissions.coordinator ? (
            <Link to="/teacher/exam-planner">
              <Button variant="outline" icon={<Icon name="layers" />}>
                Exam planner
              </Button>
            </Link>
          ) : undefined
        }
      />

      {classes.length > 1 && (
        <div className={styles.chips} role="tablist" aria-label="My classes">
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === csId}
              className={`${styles.chip} ${c.id === csId ? styles.chipActive : ""}`}
              onClick={() => go({ classSectionId: c.id, exam: null, subject: null, view: null })}
            >
              <strong>{classLabel(c)}</strong>
              <small>{c.isClassTeacher ? "Class teacher" : "Subject teacher"}</small>
            </button>
          ))}
        </div>
      )}

      <div className={styles.roleNote}>
        <span className={styles.roleIcon}>
          <Icon name={isClassTeacher ? "star" : "edit"} size={16} />
        </span>
        <span>
          {isClassTeacher ? (
            <>
              <b>You&apos;re the class teacher of {classLabel(cls)}.</b> Follow every subject&apos;s marks, mark exams ready, write term remarks and see the term results.
              {mySubjects.length > 0 && <> You also enter marks for {mySubjects.map((s) => s.name).join(", ")}.</>}
            </>
          ) : (
            <>
              <b>You teach {mySubjects.length ? mySubjects.map((s) => s.name).join(", ") : "a subject"} in {classLabel(cls)}.</b> Enter and view marks for{" "}
              {mySubjects.length === 1 ? "this subject" : "these subjects"} only, create class tests and fill the periodic assessment. The exam coordinator plans term exams and periodic tests.
            </>
          )}
        </span>
      </div>

      <section className={styles.panel}>
        <div className={styles.listHead} style={{ marginBottom: "0.7rem" }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            Exams · {classLabel(cls)}
          </h2>
          {mySubjects.length > 0 && (
            <Button icon={<Icon name="plus" />} onClick={() => setNewOpen(true)}>
              New class test
            </Button>
          )}
        </div>

        {examsLoading ? (
          <Spinner />
        ) : !myExams.length ? (
          <EmptyState
            title="No exams yet"
            description="Exams set up by the exam coordinator, and your class tests, will appear here."
            action={mySubjects.length ? <Button onClick={() => setNewOpen(true)}>New class test</Button> : undefined}
          />
        ) : (
          <>
          {typesPresent.size > 1 && (
            <div className={styles.typeTabs} role="tablist" aria-label="Exam type">
              {TYPE_TABS.filter(([k]) => !k || typesPresent.has(k)).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={typeTab === k} className={`${styles.preset} ${typeTab === k ? styles.presetOn : ""}`} onClick={() => setTypeTab(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <ul className={styles.examList}>
            {shownExams.map((e) => {
              const st = statusOf(e);
              return (
                <li key={e.id}>
                  <button type="button" className={styles.examCard} onClick={() => go({ exam: e.id })}>
                    <span className={styles.examIcon}>
                      <Icon name="fileText" size={18} />
                    </span>
                    <span className={styles.examMain}>
                      <span className={styles.examName}>{e.name}</span>
                      <span className={styles.examMeta}>
                        {EXAM_TYPE_LABEL[e.type ?? "TERM_EXAM"]}
                        {e.type === "CLASS_TEST"
                          ? ` · ${subjects?.find((s) => s.id === e.subjectId)?.name ?? ""}${e.testDate ? ` · ${new Date(e.testDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}` : ""}`
                          : ` · Term ${e.term ?? 1}`}
                        {e.marksDeadline && !e.isLocked ? ` · ${deadlinePassed(e) ? "deadline was" : "marks by"} ${deadlineText(e)}` : ""}
                      </span>
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <Icon name="chevronRight" size={18} className={styles.chev} />
                  </button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>

      {(mySubjects.length > 0 || isClassTeacher) && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Term results</h2>
          <div className={styles.actionsGrid}>
            {mySubjects.map((s) => (
              <button key={s.id} type="button" className={styles.bigAction} onClick={() => go({ view: "assessment", subject: s.id })}>
                <span className={styles.examIcon}>
                  <Icon name="edit" size={18} />
                </span>
                <span>
                  <b>{s.name} · periodic assessment</b>
                  <small>Notebook, enrichment and the final mark out of {scheme?.paMax ?? 20}</small>
                </span>
              </button>
            ))}
            {isClassTeacher && (
              <button type="button" className={styles.bigAction} onClick={() => go({ view: "termresults" })}>
                <span className={styles.examIcon}>
                  <Icon name="graduationCap" size={18} />
                </span>
                <span>
                  <b>Term results &amp; remarks</b>
                  <small>Every student&apos;s term result, remarks and co-scholastic grades</small>
                </span>
              </button>
            )}
          </div>
        </section>
      )}

      {newOpen && (
        <NewClassTestSheet
          classSection={{ id: cls.id, label: classLabel(cls) }}
          subjects={mySubjects.map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setNewOpen(false)}
          onCreated={(e, sid) => {
            setNewOpen(false);
            go({ exam: e.id, subject: sid, view: "marks" });
          }}
        />
      )}
    </div>
  );
};

// One exam: where it stands, the subjects you can work on, and (class teacher) every
// subject's progress plus class results and remarks.
const ExamDetail = ({
  exam,
  classText,
  isClassTeacher,
  coordinator,
  onBack,
  onEnter,
  onSubjectResults,
  onClassResults,
}: {
  exam: IExam;
  classText: string;
  isClassTeacher: boolean;
  coordinator: boolean;
  onBack: () => void;
  onEnter: (subjectId: number) => void;
  onSubjectResults: (subjectId: number) => void;
  onClassResults: () => void;
}) => {
  const { data: progress, isLoading } = useGetExamProgressQuery(exam.id, { refetchOnMountOrArgChange: true });
  const [setReady, { isLoading: settingReady }] = useSetExamReadyMutation();
  const [deleteExam, { isLoading: deleting }] = useDeleteExamMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: dateSheets } = useGetDateSheetsQuery({ classSectionId: exam.classSectionId }, { skip: exam.type === "CLASS_TEST" });
  const dateSheet = dateSheets?.find((d) => d.examId === exam.id);
  const toggleReady = async () => {
    try {
      await setReady({ examId: exam.id, ready: !exam.readyAt }).unwrap();
      toast.success(exam.readyAt ? "Marked as not ready" : "Marked ready. The exam coordinator can now lock the marks.");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't update");
    }
  };
  const removeTest = async () => {
    try {
      await deleteExam(exam.id).unwrap();
      toast.success("Class test deleted");
      onBack();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't delete the test");
      setConfirmDelete(false);
    }
  };
  const st = statusOf(exam);
  const total = progress?.totalStudents ?? 0;
  // A class test has one subject.
  const subjects = (progress?.subjects ?? []).filter((s) => !exam.subjectId || s.subjectId === exam.subjectId);
  const mine = subjects.filter((s) => s.isMine);
  const others = subjects.filter((s) => !s.isMine);
  const complete = subjects.filter((s) => total > 0 && s.entered >= total).length;
  const allIn = subjects.length > 0 && complete === subjects.length;
  const anyEntered = subjects.some((s) => s.entered > 0);
  const locked = !!exam.isLocked;
  const classTest = exam.type === "CLASS_TEST";
  // Past the deadline only the coordinator can still enter marks (same rule as the server).
  const closed = locked || (deadlinePassed(exam) && !coordinator);

  const Bar = ({ entered }: { entered: number }) => (
    <div className={`${styles.bar} ${total && entered >= total ? styles.barDone : ""}`}>
      <span style={{ width: `${total ? Math.round((entered / total) * 100) : 0}%` }} />
    </div>
  );

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        <Icon name="arrowLeft" size={16} /> All exams
      </button>
      <div className={styles.detailHead}>
        <div>
          <h1 className={styles.detailTitle}>{exam.name}</h1>
          <p className={styles.muted} style={{ margin: "0.15rem 0 0" }}>
            {classText} · {EXAM_TYPE_LABEL[exam.type ?? "TERM_EXAM"]}
            {exam.type !== "CLASS_TEST" ? ` · Term ${exam.term ?? 1}` : " · progress only, students see marks at once"}
            {exam.marksDeadline && !exam.isLocked ? ` · marks by ${deadlineText(exam)}` : ""}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <ol className={styles.steps} aria-label="Exam progress">
        <li className={`${styles.step} ${styles.stepDone}`}>
          <span className={styles.stepNum}>✓</span>
          <b>{exam.type === "CLASS_TEST" ? "Test created" : "Exam planned"}</b>
        </li>
        <li className={`${styles.step} ${locked || (classTest && allIn) ? styles.stepDone : styles.stepNow}`}>
          <span className={styles.stepNum}>{locked || (classTest && allIn) ? "✓" : 2}</span>
          <b>Marks entry</b>
          {isClassTeacher && progress ? `${complete}/${subjects.length} subjects done` : "Teachers enter marks"}
        </li>
        <li className={`${styles.step} ${exam.resultsPublished || (classTest && anyEntered) ? styles.stepDone : locked ? styles.stepNow : ""}`}>
          <span className={styles.stepNum}>{exam.resultsPublished || (classTest && anyEntered) ? "✓" : 3}</span>
          <b>Results</b>
          {exam.type === "CLASS_TEST" ? "Visible to students as saved" : exam.resultsPublished ? "Published to families" : "Coordinator locks, Principal publishes"}
        </li>
      </ol>

      {dateSheet && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Date sheet</h2>
          <DateSheetTable exam={dateSheet} />
        </section>
      )}

      {locked && <div className={styles.notice}>Marks are locked{exam.lockedByUser ? ` by ${exam.lockedByUser.name}` : ""}, so they can be viewed but not changed.</div>}
      {!locked && closed && <div className={styles.notice}>The marks deadline ({deadlineText(exam)}) has passed. Ask the exam coordinator to extend it.</div>}

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>My subjects</h2>
            {mine.length === 0 ? (
              <p className={styles.muted} style={{ margin: 0 }}>
                {isClassTeacher ? "You don't teach a subject with a paper in this exam. Subject teachers enter their own marks." : "None of your subjects has a paper in this exam."}
              </p>
            ) : (
              <ul className={styles.subjects}>
                {mine.map((s) => (
                  <li key={s.subjectId} className={styles.subjectRow}>
                    <span className={styles.subjectMain}>
                      <span className={styles.subjectName}>{s.name}</span>
                      <Bar entered={s.entered} />
                      <span className={styles.count}>
                        {s.entered} of {total} entered
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      <Button size="sm" onClick={() => onEnter(s.subjectId)}>
                        {closed ? "View marks" : s.entered ? "Edit marks" : "Enter marks"}
                      </Button>
                      {s.entered > 0 && !isClassTeacher && (
                        <Button size="sm" variant="outline" onClick={() => onSubjectResults(s.subjectId)}>
                          Results
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isClassTeacher && (
            <>
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>All subjects · class teacher view</h2>
                {others.length === 0 ? (
                  <p className={styles.muted} style={{ margin: 0 }}>
                    {subjects.length ? "You teach every subject with a paper in this exam." : "No papers have been set for this exam yet."}
                  </p>
                ) : (
                  <ul className={styles.subjects}>
                    {others.map((s) => (
                      <li key={s.subjectId} className={styles.subjectRow}>
                        <span className={styles.subjectMain}>
                          <span className={styles.subjectName}>{s.name}</span>
                          <span className={styles.subjectTeacher}>{s.teachers.length ? s.teachers.join(", ") : "No teacher allocated"}</span>
                          <Bar entered={s.entered} />
                        </span>
                        <span className={styles.count}>
                          {s.entered}/{total}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className={styles.actionsGrid}>
                {exam.type !== "CLASS_TEST" && !locked && (
                  <button type="button" className={styles.bigAction} onClick={toggleReady} disabled={settingReady || (!exam.readyAt && !allIn)}>
                    <span className={styles.examIcon}>
                      <Icon name={exam.readyAt ? "check" : "clipboardCheck"} size={18} />
                    </span>
                    <span>
                      <b>{exam.readyAt ? "Marked ready ✓" : "Mark marks as ready"}</b>
                      <small>{exam.readyAt ? "Tap to take it back" : allIn ? "Tell the coordinator all marks are in" : `Available when every subject is complete (${complete}/${subjects.length} done)`}</small>
                    </span>
                  </button>
                )}
                <button type="button" className={styles.bigAction} onClick={onClassResults}>
                  <span className={styles.examIcon}>
                    <Icon name="graduationCap" size={18} />
                  </span>
                  <span>
                    <b>Exam results</b>
                    <small>All subjects, toppers and merit list (staff only)</small>
                  </span>
                </button>
              </div>
            </>
          )}

          {classTest && mine.length > 0 && (
            <button type="button" className={styles.dangerLink} onClick={() => setConfirmDelete(true)}>
              Delete this class test
            </button>
          )}
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this class test?"
          message={`"${exam.name}" and any marks saved for it will be removed. Students will no longer see it.`}
          confirmLabel="Delete"
          isLoading={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={removeTest}
        />
      )}
    </div>
  );
};

export default TeacherExamsPage;
