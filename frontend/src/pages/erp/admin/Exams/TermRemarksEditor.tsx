import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Modal, Spinner } from "../../../../components/ui";
import { useGetTermRemarksQuery, useSaveTermRemarksMutation } from "../../../../store/api/examPlan.api";
import styles from "./AdminExamsPage.module.css";

// Class teacher: the term's report-card remark and co-scholastic grades for each student
// (CBSE: 3-point A–C for up to Class 8, 5-point A–E for Classes 9–10, set by the scheme).
// Others see it read-only.

const AREAS = [
  ["workEducation", "Work Ed."],
  ["artEducation", "Art Ed."],
  ["healthPhysical", "Health & PE"],
  ["discipline", "Discipline"],
] as const;
type Row = Record<string, string>;

const TermRemarksEditor = ({ classSectionId, term, onClose }: { classSectionId: number; term: number; onClose: () => void }) => {
  const { data, isLoading, isError, refetch } = useGetTermRemarksQuery({ classSectionId, term }, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveTermRemarksMutation();
  const [rows, setRows] = useState<Record<number, Row>>({});

  useEffect(() => {
    if (data)
      setRows(Object.fromEntries(data.students.map((s) => [s.studentId, { remark: s.remark ?? "", ...Object.fromEntries(AREAS.map(([k]) => [k, (s as any)[k] ?? ""])) }])));
  }, [data]);

  const set = (id: number, k: string, v: string) => setRows((r) => ({ ...r, [id]: { ...r[id], [k]: v } }));
  // Most students get the same grade; fill the empty boxes, then change the few that differ.
  const fillBlank = (grade: string) =>
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, ...Object.fromEntries(AREAS.filter(([k]) => !row[k]).map(([k]) => [k, grade])) }])));
  const onSave = async () => {
    try {
      await save({ classSectionId, term, rows: Object.entries(rows).map(([studentId, r]) => ({ studentId: Number(studentId), ...r })) }).unwrap();
      toast.success("Remarks saved");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the remarks");
    }
  };

  return (
    <Modal title={data ? `Remarks & co-scholastic — ${data.classSection.className} - ${data.classSection.section}${data.terms === 1 ? "" : `, Term ${term}`}` : "Remarks"} onClose={onClose} size="xl">
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the remarks" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <div className={styles.admitForm}>
          <p className={styles.admitHint}>
            Grades: {data.grades.join(", ")} ({data.coScale === 5 ? "5-point scale" : "A Outstanding, B Very good, C Fair"}).
            {!data.canEdit && " Only the class teacher can change these, and only until the result is published."}
          </p>
          {data.canEdit && (
            <div className={styles.fillRow}>
              <span>Fill empty grades with</span>
              {data.grades.map((g) => (
                <button key={g} type="button" className={styles.quietBtn} onClick={() => fillBlank(g)}>
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className={styles.admitTableWrap}>
            <table className={styles.admitTable}>
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Student</th>
                  {AREAS.map(([k, label]) => (
                    <th key={k}>{label}</th>
                  ))}
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.rollNo}</td>
                    <td>{s.name}</td>
                    {AREAS.map(([k]) => (
                      <td key={k}>
                        <select value={rows[s.studentId]?.[k] ?? ""} disabled={!data.canEdit} onChange={(e) => set(s.studentId, k, e.target.value)} aria-label={`${s.name} ${k}`}>
                          <option value="">—</option>
                          {data.grades.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td>
                      <input
                        type="text"
                        maxLength={400}
                        className={styles.remarkInput}
                        value={rows[s.studentId]?.remark ?? ""}
                        disabled={!data.canEdit}
                        onChange={(e) => set(s.studentId, "remark", e.target.value)}
                        aria-label={`${s.name} remark`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.admitActions}>
            <Button variant="ghost" onClick={onClose}>
              {data.canEdit ? "Cancel" : "Close"}
            </Button>
            {data.canEdit && (
              <Button onClick={onSave} isLoading={saving}>
                Save remarks
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default TermRemarksEditor;
