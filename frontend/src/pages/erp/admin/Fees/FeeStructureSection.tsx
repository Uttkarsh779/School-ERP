import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Button, Card, EmptyState, FormGrid, FormSection, Input, Modal, Select, Spinner, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useCreateFeeStructureMutation, useGetFeeStructuresQuery } from "../../../../store/api/fees.api";
import styles from "./AdminFeesPage.module.css";

interface FeeHeadFormInputs {
  head: string;
  amount: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Class-section + session pickers, list existing fee heads/amounts for that class,
// and a modal to add a new fee head — the school's per-class fee structure setup.
const FeeStructureSection = () => {
  const [sessionId, setSessionId] = useState<string>("");
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: sessions } = useGetSessionsQuery();
  const { data: classSections, isLoading: isLoadingSections } = useGetClassSectionsQuery(
    sessionId ? { sessionId: Number(sessionId) } : undefined
  );

  const {
    data: structures,
    isLoading: isLoadingStructures,
    isFetching: isFetchingStructures,
  } = useGetFeeStructuresQuery(
    classSectionId ? { classSectionId: Number(classSectionId), sessionId: sessionId ? Number(sessionId) : undefined } : undefined,
    { skip: !classSectionId }
  );

  const [createFeeStructure, { isLoading: isCreating }] = useCreateFeeStructureMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeeHeadFormInputs>({ defaultValues: { head: "", amount: "" } });

  const sessionOptions: SelectOption[] = (sessions ?? []).map((s) => ({ label: s.name, value: s.id }));
  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const handleSessionChange = (value: string) => {
    setSessionId(value);
    setClassSectionId("");
  };

  const openModal = () => {
    reset({ head: "", amount: "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = async (values: FeeHeadFormInputs) => {
    if (!classSectionId || !sessionId) {
      toast.error("Select a session and class section first.");
      return;
    }
    try {
      await createFeeStructure({
        classSectionId: Number(classSectionId),
        sessionId: Number(sessionId),
        head: values.head,
        amount: Number(values.amount),
      }).unwrap();
      toast.success("Fee head added.");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add fee head."));
    }
  };

  const columns: TableColumn<IFeeStructure>[] = [
    { key: "head", label: "Fee Head", render: (row) => row.head || row.items?.[0]?.feeHead?.name || "Standard Fee" },
    { key: "amount", label: "Amount", render: (row) => `₹${Number(row.amount ?? row.items?.[0]?.amount ?? 0).toLocaleString("en-IN")}` },
  ];

  return (
    <Card
      title="Fee Structure"
      subtitle="Set up per-class fee heads (tuition, transport, misc.) and amounts for a session."
      action={
        <Button type="button" size="sm" disabled={!classSectionId} onClick={openModal}>
          + Add Fee Head
        </Button>
      }
    >
      <div className={styles.filterRow}>
        <Select
          label="Academic Session"
          options={sessionOptions}
          placeholder="All sessions"
          value={sessionId}
          onChange={(e) => handleSessionChange(e.target.value)}
        />
        <Select
          label="Class Section"
          options={classSectionOptions}
          placeholder={isLoadingSections ? "Loading…" : "Select a class section"}
          value={classSectionId}
          onChange={(e) => setClassSectionId(e.target.value)}
        />
      </div>

      {!classSectionId ? (
        <EmptyState title="Pick a class section" description="Select a class section above to view its fee structure." />
      ) : isLoadingStructures || isFetchingStructures ? (
        <Spinner />
      ) : (
        <Table columns={columns} data={structures ?? []} keyField="id" emptyMessage="No fee heads configured yet." />
      )}

      {isModalOpen && (
        <Modal title="Add Fee Head" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Fee Head Details">
              <FormGrid>
                <Input
                  label="Head"
                  placeholder="e.g. tuition, transport, misc"
                  required
                  error={errors.head?.message}
                  {...register("head", { required: "Fee head is required" })}
                />
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  error={errors.amount?.message}
                  {...register("amount", { required: "Amount is required" })}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreating}>
                Add Fee Head
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
};

export default FeeStructureSection;
