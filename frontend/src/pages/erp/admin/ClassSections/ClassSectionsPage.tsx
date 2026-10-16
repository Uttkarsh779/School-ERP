import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
} from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import {
  useCreateClassSectionMutation,
  useDeleteClassSectionMutation,
  useGetClassSectionsQuery,
  useUpdateClassSectionMutation,
} from "../../../../store/api/classSections.api";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useGetStaffListQuery } from "../../../../store/api/staff.api";
import styles from "./ClassSectionsPage.module.css";

interface ClassSectionFormInputs {
  className: string;
  section: string;
  sessionId: string;
  classTeacherId: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const ClassSectionsPage = () => {
  const { data: classSections, isLoading, isError } = useGetClassSectionsQuery();
  const { data: sessions } = useGetSessionsQuery();
  const { data: staffList } = useGetStaffListQuery();

  const [createClassSection, { isLoading: isCreating }] = useCreateClassSectionMutation();
  const [updateClassSection, { isLoading: isUpdating }] = useUpdateClassSectionMutation();
  const [deleteClassSection, { isLoading: isDeleting }] = useDeleteClassSectionMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<IClassSection | null>(null);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<IClassSection | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClassSectionFormInputs>({
    defaultValues: { className: "", section: "", sessionId: "", classTeacherId: "" },
  });

  const currentSession = sessions?.find((session) => session.isCurrent);

  const sessionOptions: SelectOption[] = (sessions ?? []).map((session) => ({
    label: session.name,
    value: session.id,
  }));

  const staffOptions: SelectOption[] = (staffList ?? []).map((staff) => ({
    label: staff.user.name ?? staff.user.email,
    value: staff.id,
  }));

  const openCreateModal = () => {
    setEditingSection(null);
    reset({
      className: "",
      section: "",
      sessionId: currentSession ? String(currentSession.id) : "",
      classTeacherId: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (sectionObj: IClassSection) => {
    setEditingSection(sectionObj);
    reset({
      className: sectionObj.className,
      section: sectionObj.section,
      sessionId: String(sectionObj.sessionId),
      classTeacherId: sectionObj.classTeacherId ? String(sectionObj.classTeacherId) : "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSection(null);
    reset();
  };

  const onSubmit = async (values: ClassSectionFormInputs) => {
    try {
      if (editingSection) {
        await updateClassSection({
          id: editingSection.id,
          className: values.className,
          section: values.section,
          classTeacherId: values.classTeacherId ? Number(values.classTeacherId) : null,
        }).unwrap();
        toast.success("Class section updated successfully");
      } else {
        await createClassSection({
          sessionId: Number(values.sessionId),
          className: values.className,
          section: values.section,
          classTeacherId: values.classTeacherId ? Number(values.classTeacherId) : undefined,
        }).unwrap();
        toast.success("Class section created successfully");
      }
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, editingSection ? "Failed to update class section" : "Failed to create class section"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteSection) return;
    try {
      await deleteClassSection(pendingDeleteSection.id).unwrap();
      toast.success("Class section deleted successfully");
      setPendingDeleteSection(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete class section"));
    }
  };

  const columns: TableColumn<IClassSection>[] = [
    { key: "className", label: "Class" },
    { key: "section", label: "Section" },
    {
      key: "classTeacher",
      label: "Class Teacher",
      render: (row) =>
        row.classTeacher?.user.name ? row.classTeacher.user.name : <Badge tone="neutral">Unassigned</Badge>,
    },
    {
      key: "students",
      label: "Enrolled Students",
      render: (row) => row._count?.students ?? 0,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPendingDeleteSection(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Class Sections"
        subtitle="Manage classes, sections and their assigned class teachers"
        actions={
          <Button variant="primary" onClick={openCreateModal}>
            + New Class Section
          </Button>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load class sections" description="Please try refreshing the page." />
      ) : !classSections || classSections.length === 0 ? (
        <EmptyState
          title="No class sections yet"
          description="Create your first class section to get started."
          action={
            <Button variant="primary" onClick={openCreateModal}>
              + New Class Section
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={classSections} keyField="id" />
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal title={editingSection ? "Edit Class Section" : "New Class Section"} onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Class Section Details">
              <FormGrid>
                <Input
                  label="Class Name"
                  placeholder="e.g. Class 5"
                  required
                  error={errors.className?.message}
                  {...register("className", { required: "Class name is required" })}
                />
                <Input
                  label="Section"
                  placeholder="e.g. A"
                  required
                  error={errors.section?.message}
                  {...register("section", { required: "Section is required" })}
                />
                {!editingSection && (
                  <Select
                    label="Academic Session"
                    required
                    placeholder="Select a session"
                    options={sessionOptions}
                    error={errors.sessionId?.message}
                    {...register("sessionId", { required: "Session is required" })}
                  />
                )}
                <Select
                  label="Class Teacher"
                  placeholder="Unassigned"
                  options={staffOptions}
                  {...register("classTeacherId")}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={editingSection ? isUpdating : isCreating}>
                {editingSection ? "Save Changes" : "Create Class Section"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      {pendingDeleteSection && (
        <ConfirmDialog
          title="Delete Class Section"
          message={`Are you sure you want to delete "${pendingDeleteSection.className} - ${pendingDeleteSection.section}"?`}
          confirmLabel="Delete Section"
          tone="primary"
          isLoading={isDeleting}
          onCancel={() => setPendingDeleteSection(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
};

export default ClassSectionsPage;
