import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Icon, Input, Modal, PageHeader, Select, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import FileUploadField from "../../../../components/shared/FileUploadField/FileUploadField";
import {
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetAssignmentsQuery,
  useGetSubmissionsQuery,
  useReviewSubmissionMutation,
  useUpdateAssignmentMutation,
  type IAssignment,
} from "../../../../store/api/assignments.api";
import { useGetClassSectionsQuery, useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./TeacherAssignmentsPage.module.css";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const errorOf = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;
const toInputDate = (iso?: string) => (iso ? iso.slice(0, 10) : "");

type FormState = { id?: number; classSectionId: string; subjectId: string; title: string; description: string; dueDate: string; endDate: string; attachmentUrl: string | null };
const emptyForm = (classSectionId = ""): FormState => ({ classSectionId, subjectId: "", title: "", description: "", dueDate: "", endDate: "", attachmentUrl: null });

// Homework for teachers (and admins at /admin/assignments): set, edit, delete, and review
// submissions — Checked / Redo with a comment, or record work handed in on paper.
const TeacherAssignmentsPage = () => {
  const role = useAppSelector((s) => s.auth.user?.role);
  const isStaffAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const mine = useGetMyClassSectionsQuery(undefined, { skip: isStaffAdmin });
  const all = useGetClassSectionsQuery(undefined, { skip: !isStaffAdmin });
  const classes = (isStaffAdmin ? all.data : mine.data) ?? [];

  const [classId, setClassId] = useState("");
  const { data: assignments = [], isLoading } = useGetAssignmentsQuery(classId ? { classSectionId: Number(classId) } : undefined);
  const [form, setForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IAssignment | null>(null);
  const [reviewing, setReviewing] = useState<IAssignment | null>(null);

  const { data: subjects = [] } = useGetSubjectsQuery({ classSectionId: Number(form?.classSectionId || 0) }, { skip: !form?.classSectionId });
  const [create, { isLoading: creating }] = useCreateAssignmentMutation();
  const [update, { isLoading: updating }] = useUpdateAssignmentMutation();
  const [remove, { isLoading: deleting }] = useDeleteAssignmentMutation();

  const save = async () => {
    if (!form) return;
    if (!form.classSectionId || !form.subjectId) return toast.error("Choose the class and subject");
    if (form.title.trim().length < 3) return toast.error("Title must be at least 3 characters");
    if (!form.description.trim()) return toast.error("Add the instructions");
    if (!form.dueDate) return toast.error("Choose the due date");
    if (form.endDate && form.endDate < form.dueDate) return toast.error("Closing date can't be before the due date");
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      classSectionId: Number(form.classSectionId),
      subjectId: Number(form.subjectId),
      dueDate: form.dueDate,
      endDate: form.endDate || form.dueDate,
      attachmentUrl: form.attachmentUrl,
    };
    try {
      if (form.id) await update({ id: form.id, ...body }).unwrap();
      else await create(body).unwrap();
      toast.success(form.id ? "Homework updated" : "Homework posted");
      setForm(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save the homework"));
    }
  };

  const columns: TableColumn<IAssignment>[] = [
    {
      key: "title",
      label: "Homework",
      render: (a) => (
        <div>
          <div className={styles.title}>{a.title}</div>
          <div className={styles.muted}>
            {a.classSection ? `${a.classSection.className} - ${a.classSection.section}` : ""} · {a.subject?.name}
            {a.assignedBy?.user?.name ? ` · by ${a.assignedBy.user.name}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "dueDate",
      label: "Due",
      render: (a) => (
        <div>
          {fmt(a.dueDate)}
          {a.endDate && a.endDate !== a.dueDate && <div className={styles.muted}>closes {fmt(a.endDate)}</div>}
        </div>
      ),
    },
    {
      key: "stats",
      label: "Submitted",
      render: (a) =>
        a.stats ? (
          <div>
            {a.stats.submitted}/{a.stats.students}
            {a.stats.toReview > 0 && (
              <div>
                <Badge tone="warning">{a.stats.toReview} to check</Badge>
              </div>
            )}
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      label: "",
      render: (a) => (
        <div className={styles.rowActions}>
          <Button size="sm" onClick={() => setReviewing(a)}>
            Submissions
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setForm({
                id: a.id,
                classSectionId: String(a.classSectionId),
                subjectId: String(a.subjectId),
                title: a.title,
                description: a.description,
                dueDate: toInputDate(a.dueDate),
                endDate: toInputDate(a.endDate),
                attachmentUrl: a.attachmentUrl ?? null,
              })
            }
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(a)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Homework"
        subtitle="Set homework, then check what students hand in"
        actions={
          <Button icon={<Icon name="plus" size={16} />} onClick={() => setForm(emptyForm(classId))} disabled={classes.length === 0}>
            Set homework
          </Button>
        }
      />

      <Card title="Homework list">
        <div className={styles.filters}>
          <Select
            label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={[{ label: isStaffAdmin ? "All classes" : "All my classes", value: "" }, ...classes.map((c) => ({ label: `${c.className} - ${c.section}`, value: String(c.id) }))]}
          />
        </div>
        {isLoading ? (
          <Spinner />
        ) : assignments.length === 0 ? (
          <EmptyState title="No homework yet" description="Set homework for a class and students will see it in their portal." />
        ) : (
          <Table columns={columns} data={assignments} keyField="id" />
        )}
      </Card>

      {form && (
        <Modal title={form.id ? "Edit homework" : "Set homework"} size="lg" onClose={() => setForm(null)}>
          <div className={styles.form}>
            <div className={styles.formRow}>
              <Select
                label="Class"
                required
                value={form.classSectionId}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, classSectionId: e.target.value, subjectId: "" })}
                options={[{ label: "Select…", value: "" }, ...classes.map((c) => ({ label: `${c.className} - ${c.section}`, value: String(c.id) }))]}
              />
              <Select
                label="Subject"
                required
                value={form.subjectId}
                disabled={Boolean(form.id) || !form.classSectionId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                options={[{ label: "Select…", value: "" }, ...subjects.map((s) => ({ label: s.name, value: String(s.id) }))]}
              />
            </div>
            <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 3 — exercise 3.2" />
            <div className={styles.field}>
              <label className={styles.label} htmlFor="hw-desc">
                Instructions<span className={styles.required}>*</span>
              </label>
              <textarea id="hw-desc" rows={4} className={styles.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className={styles.formRow}>
              <Input label="Due date" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              <Input label="Closes on (optional)" type="date" value={form.endDate} min={form.dueDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} hint="Late submissions accepted until this date" />
            </div>
            <FileUploadField label="Attachment (optional)" value={form.attachmentUrl} onChange={(url) => setForm({ ...form, attachmentUrl: url })} folder="school_erp/homework" />
          </div>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save} isLoading={creating || updating}>{form.id ? "Save changes" : "Post homework"}</Button>
          </div>
        </Modal>
      )}

      {reviewing && <SubmissionsModal assignment={reviewing} onClose={() => setReviewing(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete homework?"
          message={`"${pendingDelete.title}" and all its submissions will be deleted.`}
          confirmLabel="Delete"
          isLoading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await remove(pendingDelete.id).unwrap();
              toast.success("Homework deleted");
            } catch (e) {
              toast.error(errorOf(e, "Couldn't delete"));
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      )}
    </div>
  );
};

const SubmissionsModal = ({ assignment, onClose }: { assignment: IAssignment; onClose: () => void }) => {
  const { data, isLoading } = useGetSubmissionsQuery(assignment.id);
  const [review, { isLoading: saving }] = useReviewSubmissionMutation();
  const [filter, setFilter] = useState("");
  const [comments, setComments] = useState<Record<number, string>>({});

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (filter === "pending") return all.filter((r) => r.submission?.status === "SUBMITTED");
    if (filter === "missing") return all.filter((r) => !r.submission);
    return all;
  }, [data, filter]);

  const act = async (studentId: number, action: "CHECKED" | "REDO" | "OFFLINE") => {
    const comment = comments[studentId]?.trim();
    if (action === "REDO" && !comment) return toast.error("Write what the student should fix");
    try {
      await review({ id: assignment.id, studentId, action, comment: comment || undefined }).unwrap();
      toast.success(action === "CHECKED" ? "Marked checked" : action === "REDO" ? "Sent back to redo" : "Recorded as handed in on paper");
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save"));
    }
  };

  const counts = {
    submitted: (data?.rows ?? []).filter((r) => r.submission).length,
    pending: (data?.rows ?? []).filter((r) => r.submission?.status === "SUBMITTED").length,
    total: data?.rows.length ?? 0,
  };

  return (
    <Modal title={`Submissions · ${assignment.title}`} size="xl" onClose={onClose}>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className={styles.form}>
          <div className={styles.reviewHead}>
            <span className={styles.muted}>
              {counts.submitted}/{counts.total} handed in · {counts.pending} waiting to be checked · due {fmt(assignment.dueDate)}
            </span>
            <Select
              aria-label="Show"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              options={[
                { label: "Everyone", value: "" },
                { label: "Waiting to check", value: "pending" },
                { label: "Not handed in", value: "missing" },
              ]}
            />
          </div>
          <ul className={styles.subList}>
            {rows.map((r) => {
              const s = r.submission;
              return (
                <li key={r.studentId} className={styles.subItem}>
                  <div className={styles.subTop}>
                    <div>
                      <strong>{r.name}</strong> <span className={styles.muted}>Roll {r.rollNo}</span>
                    </div>
                    {!s ? (
                      <Badge tone="neutral">Not handed in</Badge>
                    ) : (
                      <span className={styles.badges}>
                        {s.isLate && <Badge tone="danger">Late</Badge>}
                        {s.submittedOffline && <Badge tone="neutral">On paper</Badge>}
                        <Badge tone={s.status === "CHECKED" ? "success" : s.status === "REDO" ? "warning" : "info"}>
                          {s.status === "CHECKED" ? "Checked" : s.status === "REDO" ? "Redo requested" : "Submitted"}
                        </Badge>
                      </span>
                    )}
                  </div>
                  {s && !s.submittedOffline && (
                    <div className={styles.answer}>
                      {s.text && <p>{s.text}</p>}
                      {s.attachmentUrl && (
                        <a href={s.attachmentUrl} target="_blank" rel="noreferrer">
                          View attachment
                        </a>
                      )}
                      <div className={styles.muted}>Submitted {new Date(s.submittedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                  )}
                  {s?.teacherComment && <div className={styles.comment}>Your comment: {s.teacherComment}</div>}
                  <div className={styles.reviewRow}>
                    <input
                      className={styles.commentInput}
                      placeholder={s ? "Comment for the student (required for Redo)" : "Optional note"}
                      value={comments[r.studentId] ?? ""}
                      onChange={(e) => setComments({ ...comments, [r.studentId]: e.target.value })}
                    />
                    {s ? (
                      <>
                        <Button size="sm" onClick={() => act(r.studentId, "CHECKED")} disabled={saving}>
                          Checked
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => act(r.studentId, "REDO")} disabled={saving}>
                          Redo
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => act(r.studentId, "OFFLINE")} disabled={saving}>
                        Handed in on paper
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {rows.length === 0 && <li className={styles.muted}>Nobody in this list.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
};

export default TeacherAssignmentsPage;
