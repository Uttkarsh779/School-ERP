import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Button,
  ConfirmDialog,
  FormGrid,
  FormSection,
  Input,
  Modal,
  PageHeader,
  Select,
} from "../../../../components/ui";
import NoticeBoard from "../../../../components/shared/NoticeBoard/NoticeBoard";
import { useCreateNoticeMutation, useDeleteNoticeMutation } from "../../../../store/api/notices.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import styles from "./AdminNoticesPage.module.css";

interface NoticeFormInputs {
  title: string;
  body: string;
  targetRole: string;
  targetClassSectionId: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const AdminNoticesPage = () => {
  const { data: classSections } = useGetClassSectionsQuery();
  const [createNotice, { isLoading: isCreating }] = useCreateNoticeMutation();
  const [deleteNotice] = useDeleteNoticeMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<INotice | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NoticeFormInputs>({ defaultValues: { targetRole: "", targetClassSectionId: "" } });

  const selectedRole = watch("targetRole");

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = async (values: NoticeFormInputs) => {
    try {
      await createNotice({
        title: values.title,
        body: values.body,
        targetRole: values.targetRole ? (values.targetRole as UserRole) : undefined,
        targetClassSectionId:
          values.targetRole === "STUDENT" && values.targetClassSectionId
            ? Number(values.targetClassSectionId)
            : undefined,
      }).unwrap();
      toast.success("Notice posted");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to post notice"));
    }
  };

  const handleDelete = async (notice: INotice) => {
    setDeletingId(notice.id);
    try {
      await deleteNotice(notice.id).unwrap();
      toast.success("Notice deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete notice"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notices"
        subtitle="Post announcements for staff, students and parents"
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + New Notice
          </Button>
        }
      />

      <NoticeBoard
        renderActions={(notice) => (
          <Button
            variant="outline"
            size="sm"
            isLoading={deletingId === notice.id}
            onClick={() => setPendingDelete(notice)}
          >
            Delete
          </Button>
        )}
      />

      {isModalOpen && (
        <Modal title="New Notice" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Notice Details">
              <FormGrid>
                <Input
                  label="Title"
                  required
                  style={{ gridColumn: "1 / -1" }}
                  error={errors.title?.message}
                  {...register("title", { required: "Title is required" })}
                />
                <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <label className={styles.label} htmlFor="notice-body">
                    Body<span className={styles.required}>*</span>
                  </label>
                  <textarea
                    id="notice-body"
                    rows={4}
                    className={styles.textarea}
                    {...register("body", { required: "Body is required" })}
                  />
                  {errors.body?.message && <span className={styles.error}>{errors.body.message}</span>}
                </div>
                <Select
                  label="Audience Role"
                  options={[
                    { label: "Everyone (Entire School)", value: "" },
                    { label: "Teachers (Staff Only)", value: "TEACHER" },
                    { label: "Students / Class", value: "STUDENT" },
                  ]}
                  {...register("targetRole", {
                    onChange: (e) => {
                      if (e.target.value !== "STUDENT") {
                        setValue("targetClassSectionId", "");
                      }
                    },
                  })}
                />
                <Select
                  label="Class Section"
                  disabled={selectedRole !== "STUDENT"}
                  options={[
                    {
                      label:
                        selectedRole === ""
                          ? "N/A (Whole School Announcement)"
                          : selectedRole === "TEACHER"
                          ? "N/A (Staff Notice for Teachers)"
                          : "All Classes",
                      value: "",
                    },
                    ...(classSections ?? []).map((cs) => ({
                      label: `${cs.className} - ${cs.section}`,
                      value: cs.id,
                    })),
                  ]}
                  {...register("targetClassSectionId")}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreating}>
                Post Notice
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete notice?"
          message={`"${pendingDelete.title}" will be permanently removed for everyone it was visible to.`}
          confirmLabel="Delete"
          tone="danger"
          isLoading={deletingId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await handleDelete(pendingDelete);
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default AdminNoticesPage;
