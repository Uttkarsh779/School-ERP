import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, ConfirmDialog, EmptyState, Modal, Spinner } from "../../../../components/ui";
import { DEFAULT_INSTRUCTIONS, printAdmitCards } from "../../../../components/shared/Print/admitCardPrint";
import { usePrintSchool } from "../../../../components/shared/Print/usePrintSchool";
import { useGetAdmitCardsQuery, useSaveDateSheetMutation } from "../../../../store/api/exams.api";
import { useCopyDateSheetMutation } from "../../../../store/api/examPlan.api";
import styles from "./AdminExamsPage.module.css";

// Admit cards for one exam: the office fills in the date sheet (date and time of each
// subject's paper) and the instructions, then prints a card for every student of the class.
// Subjects left blank have no paper in this exam. siblings = how many other classes share this
// exam; the same date sheet can be used for them in one go (subjects matched by name).

type Row = { subjectId: number; name: string; date: string; start: string; end: string };

const AdmitCardModal = ({ examId, siblings = 0, onClose }: { examId: number; siblings?: number; onClose: () => void }) => {
  const { data, isLoading, isError, refetch } = useGetAdmitCardsQuery(examId, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveDateSheetMutation();
  const [copy, { isLoading: copying }] = useCopyDateSheetMutation();
  const [confirmCopy, setConfirmCopy] = useState(false);
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
    const saved = await save({
      examId,
      entries: rows.map(({ subjectId, date, start, end }) => ({ subjectId, date, start, end })),
      instructions: instructions.trim() === DEFAULT_INSTRUCTIONS ? null : instructions,
    }).unwrap();
    if (saved.warnings?.length) toast.warn(saved.warnings.join("; "), { autoClose: 9000 });
  };

  const onSave = async (andPrint: boolean) => {
    try {
      await saveSheet();
      if (!andPrint) return void toast.success("Date sheet saved");
      const fresh = await refetch().unwrap();
      if (!fresh.dateSheet.entries.length) return void toast.info("Fill in the date sheet before printing admit cards.");
      if (fresh.students.length === 0) return void toast.info(fresh.heldBack.length ? "Every student in this class has overdue fees, so no cards were issued." : "There are no active students in this class.");
      printAdmitCards(fresh, schoolFor("admitCard"));
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the date sheet");
    }
  };

  const onCopy = async () => {
    setConfirmCopy(false);
    try {
      await saveSheet();
      const r = await copy(examId).unwrap();
      toast.success(`Date sheet set for ${r.classes + 1} classes`);
      if (r.notMatched.length) toast.warn(`Still to fill in, no matching paper here: ${r.notMatched.join(", ")}`, { autoClose: 10000 });
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't copy the date sheet");
    }
  };

  return (
    <Modal
      title={data ? `${data.admitCard ? "Date sheet & admit cards" : "Date sheet"} — ${data.exam.name} (${data.classSection.className} - ${data.classSection.section})` : "Date sheet"}
      onClose={onClose}
      size="lg"
    >
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load this exam" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : data.subjects.length === 0 ? (
        <EmptyState title="No subjects in this class" description="Add the class's subjects first (Class Sections)." />
      ) : (
        <div className={styles.admitForm}>
          <p className={styles.admitHint}>
            Students see the date sheet on their dashboard once it&apos;s saved. Leave a subject blank if it has no paper in this exam.
          </p>
          {data.admitCard && data.heldBack.length > 0 && (
            <p className={styles.resultWarn}>
              No admit card for {data.heldBack.length} student{data.heldBack.length === 1 ? "" : "s"} with overdue fees:{" "}
              {data.heldBack.map((s) => `${s.name} (₹${Math.round(s.due).toLocaleString("en-IN")})`).join(", ")}. The Super Admin can allow cards for everyone under Exams → Assessment schemes.
            </p>
          )}
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
            <span>
              Instructions for students <span className={styles.labelHint}>(one per line)</span>
            </span>
            <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>

          <div className={styles.admitActions}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {siblings > 0 && (
              <Button variant="outline" onClick={() => setConfirmCopy(true)} isLoading={saving || copying}>
                Use for all {siblings + 1} classes
              </Button>
            )}
            <Button variant="outline" onClick={() => onSave(false)} isLoading={saving}>
              Save
            </Button>
            {data.admitCard && (
              <Button onClick={() => onSave(true)} isLoading={saving}>
                Save &amp; print admit cards
              </Button>
            )}
          </div>
        </div>
      )}
      {confirmCopy && (
        <ConfirmDialog
          title="Use this date sheet for all classes?"
          message={`This replaces the date sheet of the other ${siblings} class${siblings === 1 ? "" : "es"} of this exam, matching papers by subject name. Classes already locked or published are left as they are. Students are notified of any change.`}
          confirmLabel="Use for all"
          tone="primary"
          isLoading={saving || copying}
          onCancel={() => setConfirmCopy(false)}
          onConfirm={onCopy}
        />
      )}
    </Modal>
  );
};

export default AdmitCardModal;
