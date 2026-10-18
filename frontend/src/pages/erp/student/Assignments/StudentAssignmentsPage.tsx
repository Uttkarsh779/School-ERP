import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Spinner } from "../../../../components/ui";
import FileUploadField from "../../../../components/shared/FileUploadField/FileUploadField";
import { useGetAssignmentsQuery, useSubmitHomeworkMutation, type IAssignment } from "../../../../store/api/assignments.api";
import styles from "./StudentAssignmentsPage.module.css";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const endOfDay = (iso: string) => new Date(new Date(iso).setHours(23, 59, 59, 999));

const stateOf = (a: IAssignment) => {
  const s = a.mySubmission;
  const closed = new Date() > endOfDay(a.endDate ?? a.dueDate);
  if (s?.status === "CHECKED") return { label: "Checked", tone: "success" as const, canSubmit: false };
  if (s?.status === "REDO") return { label: "Redo requested", tone: "warning" as const, canSubmit: !closed };
  if (s) return { label: s.isLate ? "Submitted late" : "Submitted", tone: "info" as const, canSubmit: !closed };
  if (closed) return { label: "Missed", tone: "danger" as const, canSubmit: false };
  if (new Date() > endOfDay(a.dueDate)) return { label: "Overdue — submit now", tone: "danger" as const, canSubmit: true };
  return { label: "To do", tone: "neutral" as const, canSubmit: true };
};

// Student homework: see what's set, submit an answer (text and/or photo/PDF), see the
// teacher's feedback and resubmit when asked to redo.
const StudentAssignmentsPage = () => {
  const { data = [], isLoading } = useGetAssignmentsQuery();
  const [subject, setSubject] = useState("");
  const [show, setShow] = useState("open");
  const [submitting, setSubmitting] = useState<IAssignment | null>(null);

  const subjects = useMemo(() => [...new Map(data.map((a) => [a.subjectId, a.subject?.name ?? "Subject"])).entries()], [data]);
  const rows = useMemo(
    () =>
      data
        .filter((a) => !subject || a.subjectId === Number(subject))
        .filter((a) => {
          const st = stateOf(a);
          if (show === "open") return st.canSubmit;
          if (show === "done") return !st.canSubmit;
          return true;
        }),
    [data, subject, show]
  );
  const todo = data.filter((a) => stateOf(a).canSubmit && !a.mySubmission).length;

  return (
    <div className={styles.page}>
      <PageHeader title="Homework" subtitle={todo ? `${todo} to do` : "You're all caught up"} />

      <div className={styles.filters}>
        <Select
          label="Show"
          value={show}
          onChange={(e) => setShow(e.target.value)}
          options={[
            { label: "Open (can submit)", value: "open" },
            { label: "Done / closed", value: "done" },
            { label: "Everything", value: "" },
          ]}
        />
        <Select
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          options={[{ label: "All subjects", value: "" }, ...subjects.map(([id, name]) => ({ label: name, value: String(id) }))]}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="Nothing here" description={show === "open" ? "No homework waiting for you." : "No homework matches this filter."} />
        </Card>
      ) : (
        <div className={styles.grid}>
          {rows.map((a) => {
            const st = stateOf(a);
            const s = a.mySubmission;
            return (
              <Card key={a.id} title={a.title} subtitle={`${a.subject?.name ?? ""} · ${a.assignedBy?.user?.name ?? ""}`} action={<Badge tone={st.tone}>{st.label}</Badge>}>
                <div className={styles.body}>
                  <p className={styles.desc}>{a.description}</p>
                  {a.attachmentUrl && (
                    <a href={a.attachmentUrl} target="_blank" rel="noreferrer" className={styles.link}>
                      Open teacher's attachment
                    </a>
                  )}
                  <div className={styles.dates}>
                    Due <strong>{fmt(a.dueDate)}</strong>
                    {a.endDate && a.endDate !== a.dueDate && <> · late submissions until {fmt(a.endDate)}</>}
                  </div>
                  {s && (
                    <div className={styles.mine}>
                      <div className={styles.mineTitle}>Your submission</div>
                      {s.submittedOffline ? <p>Handed in on paper</p> : s.text && <p>{s.text}</p>}
                      {s.attachmentUrl && (
                        <a href={s.attachmentUrl} target="_blank" rel="noreferrer" className={styles.link}>
                          Your attachment
                        </a>
                      )}
                      {s.teacherComment && <div className={s.status === "REDO" ? styles.redo : styles.feedback}>Teacher: {s.teacherComment}</div>}
                    </div>
                  )}
                  {st.canSubmit && (
                    <div className={styles.actions}>
                      <Button size="sm" onClick={() => setSubmitting(a)}>
                        {s ? (s.status === "REDO" ? "Resubmit" : "Edit submission") : "Submit"}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {submitting && <SubmitModal assignment={submitting} onClose={() => setSubmitting(null)} />}
    </div>
  );
};

const SubmitModal = ({ assignment, onClose }: { assignment: IAssignment; onClose: () => void }) => {
  const [text, setText] = useState(assignment.mySubmission?.text ?? "");
  const [file, setFile] = useState<string | null>(assignment.mySubmission?.attachmentUrl ?? null);
  const [submit, { isLoading }] = useSubmitHomeworkMutation();

  const send = async () => {
    if (!text.trim() && !file) return toast.error("Write your answer or attach a photo/PDF");
    try {
      await submit({ id: assignment.id, text: text.trim() || undefined, attachmentUrl: file }).unwrap();
      toast.success("Homework submitted");
      onClose();
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message ?? "Couldn't submit");
    }
  };

  return (
    <Modal title={`Submit · ${assignment.title}`} onClose={onClose}>
      <div className={styles.body}>
        {assignment.mySubmission?.status === "REDO" && assignment.mySubmission.teacherComment && (
          <div className={styles.redo}>Teacher asked: {assignment.mySubmission.teacherComment}</div>
        )}
        <label className={styles.label} htmlFor="hw-answer">
          Your answer
        </label>
        <textarea id="hw-answer" rows={6} className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer, or attach a photo of your notebook below" />
        <FileUploadField label="Photo / PDF of your work" value={file} onChange={setFile} folder="school_erp/homework-submissions" />
        {new Date() > endOfDay(assignment.dueDate) && <p className={styles.lateNote}>The due date has passed — this will be marked late.</p>}
        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} isLoading={isLoading}>Submit</Button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentAssignmentsPage;
