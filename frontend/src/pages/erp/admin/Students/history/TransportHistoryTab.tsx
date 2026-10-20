import { Badge, Card, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import TransportInfoCard from "../../../../../components/shared/TransportInfoCard/TransportInfoCard";
import type { StudentHistory } from "../../../../../store/api/students.api";
import { fmtDate, humanize, inr } from "./historyFormat";
import styles from "./StudentHistory.module.css";

type Assignment = StudentHistory["transport"][number];

// Current bus route / vehicle, plus every village (fee location) assignment over time.
const TransportHistoryTab = ({
  student,
  history,
  onManageTransport,
}: {
  student: IStudent;
  history: StudentHistory;
  onManageTransport: () => void;
}) => {
  const columns: TableColumn<Assignment>[] = [
    { key: "villageName", label: "Village / Stop", render: (a) => <strong>{a.villageName ?? "—"}</strong> },
    { key: "monthlyFee", label: "Monthly Fee", render: (a) => (a.monthlyFee === null ? "—" : inr(a.monthlyFee)) },
    { key: "startDate", label: "From", render: (a) => fmtDate(a.startDate) },
    { key: "endDate", label: "To", render: (a) => (a.endDate ? fmtDate(a.endDate) : a.status === "ACTIVE" ? "Present" : "—") },
    { key: "policy", label: "Billing", render: (a) => humanize(a.policy) },
    {
      key: "status",
      label: "Status",
      render: (a) => (
        <div>
          <Badge tone={a.status === "ACTIVE" ? "success" : "neutral"}>{humanize(a.status)}</Badge>
          {a.discontinueReason && <div className={styles.muted}>{a.discontinueReason}</div>}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.tab}>
      <TransportInfoCard
        student={student}
        activeAssignment={history.transport.find((a) => a.status === "ACTIVE") ?? null}
        onAssignTransport={onManageTransport}
      />
      <Card title="Transport history" subtitle="Every village / fee-location assignment, newest first">
        <Table columns={columns} data={history.transport} keyField="id" emptyMessage="This student has never used school transport." />
      </Card>
    </div>
  );
};

export default TransportHistoryTab;
