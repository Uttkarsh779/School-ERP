import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Icon, Input, Modal } from "../../../../components/ui";
import { useCreateExamMutation } from "../../../../store/api/exams.api";
import styles from "./TeacherExams.module.css";

const PRESETS = ["Unit Test 1", "Unit Test 2", "Periodic Test", "Half Yearly", "Pre-Board", "Annual Exam"];

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err && typeof err === "object" && "data" in err ? (err as { data?: { message?: string } }).data?.message : undefined) || fallback;

// Class teacher: create an exam for their class, then see exactly what happens next.
const NewExamSheet = ({
  classSection,
  sessionName,
  existingNames,
  onClose,
  onOpenExam,
}: {
  classSection: { id: number; label: string };
  sessionName?: string;
  existingNames: string[];
  onClose: () => void;
  onOpenExam: (exam: IExam) => void;
}) => {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("33");
  const [created, setCreated] = useState<IExam | null>(null);
  const [createExam, { isLoading }] = useCreateExamMutation();
  const taken = (n: string) => existingNames.some((e) => e.trim().toLowerCase() === n.trim().toLowerCase());

  const submit = async () => {
    const n = name.trim();
    const p = Number(pass);
    if (!n) return toast.error("Give the exam a name");
    if (taken(n)) return toast.error(`"${n}" already exists for this class`);
    if (!Number.isFinite(p) || p < 0 || p > 100) return toast.error("Pass mark must be between 0 and 100");
    try {
      const exam = await createExam({ name: n, classSectionId: classSection.id, passPercentage: p }).unwrap();
      setCreated(exam);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the exam"));
    }
  };

  if (created) {
    return (
      <Modal title="Exam created" onClose={onClose}>
        <div className={styles.created}>
          <span className={styles.createdIcon}>
            <Icon name="check" size={18} />
          </span>
          {created.name} · {classSection.label}
        </div>
        <p className={styles.muted} style={{ marginBottom: 0 }}>
          What happens next:
        </p>
        <ol className={styles.nextSteps}>
          <li>
            <b>Every subject teacher enters their own subject&apos;s marks.</b> The exam is already in their Exams screen; no need to send it.
          </li>
          <li>
            <b>You track progress</b> subject by subject on the exam page, and add report-card remarks.
          </li>
          <li>
            <b>The office locks and publishes</b> the results. Then students and parents see the report card.
          </li>
        </ol>
        <div className={styles.sheetActions}>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button onClick={() => onOpenExam(created)}>Open exam</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="New exam" onClose={onClose}>
      <div className={styles.sheetGrid}>
        <div>
          <Input label="Exam name" placeholder="e.g. Unit Test 1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className={styles.presetRow}>
            {PRESETS.filter((p) => !taken(p)).map((p) => (
              <button key={p} type="button" className={`${styles.preset} ${name === p ? styles.presetOn : ""}`} onClick={() => setName(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <Input
          label="Pass mark (% in each subject)"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          hint="33% is the usual CBSE pass mark"
        />
        <div className={styles.fixed}>
          <span>Class</span>
          <b>{classSection.label}</b>
        </div>
        {sessionName && (
          <div className={styles.fixed}>
            <span>Session</span>
            <b>{sessionName}</b>
          </div>
        )}
        <p className={styles.muted} style={{ margin: 0 }}>
          Each subject teacher sets their own maximum marks while entering marks.
        </p>
      </div>
      <div className={styles.sheetActions}>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} onClick={submit}>
          Create exam
        </Button>
      </div>
    </Modal>
  );
};

export default NewExamSheet;
