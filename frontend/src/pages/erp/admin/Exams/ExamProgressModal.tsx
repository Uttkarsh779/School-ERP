import { Button, EmptyState, Modal, Spinner } from "../../../../components/ui";
import { useGetExamProgressQuery } from "../../../../store/api/exams.api";
import styles from "./AdminExamsPage.module.css";

// Where marks entry stands for one exam of one class: each paper, its teacher, and how many
// students have a mark or AB. Only subject teachers enter marks, so a subject with no teacher
// is flagged for the office to allocate one.
const ExamProgressModal = ({ exam, title, onResults, onClose }: { exam: IExam; title: string; onResults: () => void; onClose: () => void }) => {
  const { data, isLoading, isError, refetch } = useGetExamProgressQuery(exam.id, { refetchOnMountOrArgChange: true });
  const total = data?.totalStudents ?? 0;
  const done = (data?.subjects ?? []).filter((s) => total > 0 && s.entered >= total).length;
  const noTeacher = (data?.subjects ?? []).filter((s) => s.teachers.length === 0).length;

  return (
    <Modal title={`Marks entry — ${title}`} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the progress" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : data.subjects.length === 0 ? (
        <EmptyState title="No papers set for this exam" description="Set the max marks for each subject first, so teachers can enter marks." />
      ) : (
        <div className={styles.admitForm}>
          <p className={styles.admitHint}>
            <b>{done}</b> of {data.subjects.length} subject{data.subjects.length === 1 ? "" : "s"} complete · {total} student{total === 1 ? "" : "s"}
          </p>
          {noTeacher > 0 && (
            <p className={styles.resultWarn} style={{ margin: 0 }}>
              {noTeacher} subject{noTeacher === 1 ? " has" : "s have"} no teacher, so nobody can enter {noTeacher === 1 ? "its" : "their"} marks. Allocate one under Academics → Subjects.
            </p>
          )}
          <ul className={styles.progressList}>
            {data.subjects.map((s) => {
              const pct = total ? Math.min(100, Math.round((s.entered / total) * 100)) : 0;
              return (
                <li key={s.subjectId}>
                  <div className={styles.progressTop}>
                    <span>
                      <strong>{s.name}</strong>{" "}
                      <small className={s.teachers.length ? undefined : styles.failText}>· {s.teachers.length ? s.teachers.join(", ") : "No teacher allocated"}</small>
                    </span>
                    <span>
                      {s.entered}/{total}
                    </span>
                  </div>
                  <div className={`${styles.progressBar} ${pct === 100 ? styles.progressDone : ""}`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className={styles.admitActions}>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={onResults}>
              See results
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ExamProgressModal;
