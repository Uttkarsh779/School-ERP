import { useMemo, useState } from "react";
import { Icon, Spinner } from "../../../../components/ui";
import { useGetExamResultsQuery } from "../../../../store/api/exams.api";
import styles from "./TeacherExams.module.css";

type Student = { id: number; name: string; rollNo: string };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// One subject's results for its teacher: class average, highest, pass count, and each
// student's mark — no class-wide totals or ranks (those belong to the class teacher).
const SubjectResults = ({
  exam,
  subject,
  students,
  onBack,
}: {
  exam: IExam;
  subject: { id: number; name: string };
  students: Student[];
  onBack: () => void;
}) => {
  const { data: results, isLoading } = useGetExamResultsQuery(exam.id);
  const [sortBy, setSortBy] = useState<"roll" | "marks">("roll");
  const passPct = exam.passPercentage ?? 33;

  const rows = useMemo(() => {
    const byStudent = new Map((results ?? []).filter((r) => r.subjectId === subject.id).map((r) => [r.studentId, r]));
    const list = students.map((s) => {
      const r = byStudent.get(s.id);
      const pct = r && !r.isAbsent ? Math.round((r.marksObtained / r.maxMarks) * 1000) / 10 : null;
      return { ...s, r, pct };
    });
    return list.sort((a, b) =>
      sortBy === "marks"
        ? (b.pct ?? -1) - (a.pct ?? -1)
        : (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || a.name.localeCompare(b.name)
    );
  }, [results, students, subject.id, sortBy]);

  const scored = rows.filter((x) => x.pct !== null);
  const avg = scored.length ? Math.round((scored.reduce((s, x) => s + (x.pct ?? 0), 0) / scored.length) * 10) / 10 : null;
  const top = scored.reduce<number | null>((m, x) => (m === null || (x.pct ?? 0) > m ? x.pct : m), null);
  const passed = scored.filter((x) => (x.pct ?? 0) >= passPct).length;
  const absent = rows.filter((x) => x.r?.isAbsent).length;

  if (isLoading) return <Spinner />;

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        <Icon name="arrowLeft" size={16} /> {exam.name}
      </button>
      <div>
        <h1 className={styles.detailTitle}>{subject.name} results</h1>
        <p className={styles.muted}>
          {exam.name} · pass mark {passPct}%
        </p>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <strong>
            {scored.length + absent}/{rows.length}
          </strong>
          <span>Entered</span>
        </div>
        <div className={styles.stat}>
          <strong>{avg === null ? "—" : `${avg}%`}</strong>
          <span>Class average</span>
        </div>
        <div className={styles.stat}>
          <strong>{top === null ? "—" : `${top}%`}</strong>
          <span>Highest</span>
        </div>
        <div className={styles.stat}>
          <strong>
            {passed}/{scored.length}
          </strong>
          <span>Passed</span>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.listHead} style={{ marginBottom: "0.4rem" }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            Students
          </h2>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button type="button" className={`${styles.preset} ${sortBy === "roll" ? styles.presetOn : ""}`} onClick={() => setSortBy("roll")}>
              By roll no
            </button>
            <button type="button" className={`${styles.preset} ${sortBy === "marks" ? styles.presetOn : ""}`} onClick={() => setSortBy("marks")}>
              Highest first
            </button>
          </div>
        </div>
        <ul className={styles.studentList}>
          {rows.map((x) => (
            <li key={x.id} className={styles.studentRow}>
              <span className={styles.roll}>{x.rollNo || "—"}</span>
              <span className={styles.who}>{x.name}</span>
              <span className={styles.resultMark}>
                {!x.r ? (
                  <span className={styles.muted}>Not entered</span>
                ) : x.r.isAbsent ? (
                  <>
                    AB<small className={styles.muted}>Absent</small>
                  </>
                ) : (
                  <>
                    {fmt(x.r.marksObtained)} / {fmt(x.r.maxMarks)}
                    <small className={(x.pct ?? 0) >= passPct ? styles.pass : styles.fail}>
                      {x.pct}% · {(x.pct ?? 0) >= passPct ? "Pass" : "Fail"}
                    </small>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default SubjectResults;
