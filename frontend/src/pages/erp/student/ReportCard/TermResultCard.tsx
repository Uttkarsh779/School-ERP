import { Badge, Button, Card, Icon, StatCard } from "../../../../components/ui";
import { printTermReportCards } from "../../../../components/shared/Print/termReportCardPrint";
import { usePrintSchool } from "../../../../components/shared/Print/usePrintSchool";
import type { MyResult } from "../../../../store/api/examPlan.api";
import styles from "./StudentReportCardPage.module.css";

// A published term or final result for the signed-in student, with print.
const RESULT: Record<string, string> = { PASS: "Pass", NEEDS_IMPROVEMENT: "Needs improvement", INCOMPLETE: "Marks incomplete", PENDING: "Marks pending" };
const CO = [
  ["workEducation", "Work Education"],
  ["artEducation", "Art Education"],
  ["healthPhysical", "Health & Physical Education"],
  ["discipline", "Discipline"],
] as const;
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10));

export const resultLabel = (r: MyResult) => (r.kind === "FINAL" ? (r.scheme.terms === 1 ? "Annual result" : "Final result") : r.scheme.terms === 1 ? "Annual result" : `Term ${r.term}`);

const TermResultCard = ({ result }: { result: MyResult }) => {
  const schoolFor = usePrintSchool();
  const row = result.row;
  const final = result.kind === "FINAL" && result.scheme.terms === 2;
  const print = () =>
    printTermReportCards(
      { kind: result.kind, term: result.term, classSection: { id: result.classSectionId, ...result.classSection }, session: result.session, classTeacher: result.classTeacher, scheme: result.scheme, weights: result.weights ?? undefined, subjects: result.subjects, attendance: result.attendance ? { [row.student.id]: result.attendance } : undefined, students: [row] },
      schoolFor("reportCard")
    );

  return (
    <>
      <div className={styles.statsRow}>
        <div className={styles.percentageCard}>
          <div className={styles.percentageValue}>{row.percentage === null ? "—" : `${n(row.percentage)}%`}</div>
          <div className={styles.percentageLabel}>Overall · Grade {row.grade ?? "—"}</div>
        </div>
        <StatCard label="Result" value={RESULT[row.result] ?? row.result} />
        {result.attendance && <StatCard label="Attendance" value={`${result.attendance.present} / ${result.attendance.workingDays}`} />}
      </div>
      {row.failedSubjects.length > 0 && <p className={styles.finalNote}>Needs attention in: {row.failedSubjects.join(", ")}.</p>}

      <Card
        title={`${resultLabel(result)} · ${result.session}`}
        subtitle={final ? `Final = Term 1 × ${result.weights?.[0]}% + Term 2 × ${result.weights?.[1]}%` : `${result.scheme.terms === 1 ? "Internal assessment" : "Periodic assessment"} ${result.scheme.paMax} + exam ${result.scheme.examMax}`}
        padded={false}
        className={styles.tableCard}
        action={
          <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} onClick={print}>
            Print / Save PDF
          </Button>
        }
      >
        <div className={styles.tableScroll}>
          <table className={styles.marksTable}>
            <thead>
              {final ? (
                <tr>
                  <th className={styles.left}>Subject</th>
                  <th>Term 1</th>
                  <th>Term 2</th>
                  <th>Final %</th>
                  <th>Grade</th>
                </tr>
              ) : (
                <tr>
                  <th className={styles.left}>Subject</th>
                  <th>{result.scheme.terms === 1 ? "Internal" : "Periodic"} /{result.scheme.paMax}</th>
                  <th>Exam /{result.scheme.examMax}</th>
                  <th>Total /{result.scheme.paMax + result.scheme.examMax}</th>
                  <th>Grade</th>
                </tr>
              )}
            </thead>
            <tbody>
              {row.subjects
                .filter((s) => (final ? s.term1 || s.term2 : s.hasPaper || s.total !== null))
                .map((s) =>
                  final ? (
                    <tr key={s.subjectId}>
                      <td className={styles.left}>{s.subjectName}</td>
                      <td>{n(s.term1?.total)}</td>
                      <td>{n(s.term2?.total)}</td>
                      <td>
                        <b>{n(s.percentage)}</b>
                      </td>
                      <td>
                        <b>{s.grade ?? "—"}</b>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.subjectId}>
                      <td className={styles.left}>{s.subjectName}</td>
                      <td>{n(s.pa)}</td>
                      <td>{s.examAbsent ? "AB" : n(s.exam)}</td>
                      <td>
                        <b>{n(s.total)}</b>
                      </td>
                      <td>
                        <b>{s.grade ?? "—"}</b>
                      </td>
                    </tr>
                  )
                )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className={styles.remarksGrid}>
        <Card title="Co-scholastic areas" subtitle={result.scheme.coScale === 5 ? "Graded A to E" : "Graded A (Outstanding), B (Very good), C (Fair)"}>
          <ul className={styles.coList}>
            {CO.map(([k, label]) => (
              <li key={k}>
                <span>{label}</span>
                <span className={styles.grade}>{final ? `${row.term1CoScholastic?.[k] ?? "—"} · ${row.coScholastic[k] ?? "—"}` : row.coScholastic[k] ?? "—"}</span>
              </li>
            ))}
          </ul>
          {final && <p className={styles.finalNote} style={{ margin: "0.5rem 0 0" }}>Term 1 · Term 2</p>}
        </Card>
        <Card title="Class teacher's remark">
          {row.remark ? (
            <blockquote className={styles.remark}>
              “{row.remark}”{result.classTeacher && <footer>— {result.classTeacher}</footer>}
            </blockquote>
          ) : (
            <p className={styles.finalNote}>No remark.</p>
          )}
        </Card>
      </div>
      <p className={styles.finalNote} style={{ marginTop: "0.75rem" }}>
        <Badge tone="success">Published</Badge> {new Date(result.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </p>
    </>
  );
};

export default TermResultCard;
