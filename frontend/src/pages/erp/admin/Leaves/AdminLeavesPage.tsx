import { useState } from "react";
import { Card, PageHeader, Select, Spinner, StatCard } from "../../../../components/ui";
import { LeaveTable } from "../../../../components/shared/Leave/LeaveParts";
import { useGetAllLeavesQuery } from "../../../../store/api/leaves.api";

// Admin: staff leave requests to decide, plus oversight of student leave.
const AdminLeavesPage = () => {
  const [kind, setKind] = useState("STAFF");
  const [status, setStatus] = useState("");
  const { data = [], isLoading } = useGetAllLeavesQuery({ kind: kind || undefined, status: status || undefined });
  const { data: allPending = [] } = useGetAllLeavesQuery({ status: "PENDING" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <PageHeader title="Leave Requests" subtitle="Staff leave to approve, and student leave across the school" />
      <div className="erp-two-up-sm" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <StatCard label="Staff requests pending" value={allPending.filter((l) => l.kind === "STAFF").length} />
        <StatCard label="Student requests pending" value={allPending.filter((l) => l.kind === "STUDENT").length} />
      </div>
      <Card
        title={kind === "STUDENT" ? "Student leave" : kind === "STAFF" ? "Staff leave" : "All leave"}
        subtitle={kind === "STUDENT" ? "Usually decided by the class teacher — you can decide too" : undefined}
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Select
              aria-label="Who"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={[
                { label: "Staff", value: "STAFF" },
                { label: "Students", value: "STUDENT" },
                { label: "Everyone", value: "" },
              ]}
            />
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { label: "All statuses", value: "" },
                { label: "Pending", value: "PENDING" },
                { label: "Approved", value: "APPROVED" },
                { label: "Rejected", value: "REJECTED" },
                { label: "Cancelled", value: "CANCELLED" },
              ]}
            />
          </div>
        }
      >
        {isLoading ? <Spinner /> : <LeaveTable rows={data} mode="decide" showPerson />}
      </Card>
    </div>
  );
};

export default AdminLeavesPage;
