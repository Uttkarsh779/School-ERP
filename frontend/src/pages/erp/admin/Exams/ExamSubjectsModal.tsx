import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Modal, Spinner } from "../../../../components/ui";
import { useCopyExamSubjectsMutation, useGetExamSubjectsQuery, useSaveExamSubjectsMutation } from "../../../../store/api/examPlan.api";
import styles from "./AdminExamsPage.module.css";

// Max marks per subject for one exam. A blank box means the subject has no paper in this
// exam. The coordinator can change any subject; a subject teacher only their own subject in
// a periodic test or class test. siblings = how many other classes share this exam; their max
// marks can be set in one go.
const ExamSubjectsModal = ({ examId, title, siblings = 0, onClose }: { examId: number; title: string; siblings?: number; onClose: () => void }) => {
  const { data, isLoading, isError, refetch } = useGetExamSubjectsQuery(examId, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveExamSubjectsMutation();
  const [copy, { isLoading: copying }] = useCopyExamSubjectsMutation();
  const [values, setValues] = useState<Record<number, string>>({});

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.map((s) => [s.subjectId, s.maxMarks === null ? "" : String(s.maxMarks)])));
  }, [data]);

  const editable = !!data?.some((s) => s.canEdit);
  const onSave = async (forAll: boolean) => {
    const changed = (data ?? []).filter((s) => s.canEdit && (values[s.subjectId] ?? "") !== (s.maxMarks === null ? "" : String(s.maxMarks)));
    if (!changed.length && !forAll) return onClose();
    try {
      if (changed.length) await save({ examId, subjects: changed.map((s) => ({ subjectId: s.subjectId, maxMarks: values[s.subjectId] === "" ? null : Number(values[s.subjectId]) })) }).unwrap();
      if (forAll) {
        const r = await copy(examId).unwrap();
        toast.success(`Max marks set for ${r.classes + 1} classes`);
        if (r.skipped.length) toast.warn(`Not changed, marks are already higher: ${r.skipped.join(", ")}`, { autoClose: 10000 });
      } else toast.success("Max marks saved");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the max marks");
    }
  };

  return (
    <Modal title={`Max marks — ${title}`} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the subjects" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <div className={styles.admitForm}>
          <p className={styles.admitHint}>{editable ? "Leave a box empty if that subject has no paper in this exam." : "Marks are locked or published, so max marks can't change now."}</p>
          <div className={styles.admitTableWrap}>
            <table className={styles.admitTable}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Max marks</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.subjectId}>
                    <td>{s.name}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={values[s.subjectId] ?? ""}
                        disabled={!s.canEdit}
                        placeholder="No paper"
                        onChange={(e) => setValues((v) => ({ ...v, [s.subjectId]: e.target.value }))}
                        aria-label={`${s.name} max marks`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.admitActions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {siblings > 0 && editable && (
              <Button variant="outline" onClick={() => onSave(true)} isLoading={saving || copying}>
                Save for all {siblings + 1} classes
              </Button>
            )}
            <Button onClick={() => onSave(false)} isLoading={saving} disabled={!editable}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ExamSubjectsModal;
