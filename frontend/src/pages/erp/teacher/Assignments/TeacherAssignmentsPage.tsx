import { useState } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Table,
} from "../../../../components/ui";
import {
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetAssignmentsQuery,
} from "../../../../store/api/assignments.api";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import styles from "./TeacherAssignmentsPage.module.css";

const formatDate = (isoStr: string) => {
  return new Date(isoStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const TeacherAssignmentsPage = () => {
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formSubjectId, setFormSubjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const csId = selectedClassId ? Number(selectedClassId) : undefined;

  const { data: classSections, isLoading: isLoadingSections } = useGetMyClassSectionsQuery();
  const { data: assignments, isLoading: isLoadingAssignments } = useGetAssignmentsQuery(
    csId ? { classSectionId: csId } : undefined
  );
  const { data: subjects } = useGetSubjectsQuery({ classSectionId: csId ?? 0 }, { skip: !csId });

  const [createAssignment, { isLoading: isCreating }] = useCreateAssignmentMutation();
  const [deleteAssignment] = useDeleteAssignmentMutation();

  const handleOpenModal = () => {
    if (!csId) {
      toast.error("Please select a class section first");
      return;
    }
    setTitle("");
    setDescription("");
    setFormSubjectId(subjects?.[0]?.id.toString() || "");
    setDueDate("");
    setEndDate("");
    setAttachmentUrl("");
    setShowCreateModal(true);
  };

  const handlePostAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csId || !title || !description || !formSubjectId || !dueDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await createAssignment({
        classSectionId: csId,
        subjectId: Number(formSubjectId),
        title,
        description,
        dueDate,
        endDate: endDate || dueDate,
        attachmentUrl: attachmentUrl || undefined,
      }).unwrap();

      toast.success("Homework assignment posted successfully!");
      setShowCreateModal(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to post assignment");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete assignment "${name}"?`)) {
      try {
        await deleteAssignment(id).unwrap();
        toast.success("Assignment deleted");
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to delete assignment");
      }
    }
  };

  const classOptions = [
    { label: "All My Classes", value: "" },
    ...(classSections ?? []).map((cs) => ({
      label: `${cs.className} - ${cs.section}`,
      value: cs.id.toString(),
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Homework & Assignments Management"
        subtitle="Post daily class assignments, homework tasks & reference links"
        actions={
          <Button
            variant="primary"
            icon={<Icon name="plus" size={16} />}
            onClick={handleOpenModal}
          >
            + Post Homework
          </Button>
        }
      />

      <Card title="Class Filter & Homework Roster">
        <div style={{ maxWidth: "300px", marginBottom: "1.25rem" }}>
          <Select
            label="Select Class Section"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            options={classOptions}
          />
        </div>

        {isLoadingAssignments ? (
          <Spinner />
        ) : !assignments || assignments.length === 0 ? (
          <EmptyState
            title="No assignments found"
            description="No homework tasks posted for the selected filter."
          />
        ) : (
          <Table
            keyField="id"
            columns={[
              {
                key: "classSection",
                label: "Class Section",
                render: (a: any) => `${a.classSection?.className} - ${a.classSection?.section}`,
              },
              {
                key: "subject",
                label: "Subject",
                render: (a: any) => <strong>{a.subject?.name}</strong>,
              },
              {
                key: "title",
                label: "Assignment Title",
                render: (a: any) => <strong>{a.title}</strong>,
              },
              {
                key: "dueDate",
                label: "Submission Due Date",
                render: (a: any) => formatDate(a.dueDate),
              },
              {
                key: "assignedBy",
                label: "Assigned By",
                render: (a: any) => a.assignedBy?.user?.name || "Teacher",
              },
              {
                key: "action",
                label: "Actions",
                render: (a: any) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(a.id, a.title)}
                  >
                    Delete
                  </Button>
                ),
              },
            ]}
            data={assignments}
          />
        )}
      </Card>

      {/* CREATE HOMEWORK MODAL */}
      {showCreateModal && (
        <Modal title="Post New Homework Assignment" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handlePostAssignment} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Select
              label="Subject *"
              required
              value={formSubjectId}
              onChange={(e) => setFormSubjectId(e.target.value)}
              options={(subjects ?? []).map((s) => ({ label: s.name, value: s.id.toString() }))}
            />

            <Input
              label="Assignment Title *"
              type="text"
              required
              placeholder="e.g. Chapter 4 Exercises 1-10"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Input
                label="Submission Due Date *"
                type="date"
                required
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  if (!endDate) setEndDate(e.target.value);
                }}
              />
              <Input
                label="Display End Date (Visibility)"
                type="date"
                placeholder="Last date visible on student board"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--erp-text)", display: "block", marginBottom: "0.35rem" }}>
                Detailed Instructions / Homework Description *
              </label>
              <textarea
                required
                rows={4}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--erp-radius-sm)",
                  border: "1px solid var(--erp-border)",
                  fontFamily: "inherit",
                  fontSize: "0.88rem",
                  color: "var(--erp-text)",
                  background: "var(--erp-surface)",
                }}
                placeholder="Explain exact problem numbers, reading assignments or submission instructions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Input
              label="Optional Reference Link / Attachment URL"
              type="url"
              placeholder="e.g. https://drive.google.com/doc..."
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreating}>
                Post Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default TeacherAssignmentsPage;
