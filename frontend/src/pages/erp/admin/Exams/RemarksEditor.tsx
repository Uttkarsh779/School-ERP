import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Modal, Spinner } from "../../../../components/ui";
import { useGetExamRemarksQuery, useSaveExamRemarksMutation, type CoGrade, type RemarksSheet } from "../../../../store/api/exams.api";
import styles from "./RemarksEditor.module.css";

const AREAS: Array<{ key: "workEducation" | "artEducation" | "healthPhysical" | "discipline"; label: string; short: string }> = [
  { key: "workEducation", label: "Work Education", short: "Work Ed." },
  { key: "artEducation", label: "Art Education", short: "Art Ed." },
  { key: "healthPhysical", label: "Health & Physical Education", short: "Health & PE" },
  { key: "discipline", label: "Discipline", short: "Discipline" },
];
const GRADE_HELP = "A = Outstanding · B = Very good · C = Fair";

type Row = RemarksSheet["rows"][number];

// CBSE-style report-card remarks for one exam: class-teacher remark + A/B/C co-scholastic
// grades per student. Read-only once results are published.
const RemarksEditor = ({ examId, onClose }: { examId: number; onClose: () => void }) => {
  const { data, isLoading, isError } = useGetExamRemarksQuery(examId);
  const [save, { isLoading: saving }] = useSaveExamRemarksMutation();
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setRows(data.rows);
      setDirty(false);
    }
  }, [data]);

  const locked = Boolean(data?.exam.resultsPublished);
  const set = (studentId: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const fillColumn = (key: (typeof AREAS)[number]["key"], grade: CoGrade) => {
    setRows((rs) => rs.map((r) => (r[key] ? r : { ...r, [key]: grade })));
    setDirty(true);
  };

  const submit = async () => {
    try {
      await save({
        examId,
        rows: rows.map(({ studentId, remark, workEducation, artEducation, healthPhysical, discipline }) => ({
          studentId, remark, workEducation, artEducation, healthPhysical, discipline,
        })),
      }).unwrap();
      toast.success("Remarks saved");
      setDirty(false);
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message ?? "Couldn't save remarks");
    }
  };

  const filled = rows.filter((r) => r.remark.trim() && AREAS.every((a) => r[a.key])).length;

  return (
    <Modal title={data ? `Report-card remarks · ${data.exam.name} · ${data.exam.classSection}` : "Report-card remarks"} size="xl" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <p className={styles.muted}>Only the class teacher (or an admin) can write remarks for this exam.</p>
      ) : (
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.muted}>
              {filled}/{rows.length} students complete · {GRADE_HELP}
            </span>
            {locked ? <Badge tone="success">Published — read only</Badge> : <Badge tone="warning">Draft</Badge>}
          </div>
          {!locked && (
            <div className={styles.quickFill}>
              <span className={styles.muted}>Fill empty cells with A:</span>
              {AREAS.map((a) => (
                <Button key={a.key} size="sm" variant="ghost" onClick={() => fillColumn(a.key, "A")}>
                  {a.short}
                </Button>
              ))}
            </div>
          )}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Result</th>
                  {AREAS.map((a) => (
                    <th key={a.key} title={a.label}>
                      {a.short}
                    </th>
                  ))}
                  <th>Class teacher's remark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className={styles.muted}>Roll {r.rollNo}</div>
                    </td>
                    <td className={styles.muted}>
                      {r.result?.percentage != null ? `${r.result.percentage}%` : "—"}
                      {r.result?.rank ? ` · #${r.result.rank}` : ""}
                    </td>
                    {AREAS.map((a) => (
                      <td key={a.key}>
                        <select
                          className={styles.grade}
                          value={r[a.key]}
                          disabled={locked}
                          onChange={(e) => set(r.studentId, { [a.key]: e.target.value as CoGrade })}
                          aria-label={`${a.label} for ${r.name}`}
                        >
                          <option value="">–</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </td>
                    ))}
                    <td>
                      <input
                        className={styles.remark}
                        value={r.remark}
                        maxLength={400}
                        disabled={locked}
                        placeholder="e.g. Sincere and attentive; should practise maths daily"
                        onChange={(e) => set(r.studentId, { remark: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <span className={styles.muted}>
              {locked ? "An admin must unpublish the results to make changes." : "Students see these on their report card once an admin publishes the results."}
            </span>
            <div className={styles.buttons}>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {!locked && (
                <Button onClick={submit} isLoading={saving} disabled={!dirty}>
                  Save remarks
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default RemarksEditor;
