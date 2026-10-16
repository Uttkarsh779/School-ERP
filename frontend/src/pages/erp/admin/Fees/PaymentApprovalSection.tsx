import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
} from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import {
  useApproveFeePaymentMutation,
  useCreateManualPaymentMutation,
  useGetFeePaymentsQuery,
  useGetFeeStructuresQuery,
} from "../../../../store/api/fees.api";
import styles from "./AdminFeesPage.module.css";

interface PaymentFormInputs {
  feeStructureId: string;
  amount: string;
  mode: FeeMode;
  transactionRef: string;
}

const modeOptions: SelectOption[] = [
  { label: "Cash", value: "CASH" },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "UPI (Manual)", value: "UPI_MANUAL" },
  { label: "Gateway", value: "GATEWAY" },
];

const modeLabel: Record<FeeMode, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  UPI_MANUAL: "UPI",
  GATEWAY: "Gateway",
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Class-section-scoped student picker; once a student is selected, shows their full
// payment history (including any PENDING_REVIEW claims, with an Approve action) and
// lets the admin record a new payment directly — which is auto-approved on creation.
const PaymentApprovalSection = () => {
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const { data: classSections } = useGetClassSectionsQuery();
  const { data: students, isLoading: isLoadingStudents } = useGetStudentsQuery(
    classSectionId ? { classSectionId: Number(classSectionId) } : undefined,
    { skip: !classSectionId }
  );

  const {
    data: payments,
    isLoading: isLoadingPayments,
    isFetching: isFetchingPayments,
  } = useGetFeePaymentsQuery({ studentId: Number(studentId) }, { skip: !studentId });

  const { data: structures } = useGetFeeStructuresQuery(
    classSectionId ? { classSectionId: Number(classSectionId) } : undefined,
    { skip: !classSectionId }
  );

  const [createManualPayment, { isLoading: isCreating }] = useCreateManualPaymentMutation();
  const [approveFeePayment] = useApproveFeePaymentMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentFormInputs>({
    defaultValues: { feeStructureId: "", amount: "", mode: "CASH", transactionRef: "" },
  });

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const studentOptions: SelectOption[] = (students ?? []).map((s) => ({
    label: `${s.rollNo} — ${s.name}`,
    value: s.id,
  }));

  const structureOptions: SelectOption[] = (structures ?? []).map((s: any) => ({
    label: `${s.head} (₹${s?.amount?.toLocaleString("en-IN")})`,
    value: s.id,
  }));

  const pendingCount = useMemo(
    () => (payments ?? []).filter((p) => p.status === "PENDING_REVIEW").length,
    [payments]
  );

  const handleClassChange = (value: string) => {
    setClassSectionId(value);
    setStudentId("");
  };

  const openModal = () => {
    reset({ feeStructureId: "", amount: "", mode: "CASH", transactionRef: "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = async (values: PaymentFormInputs) => {
    if (!studentId || !values.feeStructureId) {
      toast.error("Select a fee head first.");
      return;
    }
    try {
      await (createManualPayment as any)({
        studentId: Number(studentId),
        feeStructureId: Number(values.feeStructureId),
        amount: Number(values.amount),
        mode: values.mode,
        transactionRef: values.transactionRef || undefined,
      }).unwrap();
      toast.success("Payment recorded and approved.");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to record payment."));
    }
  };

  const handleApprove = async (paymentId: number) => {
    setApprovingId(paymentId);
    try {
      await approveFeePayment(paymentId).unwrap();
      toast.success("Payment approved.");
    } catch {
      toast.error("Failed to approve payment.");
    } finally {
      setApprovingId(null);
    }
  };

  const columns: TableColumn<IFeePayment>[] = [
    { key: "head", label: "Fee Head", render: (row) => row.feeStructure?.head ?? "—" },
    { key: "amount", label: "Amount", render: (row) => `₹${row.amount.toLocaleString("en-IN")}` },
    { key: "mode", label: "Mode", render: (row) => modeLabel[row.mode] },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge tone={row.status === "APPROVED" ? "success" : "warning"}>{row.status === "APPROVED" ? "Approved" : "Pending Review"}</Badge>,
    },
    { key: "receiptNumber", label: "Receipt No.", render: (row) => row.receiptNumber ?? "—" },
    {
      key: "actions",
      label: "Actions",
      render: (row) =>
        row.status === "PENDING_REVIEW" ? (
          <Button type="button" size="sm" isLoading={approvingId === row.id} onClick={() => handleApprove(row.id)}>
            Approve
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <Card
      title="Record & Approve Payments"
      subtitle="Pick a student to view their payment history, approve pending claims, or record a new payment."
      action={
        <Button type="button" size="sm" disabled={!studentId} onClick={openModal}>
          + Record Payment
        </Button>
      }
    >
      <div className={styles.filterRow}>
        <Select
          label="Class Section"
          options={classSectionOptions}
          placeholder="Select a class section"
          value={classSectionId}
          onChange={(e) => handleClassChange(e.target.value)}
        />
        <Select
          label="Student"
          options={studentOptions}
          placeholder={isLoadingStudents ? "Loading…" : "Select a student"}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          disabled={!classSectionId}
        />
      </div>

      {!studentId ? (
        <EmptyState title="Pick a student" description="Select a class section and student above to view their fee payments." />
      ) : isLoadingPayments || isFetchingPayments ? (
        <Spinner />
      ) : (
        <>
          {pendingCount > 0 && (
            <div className={styles.pendingBanner}>
              {pendingCount} payment{pendingCount === 1 ? "" : "s"} awaiting review for this student.
            </div>
          )}
          <Table columns={columns} data={payments ?? []} keyField="id" emptyMessage="No payments recorded yet." />
        </>
      )}

      {isModalOpen && (
        <Modal title="Record Payment" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Payment Details">
              <FormGrid>
                <Select
                  label="Fee Head"
                  required
                  placeholder="Select a fee head"
                  options={structureOptions}
                  error={errors.feeStructureId?.message}
                  {...register("feeStructureId", { required: "Fee head is required" })}
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
                <Select label="Mode" options={modeOptions} {...register("mode", { required: true })} />
                <Input label="Transaction Ref (optional)" {...register("transactionRef")} />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreating}>
                Record Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
};

export default PaymentApprovalSection;
