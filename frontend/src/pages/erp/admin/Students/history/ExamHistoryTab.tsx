import { useState } from "react";
import { Badge, Button, Card, EmptyState, Modal, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import type { StudentHistory } from "../../../../../store/api/students.api";
import { RESULT_META, fmtNum } from "./historyFormat";
import styles from "./StudentHistory.module.css";

type Exam = StudentHistory["exams"][number];

// Every exam the student has marks in, across all sessions, with rank and class average.
const ExamHistoryTab = ({ history }: { history: StudentHistory }) => {
  const [viewing, setViewing] = useState<Exam | null>(null);
  const exams = history.exams;

  if (exams.length === 0) {
    return (
      <Card>
        <EmptyState title="No exam results yet" description="Results appear here once teachers enter marks." />
      </Card>
    );
  }

  const ranked = exams.filter((e) => e.percentage !== null);
  const best = ranked.length ? Math.max(...ranked.map((e) => e.percentage!)) : null;
  const avg = ranked.length ? Math.round((ranked.reduce((s, e) => s + (e.percentage ?? 0), 0) / ranked.length) * 10) / 10 : null;

  const columns: TableColumn<Exam>[] = [
    {
      key: "examName",
      label: "Exam",
      render: (e) => (
        <div>
          <button type="button" className={styles.linkButton} onClick={() => setViewing(e)}>
            {e.examName}
          </button>
          <div className={styles.muted}>
            {e.sessionName ?? "—"} · {e.className}
          </div>
        </div>
      ),
    },
    { key: "marks", label: "Marks", render: (e) => (e.maxTotal > 0 ? `${fmtNum(e.total)} / ${fmtNum(e.maxTotal)}` : "—") },
    { key: "percentage", label: "%", render: (e) => (e.percentage === null ? "—" : `${e.percentage}%`) },
    { key: "classAverage", label: "Class Avg", render: (e) => (e.classAverage === null ? "—" : `${e.classAverage}%`) },
    {
      key: "rank",
      label: "Rank",
      render: (e) => (e.rank ? `${e.rank} of ${e.rankedCount}` : "—"),
    },
    {
      key: "status",
      label: "Result",
      render: (e) => <Badge tone={RESULT_META[e.status]?.tone ?? "neutral"}>{RESULT_META[e.status]?.label ?? e.status}</Badge>,
    },
    { key: "final", label: "Marks", render: (e) => (e.isLocked ? <Badge tone="neutral">Final</Badge> : <Badge tone="info">Provisional</Badge>) },
    {
      key: "actions",
      label: "",
      render: (e) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setViewing(e)}>
          Subjects
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.tab}>
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{exams.length}</div>
          <div className={styles.muted}>Exams taken</div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{avg === null ? "—" : `${avg}%`}</div>
          <div className={styles.muted}>Average score</div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{best === null ? "—" : `${best}%`}</div>
          <div className={styles.muted}>Best score</div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{exams.filter((e) => e.status === "FAIL").length}</div>
          <div className={styles.muted}>Exams failed</div>
        </div>
      </div>

      <Card title="Exam history" subtitle="Rank is among students with all subjects entered; provisional until the exam is locked">
        <Table columns={columns} data={exams} keyField="examId" />
      </Card>

      {viewing && (
        <Modal title={`${viewing.examName} · ${viewing.className}`} size="md" onClose={() => setViewing(null)}>
          <div className={styles.modalHeader}>
            <span className={styles.muted}>
              Session {viewing.sessionName ?? "—"} · Pass mark {viewing.passPercentage}%
            </span>
            <span className={styles.badges}>
              {viewing.rank && <Badge tone="primary">Rank {viewing.rank} of {viewing.rankedCount}</Badge>}
              <Badge tone={RESULT_META[viewing.status]?.tone ?? "neutral"}>{RESULT_META[viewing.status]?.label}</Badge>
            </span>
          </div>
          <table className={styles.simpleTable}>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
                <th>%</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {viewing.subjects.map((s) => (
                <tr key={s.subjectId}>
                  <td>{s.subjectName}</td>
                  {!s.entered ? (
                    <td colSpan={3} className={styles.muted}>Not entered</td>
                  ) : s.isAbsent ? (
                    <>
                      <td className={styles.absent}>AB / {fmtNum(s.maxMarks ?? 0)}</td>
                      <td>—</td>
                      <td><Badge tone="warning">Absent</Badge></td>
                    </>
                  ) : (
                    <>
                      <td>{fmtNum(s.marksObtained ?? 0)} / {fmtNum(s.maxMarks ?? 0)}</td>
                      <td>{s.percentage}%</td>
                      <td><Badge tone={s.passed ? "success" : "danger"}>{s.passed ? "Pass" : "Fail"}</Badge></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{viewing.maxTotal > 0 ? `${fmtNum(viewing.total)} / ${fmtNum(viewing.maxTotal)}` : "—"}</td>
                <td>{viewing.percentage === null ? "—" : `${viewing.percentage}%`}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <div className={styles.modalActions}>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ExamHistoryTab;
