import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Modal, Spinner } from "../../../../components/ui";
import { DEFAULT_INSTRUCTIONS, printAdmitCards } from "../../../../components/shared/Print/admitCardPrint";
import { usePrintSchool } from "../../../../components/shared/Print/usePrintSchool";
import { useGetAdmitCardsQuery, useSaveDateSheetMutation } from "../../../../store/api/exams.api";
import styles from "./AdminExamsPage.module.css";

// Admit cards for one exam: the office fills in the date sheet (date and time of each
// subject's paper) and the instructions, then prints a card for every student of the class.
// Subjects left blank have no paper in this exam.

type Row = { subjectId: number; name: string; date: string; start: string; end: string };

const AdmitCardModal = ({ examId, onClose }: { examId: number; onClose: () => void }) => {
  const { data, isLoading, isError, refetch } = useGetAdmitCardsQuery(examId, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveDateSheetMutation();
  const schoolFor = usePrintSchool();
  const [rows, setRows] = useState<Row[]>([]);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);

  useEffect(() => {
    if (!data) return;
    const saved = new Map(data.dateSheet.entries.map((e) => [e.subjectId, e]));
    setRows(data.subjects.map((s) => ({ subjectId: s.id, name: s.name, date: saved.get(s.id)?.date ?? "", start: saved.get(s.id)?.start ?? "", end: saved.get(s.id)?.end ?? "" })));
    setInstructions(data.dateSheet.instructions ?? DEFAULT_INSTRUCTIONS);
  }, [data]);

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  // Same time as the row above: most schools hold every paper at the same hour.
  const copyTimeDown = () => {
    const first = rows.find((r) => r.start && r.end);
    if (!first) return toast.info("Enter the time for one subject first.");
    setRows((r) => r.map((x) => (x.date ? { ...x, start: x.start || first.start, end: x.end || first.end } : x)));
  };

  const saveSheet = async () => {
    await save({
      examId,
      entries: rows.map(({ subjectId, date, start, end }) => ({ subjectId, date, start, end })),
      instructions: instructions.trim() === DEFAULT_INSTRUCTIONS ? null : instructions,
    }).unwrap();
  };

  const onSave = async (andPrint: boolean) => {
    try {
      await saveSheet();
      if (!andPrint) return void toast.success("Date sheet saved");
      const fresh = await refetch().unwrap();
      if (fresh.students.length === 0) return void toast.info("There are no active students in this class.");
      printAdmitCards(fresh, schoolFor("admitCard"));
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the date sheet");
    }
  };

  return (
    <Modal title={data ? `Admit cards — ${data.exam.name} (${data.classSection.className} - ${data.classSection.section})` : "Admit cards"} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load this exam" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : data.subjects.length === 0 ? (
        <EmptyState title="No subjects in this class" description="Add the class's subjects first (Class Sections)." />
      ) : (
        <div className={styles.admitForm}>
          <p className={styles.admitHint}>
            Date sheet for {data.students.length} student{data.students.length === 1 ? "" : "s"}. Leave a subject blank if it has no paper in this exam.
          </p>
          <div className={styles.admitTableWrap}>
            <table className={styles.admitTable}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.subjectId}>
                    <td>{r.name}</td>
                    <td>
                      <input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label={`${r.name} date`} />
                    </td>
                    <td>
                      <input type="time" value={r.start} onChange={(e) => set(i, { start: e.target.value })} aria-label={`${r.name} start time`} />
                    </td>
                    <td>
                      <input type="time" value={r.end} onChange={(e) => set(i, { end: e.target.value })} aria-label={`${r.name} end time`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={styles.linkBtn} onClick={copyTimeDown}>
            Use the same time for every paper
          </button>

          <label className={styles.admitLabel}>
            Instructions for students <span>(one per line)</span>
            <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>

          <div className={styles.admitActions}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={() => onSave(false)} isLoading={saving}>
              Save
            </Button>
            <Button onClick={() => onSave(true)} isLoading={saving}>
              Save &amp; print admit cards
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AdmitCardModal;
