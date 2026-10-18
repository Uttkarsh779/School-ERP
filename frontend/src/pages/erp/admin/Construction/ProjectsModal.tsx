import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Badge, Button, FormGrid, FormSection, Input, Modal, Select, Table, type TableColumn } from "../../../../components/ui";
import {
  useCreateConstructionProjectMutation,
  useUpdateConstructionProjectMutation,
  type ConstructionProject,
  type ConstructionProjectStatus,
  type ProjectInput,
} from "../../../../store/api/construction.api";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  formatINR,
  getErrorMessage,
  toOptions,
} from "./constructionFormat";
import styles from "./ConstructionExpensePage.module.css";

interface FormValues {
  name: string;
  location: string;
  budget: string;
  status: string;
  startDate: string;
  endDate: string;
  description: string;
}

const emptyValues: FormValues = {
  name: "",
  location: "",
  budget: "",
  status: "IN_PROGRESS",
  startDate: "",
  endDate: "",
  description: "",
};

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

// Projects are never deleted (expenses reference them) — mark them Completed / On Hold.
const ProjectsModal = ({ projects, onClose }: { projects: ConstructionProject[]; onClose: () => void }) => {
  const [editing, setEditing] = useState<ConstructionProject | "new" | null>(projects.length === 0 ? "new" : null);
  const [createProject, { isLoading: isCreating }] = useCreateConstructionProjectMutation();
  const [updateProject, { isLoading: isUpdating }] = useUpdateConstructionProjectMutation();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: emptyValues });

  const startDate = watch("startDate");

  const openForm = (project: ConstructionProject | "new") => {
    setEditing(project);
    reset(
      project === "new"
        ? emptyValues
        : {
            name: project.name,
            location: project.location ?? "",
            budget: project.budget ? String(Number(project.budget)) : "",
            status: project.status,
            startDate: project.startDate?.slice(0, 10) ?? "",
            endDate: project.endDate?.slice(0, 10) ?? "",
            description: project.description ?? "",
          }
    );
  };

  const onSubmit = async (values: FormValues) => {
    const input: ProjectInput = {
      name: values.name.trim(),
      location: values.location.trim() || null,
      budget: values.budget.trim() || null,
      status: values.status as ConstructionProjectStatus,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      description: values.description.trim() || null,
    };
    try {
      if (editing && editing !== "new") {
        await updateProject({ id: editing.id, ...input }).unwrap();
        toast.success("Project updated");
      } else {
        await createProject(input).unwrap();
        toast.success("Project added");
      }
      setEditing(null);
      reset(emptyValues);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save project"));
    }
  };

  const columns: TableColumn<ConstructionProject>[] = [
    {
      key: "name",
      label: "Project",
      render: (p) => (
        <div>
          <div className={styles.primaryText}>{p.name}</div>
          {p.location && <div className={styles.mutedText}>{p.location}</div>}
        </div>
      ),
    },
    { key: "status", label: "Status", render: (p) => <Badge tone={PROJECT_STATUS_TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge> },
    { key: "budget", label: "Budget", render: (p) => (p.budget ? formatINR(p.budget) : "—") },
    { key: "totalSpent", label: "Spent", render: (p) => formatINR(p.totalSpent) },
    { key: "expenseCount", label: "Entries" },
    {
      key: "actions",
      label: "",
      render: (p) => (
        <Button type="button" size="sm" variant="outline" onClick={() => openForm(p)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Modal title="Construction Projects" size="xl" onClose={onClose}>
      {editing ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormSection title={editing === "new" ? "New Project" : `Edit ${editing.name}`}>
            <FormGrid>
              <Input
                label="Project / Building Name"
                required
                placeholder="e.g. New Science Block"
                error={errors.name?.message}
                {...register("name", {
                  required: "Project name is required",
                  validate: (v) => v.trim().length > 0 || "Project name is required",
                  maxLength: { value: 200, message: "At most 200 characters" },
                })}
              />
              <Input label="Location" placeholder="e.g. North campus" {...register("location")} />
              <Input
                label="Budget (₹)"
                inputMode="decimal"
                placeholder="Optional"
                error={errors.budget?.message}
                {...register("budget", {
                  validate: (v) =>
                    !v.trim() || (AMOUNT_RE.test(v.trim()) && Number(v) > 0) || "Enter a valid positive amount",
                })}
              />
              <Select label="Status" options={toOptions(PROJECT_STATUS_LABEL)} {...register("status")} />
              <Input label="Start Date" type="date" {...register("startDate")} />
              <Input
                label="End Date"
                type="date"
                min={startDate || undefined}
                error={errors.endDate?.message}
                {...register("endDate", {
                  validate: (v) => !v || !startDate || v >= startDate || "End date cannot be before start date",
                })}
              />
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <label className={styles.label} htmlFor="project-description">
                  Description
                </label>
                <textarea id="project-description" rows={3} className={styles.textarea} {...register("description")} />
              </div>
            </FormGrid>
          </FormSection>
          <div className={styles.formActions}>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              {projects.length === 0 ? "Close" : "Back to list"}
            </Button>
            <Button type="submit" isLoading={isCreating || isUpdating}>
              {editing === "new" ? "Add Project" : "Save Changes"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className={styles.modalToolbar}>
            <span className={styles.mutedText}>
              Projects can't be deleted once created — mark finished work as Completed.
            </span>
            <Button type="button" size="sm" onClick={() => openForm("new")}>
              + New Project
            </Button>
          </div>
          <Table columns={columns} data={projects} keyField="id" emptyMessage="No projects yet." />
        </>
      )}
    </Modal>
  );
};

export default ProjectsModal;
