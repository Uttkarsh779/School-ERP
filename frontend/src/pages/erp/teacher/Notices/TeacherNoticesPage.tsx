import { useState } from "react";
import { toast } from "react-toastify";
import { Button, ConfirmDialog, EmptyState, Input, Modal, PageHeader } from "../../../../components/ui";
import NoticeBoard from "../../../../components/shared/NoticeBoard/NoticeBoard";
import FileUploadField from "../../../../components/shared/FileUploadField/FileUploadField";
import {
  useCreateNoticeMutation,
  useDeleteNoticeMutation,
  useGetNoticeClassesQuery,
  useGetSentNoticesQuery,
} from "../../../../store/api/notices.api";
import styles from "./TeacherNoticesPage.module.css";

// Teacher notices: read school notices, and send notices to the classes you teach
// (students + their parents see them in their portal).
type Tab = "inbox" | "sent";

const errorOf = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;
const EMPTY = { title: "", body: "", classSectionIds: [] as number[], isImportant: false, attachmentUrl: null as string | null };

const TeacherNoticesPage = () => {
  const [tab, setTab] = useState<Tab>("inbox");
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [pendingDelete, setPendingDelete] = useState<INotice | null>(null);

  const { data: classes = [], isLoading: loadingClasses } = useGetNoticeClassesQuery();
  const { data: sent, isLoading: loadingSent } = useGetSentNoticesQuery();
  const [createNotice, { isLoading: sending }] = useCreateNoticeMutation();
  const [deleteNotice, { isLoading: deleting }] = useDeleteNoticeMutation();

  const openCompose = () => {
    // A class teacher's own class is pre-selected — the most common case.
    setForm({ ...EMPTY, classSectionIds: classes.filter((c) => c.isClassTeacher).map((c) => c.id) });
    setComposing(true);
  };

  const toggleClass = (id: number) =>
    setForm((f) => ({ ...f, classSectionIds: f.classSectionIds.includes(id) ? f.classSectionIds.filter((x) => x !== id) : [...f.classSectionIds, id] }));

  const send = async () => {
    if (form.title.trim().length < 3) return toast.error("Title must be at least 3 characters");
    if (form.body.trim().length < 3) return toast.error("Write the notice text");
    if (form.classSectionIds.length === 0) return toast.error("Choose at least one class");
    try {
      const res = await createNotice({
        title: form.title.trim(),
        body: form.body.trim(),
        classSectionIds: form.classSectionIds,
        isImportant: form.isImportant,
        attachmentUrl: form.attachmentUrl,
      }).unwrap();
      toast.success(res.message ?? "Notice sent");
      setComposing(false);
      setTab("sent");
    } catch (e) {
      toast.error(errorOf(e, "Couldn't send the notice"));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteNotice(pendingDelete.id).unwrap();
      toast.success("Notice deleted");
      setPendingDelete(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't delete the notice"));
    }
  };

  const recipients = classes.filter((c) => form.classSectionIds.includes(c.id)).reduce((n, c) => n + c.studentCount, 0);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Notices"
        subtitle="School announcements, and notices you send to your classes"
        actions={
          classes.length > 0 ? (
            <Button onClick={openCompose}>+ New notice</Button>
          ) : undefined
        }
      />

      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "inbox"} className={`${styles.tab} ${tab === "inbox" ? styles.tabActive : ""}`} onClick={() => setTab("inbox")}>
          School notices
        </button>
        <button type="button" role="tab" aria-selected={tab === "sent"} className={`${styles.tab} ${tab === "sent" ? styles.tabActive : ""}`} onClick={() => setTab("sent")}>
          Sent by me{sent && sent.length > 0 ? ` · ${sent.length}` : ""}
        </button>
      </div>

      {tab === "inbox" ? (
        <NoticeBoard />
      ) : (
        <NoticeBoard
          notices={sent ?? []}
          isLoading={loadingSent}
          emptyTitle="You haven't sent any notices"
          emptyDescription="Use “New notice” to send homework reminders, PTM details or class announcements to your students and their parents."
          renderActions={(n) => (
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(n)}>
              Delete
            </Button>
          )}
        />
      )}

      {composing && (
        <Modal title="New notice" onClose={() => setComposing(false)} size="lg">
          <div className={styles.form}>
            <Input label="Title *" value={form.title} maxLength={150} placeholder="e.g. Parent–teacher meeting on Saturday" onChange={(e) => setForm({ ...form, title: e.target.value })} />

            <label className={styles.field}>
              <span className={styles.label}>Notice *</span>
              <textarea
                className={styles.textarea}
                rows={6}
                maxLength={5000}
                value={form.body}
                placeholder="Write the details students and parents need to know…"
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <span className={styles.hint}>{form.body.length}/5000</span>
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Send to *</span>
              {loadingClasses ? null : classes.length === 0 ? (
                <EmptyState title="No classes" description="You aren't assigned to any class this session." />
              ) : (
                <div className={styles.classGrid}>
                  {classes.map((c) => {
                    const on = form.classSectionIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" className={`${styles.classChip} ${on ? styles.classChipOn : ""}`} onClick={() => toggleClass(c.id)} aria-pressed={on}>
                        <span className={styles.classTick}>{on ? "✓" : ""}</span>
                        <span>
                          <strong>
                            {c.className} - {c.section}
                          </strong>
                          <small>
                            {c.isClassTeacher ? "Your class · " : ""}
                            {c.studentCount} students
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {form.classSectionIds.length > 0 && (
                <span className={styles.hint}>
                  Will reach {recipients} student{recipients === 1 ? "" : "s"} (and their parents) in {form.classSectionIds.length} class{form.classSectionIds.length === 1 ? "" : "es"}.
                </span>
              )}
            </div>

            <FileUploadField label="Attachment (optional)" value={form.attachmentUrl} onChange={(url) => setForm({ ...form, attachmentUrl: url })} folder="school_erp/notices" />

            <label className={styles.toggle}>
              <input type="checkbox" checked={form.isImportant} onChange={(e) => setForm({ ...form, isImportant: e.target.checked })} />
              Mark as important
            </label>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button onClick={send} isLoading={sending}>
              Send notice
            </Button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this notice?"
          message={`“${pendingDelete.title}” will be removed for everyone in ${pendingDelete.targetClassSection ? `${pendingDelete.targetClassSection.className} - ${pendingDelete.targetClassSection.section}` : "the class"}.`}
          confirmLabel="Delete"
          tone="danger"
          isLoading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};

export default TeacherNoticesPage;
