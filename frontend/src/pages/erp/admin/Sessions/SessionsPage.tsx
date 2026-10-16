import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Table,
} from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useCreateSessionMutation,
  useGetSessionsQuery,
  useSetCurrentSessionMutation,
} from "../../../../store/api/sessions.api";
import styles from "./SessionsPage.module.css";

interface SessionFormInputs {
  name: string;
  startDate: string;
  endDate: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const SessionsPage = () => {
  const { data: sessions, isLoading, isError } = useGetSessionsQuery();
  const [createSession, { isLoading: isCreating }] = useCreateSessionMutation();
  const [setCurrentSession] = useSetCurrentSessionMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [settingCurrentId, setSettingCurrentId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SessionFormInputs>();

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = async (values: SessionFormInputs) => {
    try {
      await createSession(values).unwrap();
      toast.success("Academic session created");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create session"));
    }
  };

  const handleSetCurrent = async (id: number) => {
    setSettingCurrentId(id);
    try {
      await setCurrentSession(id).unwrap();
      toast.success("Current session updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update current session"));
    } finally {
      setSettingCurrentId(null);
    }
  };

  const columns: TableColumn<IAcademicSession>[] = [
    { key: "name", label: "Session" },
    { key: "startDate", label: "Start Date", render: (row) => formatDate(row.startDate) },
    { key: "endDate", label: "End Date", render: (row) => formatDate(row.endDate) },
    {
      key: "isCurrent",
      label: "Status",
      render: (row) =>
        row.isCurrent ? <Badge tone="success">Current</Badge> : <Badge tone="neutral">Inactive</Badge>,
    },
    {
      key: "actions",
      label: "",
      width: "10rem",
      render: (row) =>
        row.isCurrent ? null : (
          <Button
            variant="outline"
            size="sm"
            isLoading={settingCurrentId === row.id}
            onClick={() => handleSetCurrent(row.id)}
          >
            Set as current
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Academic Sessions"
        subtitle="Manage the school's academic years and mark the active one"
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + New Session
          </Button>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load sessions" description="Please try refreshing the page." />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState
          title="No academic sessions yet"
          description="Create your first academic session to get started."
          action={
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + New Session
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={sessions} keyField="id" />
      )}

      {isModalOpen && (
        <Modal title="New Academic Session" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Session Details">
              <FormGrid>
                <Input
                  label="Session Name"
                  placeholder="e.g. 2026-2027"
                  required
                  style={{ gridColumn: "1 / -1" }}
                  error={errors.name?.message}
                  {...register("name", { required: "Session name is required" })}
                />
                <Input
                  label="Start Date"
                  type="date"
                  required
                  error={errors.startDate?.message}
                  {...register("startDate", { required: "Start date is required" })}
                />
                <Input
                  label="End Date"
                  type="date"
                  required
                  error={errors.endDate?.message}
                  {...register("endDate", { required: "End date is required" })}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreating}>
                Create Session
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default SessionsPage;
