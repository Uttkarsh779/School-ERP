import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, Select, Spinner, StatCard, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import {
  useDecideRefundMutation,
  useGetRefundsQuery,
  useProcessRefundMutation,
  type RefundRecord,
} from "../../../../../store/api/fees.api";
import { fmtDate, getErrorMessage, inr } from "../feeUtils";
import styles from "../Fees.module.css";

const STATUS: Record<RefundRecord["status"], { label: string; tone: "warning" | "info" | "success" | "danger" }> = {
  REFUND_REQUESTED: { label: "Awaiting approval", tone: "warning" },
  REFUND_APPROVED: { label: "Approved — to pay out", tone: "info" },
  REFUND_PROCESSED: { label: "Paid out", tone: "success" },
  REFUND_REJECTED: { label: "Rejected", tone: "danger" },
};

type PendingAction = { refund: RefundRecord; action: "approve" | "reject" | "process" };

// Refund requests: Super Admin approves/rejects and marks approved refunds as paid out
// (the server enforces this); Admin can see them.
const RefundsTab = ({ isSuperAdmin }: { isSuperAdmin: boolean }) => {
  const { data: refunds = [], isLoading } = useGetRefundsQuery();
  const [decide, { isLoading: deciding }] = useDecideRefundMutation();
  const [process, { isLoading: processing }] = useProcessRefundMutation();
  const [statusFilter, setStatusFilter] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const rows = useMemo(
    () => refunds.filter((r) => !statusFilter || r.status === statusFilter),
    [refunds, statusFilter]
  );
  const sum = (s: RefundRecord["status"]) => refunds.filter((r) => r.status === s).reduce((t, r) => t + Number(r.amount), 0);

  const run = async () => {
    if (!pending) return;
    try {
      if (pending.action === "process") {
        await process(pending.refund.id).unwrap();
        toast.success("Refund marked as paid out");
      } else {
        await decide({ id: pending.refund.id, approved: pending.action === "approve" }).unwrap();
        toast.success(pending.action === "approve" ? "Refund approved" : "Refund rejected");
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the refund"));
    } finally {
      setPending(null);
    }
  };

  const columns: TableColumn<RefundRecord>[] = [
    { key: "refundNumber", label: "Refund No", render: (r) => <strong>{r.refundNumber}</strong> },
    {
      key: "student",
      label: "Student",
      render: (r) => (
        <div>
          <div className={styles.itemTitle}>{r.student?.name ?? `Student #${r.studentId}`}</div>
          <div className={styles.muted}>Adm {r.student?.admissionNo ?? "—"}</div>
        </div>
      ),
    },
    { key: "amount", label: "Amount", render: (r) => <span className={styles.amount}>{inr(r.amount)}</span> },
    {
      key: "reason",
      label: "Reason",
      render: (r) => (
        <div>
          <div>{r.reason}</div>
          <div className={styles.muted}>
            Requested by {r.requestedByUser?.name ?? "—"} · {fmtDate(r.createdAt)}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <div>
          <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          {r.approvedByUser && <div className={styles.muted}>by {r.approvedByUser.name}</div>}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r) =>
        !isSuperAdmin ? null : r.status === "REFUND_REQUESTED" ? (
          <div className={styles.rowActions}>
            <Button size="sm" onClick={() => setPending({ refund: r, action: "approve" })}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending({ refund: r, action: "reject" })}>Reject</Button>
          </div>
        ) : r.status === "REFUND_APPROVED" ? (
          <Button size="sm" variant="outline" onClick={() => setPending({ refund: r, action: "process" })}>Mark paid out</Button>
        ) : null,
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label="Awaiting approval" value={inr(sum("REFUND_REQUESTED"))} />
        <StatCard label="Approved, not yet paid out" value={inr(sum("REFUND_APPROVED"))} />
        <StatCard label="Paid out" value={inr(sum("REFUND_PROCESSED"))} />
      </div>
      <Card
        title="Refund requests"
        subtitle={isSuperAdmin ? "Approve or reject, then mark as paid out once the money is returned" : "Approval is done by a Super Admin"}
        action={
          <Select
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ label: "All statuses", value: "" }, ...Object.entries(STATUS).map(([value, m]) => ({ label: m.label, value }))]}
          />
        }
      >
        {isLoading ? <Spinner /> : <Table columns={columns} data={rows} keyField="id" mobilePrimary="student" emptyMessage="No refund requests." />}
      </Card>

      {pending && (
        <ConfirmDialog
          title={pending.action === "approve" ? "Approve refund?" : pending.action === "reject" ? "Reject refund?" : "Mark as paid out?"}
          message={
            pending.action === "process"
              ? `Confirm ${inr(pending.refund.amount)} has been returned to ${pending.refund.student?.name ?? "the family"}. It will appear in their fee ledger.`
              : `${inr(pending.refund.amount)} for ${pending.refund.student?.name ?? "this student"} — "${pending.refund.reason}".`
          }
          confirmLabel={pending.action === "approve" ? "Approve" : pending.action === "reject" ? "Reject" : "Mark paid out"}
          tone={pending.action === "reject" ? "danger" : "primary"}
          isLoading={deciding || processing}
          onCancel={() => setPending(null)}
          onConfirm={run}
        />
      )}
    </div>
  );
};

export default RefundsTab;
