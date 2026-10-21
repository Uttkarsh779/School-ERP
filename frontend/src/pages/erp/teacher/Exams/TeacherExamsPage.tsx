import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, Icon, PageHeader, Spinner } from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useGetClassRosterQuery } from "../../../../store/api/teaching.api";
import { useGetMyProfileQuery } from "../../../../store/api/profile.api";
import { useGetExamProgressQuery, useGetExamsQuery } from "../../../../store/api/exams.api";
import ExamResultsView from "../../admin/Exams/ExamResultsView";
import RemarksEditor from "../../admin/Exams/RemarksEditor";
import MarksEntry from "./MarksEntry";
import NewExamSheet from "./NewExamSheet";
import SubjectResults from "./SubjectResults";
import styles from "./TeacherExams.module.css";

const classLabel = (c?: { className: string; section: string } | null) => (c ? `${c.className} - ${c.section}` : "");

const statusOf = (exam: IExam) =>
  exam.resultsPublished
    ? { label: "Published", tone: "success" as const }
    : exam.isLocked
      ? { label: "Locked", tone: "warning" as const }
      : { label: "Marks open", tone: "info" as const };

// Teacher exams (phone first). Who can do what — mirrors the server rules:
//  - Class teacher: create exams for their class, track every subject's progress, see the
//    full class results and ranks, write report-card remarks, and enter their own subjects.
//  - Subject teacher: enter and see marks ONLY for the subjects they teach in that class.
// Screens are kept in the URL (?classSectionId, exam, subject, view) so the phone's back
// button steps back through them.
const TeacherExamsPage = () => {
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const [remarksExamId, setRemarksExamId] = useState<number | null>(null);

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
  const exam = exams?.find((e) => e.id === examId) ?? null;
  const subject = mySubjects.find((s) => s.id === subjectId) ?? null;
  const students = roster?.students ?? [];

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
        <EmptyState title="No classes yet" description="You'll see exams here once you're made a class teacher or given a subject to teach." />
      </div>
    );
  }

  // ---- Deeper screens ----
  if (exam && view === "class" && isClassTeacher) {
    return <ExamResultsView examId={exam.id} onBack={() => go({ view: null })} />;
  }
  if (exam && subject && (view === "marks" || view === "results")) {
    if (!roster) return <Spinner />;
    return view === "marks" ? (
      <MarksEntry exam={exam} subject={subject} students={students} onDone={() => go({ view: null, subject: null })} />
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
          onBack={() => go({ exam: null, view: null, subject: null })}
          onEnter={(sid) => go({ subject: sid, view: "marks" })}
          onSubjectResults={(sid) => go({ subject: sid, view: "results" })}
          onClassResults={() => go({ view: "class" })}
          onRemarks={() => setRemarksExamId(exam.id)}
        />
        {remarksExamId !== null && <RemarksEditor examId={remarksExamId} onClose={() => setRemarksExamId(null)} />}
      </>
    );
  }

  // ---- Exam list ----
  return (
    <div className={styles.page}>
      <PageHeader title="Exams" subtitle="Enter marks and follow results for your classes" />

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
              <b>You&apos;re the class teacher of {classLabel(cls)}.</b> Create exams, follow every subject&apos;s marks, see class results and add report remarks.
              {mySubjects.length > 0 && <> You also enter marks for {mySubjects.map((s) => s.name).join(", ")}.</>}
            </>
          ) : (
            <>
              <b>You teach {mySubjects.length ? mySubjects.map((s) => s.name).join(", ") : "a subject"} in {classLabel(cls)}.</b> Enter and view marks for{" "}
              {mySubjects.length === 1 ? "this subject" : "these subjects"} only. The class teacher creates the exams.
            </>
          )}
        </span>
      </div>

      <section className={styles.panel}>
        <div className={styles.listHead} style={{ marginBottom: "0.7rem" }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            Exams · {classLabel(cls)}
          </h2>
          {isClassTeacher && (
            <Button icon={<Icon name="plus" />} onClick={() => setNewOpen(true)}>
              New exam
            </Button>
          )}
        </div>

        {examsLoading ? (
          <Spinner />
        ) : !exams?.length ? (
          <EmptyState
            title="No exams yet"
            description={
              isClassTeacher
                ? "Create the first exam (e.g. Unit Test 1). Subject teachers will then see it and enter their marks."
                : `When the class teacher${roster?.classSection?.classTeacher ? ` (${roster.classSection.classTeacher})` : ""} creates an exam, it will appear here for you to enter marks.`
            }
            action={isClassTeacher ? <Button onClick={() => setNewOpen(true)}>Create exam</Button> : undefined}
          />
        ) : (
          <ul className={styles.examList}>
            {exams.map((e) => {
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
                        {e.session?.name ? `${e.session.name} · ` : ""}Pass {e.passPercentage ?? 33}%
                      </span>
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <Icon name="chevronRight" size={18} className={styles.chev} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {newOpen && (
        <NewExamSheet
          classSection={{ id: cls.id, label: classLabel(cls) }}
          sessionName={exams?.[0]?.session?.name}
          existingNames={(exams ?? []).map((e) => e.name)}
          onClose={() => setNewOpen(false)}
          onOpenExam={(e) => {
            setNewOpen(false);
            go({ exam: e.id });
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
  onBack,
  onEnter,
  onSubjectResults,
  onClassResults,
  onRemarks,
}: {
  exam: IExam;
  classText: string;
  isClassTeacher: boolean;
  onBack: () => void;
  onEnter: (subjectId: number) => void;
  onSubjectResults: (subjectId: number) => void;
  onClassResults: () => void;
  onRemarks: () => void;
}) => {
  const { data: progress, isLoading } = useGetExamProgressQuery(exam.id, { refetchOnMountOrArgChange: true });
  const st = statusOf(exam);
  const total = progress?.totalStudents ?? 0;
  const subjects = progress?.subjects ?? [];
  const mine = subjects.filter((s) => s.isMine);
  const others = subjects.filter((s) => !s.isMine);
  const complete = subjects.filter((s) => total > 0 && s.entered >= total).length;
  const locked = !!exam.isLocked;

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
            {classText}
            {exam.session?.name ? ` · ${exam.session.name}` : ""} · Pass {exam.passPercentage ?? 33}%
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      <ol className={styles.steps} aria-label="Exam progress">
        <li className={`${styles.step} ${styles.stepDone}`}>
          <span className={styles.stepNum}>✓</span>
          <b>Exam created</b>
        </li>
        <li className={`${styles.step} ${locked ? styles.stepDone : styles.stepNow}`}>
          <span className={styles.stepNum}>{locked ? "✓" : 2}</span>
          <b>Marks entry</b>
          {isClassTeacher && progress ? `${complete}/${subjects.length} subjects done` : "Teachers enter marks"}
        </li>
        <li className={`${styles.step} ${exam.resultsPublished ? styles.stepDone : locked ? styles.stepNow : ""}`}>
          <span className={styles.stepNum}>{exam.resultsPublished ? "✓" : 3}</span>
          <b>Results</b>
          {exam.resultsPublished ? "Published to families" : "Office locks & publishes"}
        </li>
      </ol>

      {locked && <div className={styles.notice}>Marks are locked{exam.lockedByUser ? ` by ${exam.lockedByUser.name}` : ""}, so they can be viewed but not changed.</div>}

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>My subjects</h2>
            {mine.length === 0 ? (
              <p className={styles.muted} style={{ margin: 0 }}>
                No subject of this class is allocated to you. Subject teachers enter their own marks.
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
                        {locked ? "View marks" : s.entered ? "Edit marks" : "Enter marks"}
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
                {others.length === 0 && mine.length === subjects.length ? (
                  <p className={styles.muted} style={{ margin: 0 }}>
                    You teach every subject of this class.
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
                <button type="button" className={styles.bigAction} onClick={onClassResults}>
                  <span className={styles.examIcon}>
                    <Icon name="graduationCap" size={18} />
                  </span>
                  <span>
                    <b>Class results &amp; ranks</b>
                    <small>All subjects, toppers, merit list</small>
                  </span>
                </button>
                <button type="button" className={styles.bigAction} onClick={onRemarks}>
                  <span className={styles.examIcon}>
                    <Icon name="edit" size={18} />
                  </span>
                  <span>
                    <b>Report card remarks</b>
                    <small>Your remark for each student</small>
                  </span>
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherExamsPage;
