import { Card, PageHeader, Spinner } from "../../../../components/ui";
import { ApplyLeaveCard, LeaveTable } from "../../../../components/shared/Leave/LeaveParts";
import { useGetMyLeavesQuery } from "../../../../store/api/leaves.api";
import { useAppSelector } from "../../../../store/store";

// Own leave for staff who use the office console (office staff, Principal, Accountant). The
// Principal's leave is decided by the Super Admin; everyone else's by the Principal or office.
const MyLeavePage = () => {
  const role = useAppSelector((s) => s.auth.user?.role);
  const { data: mine = [], isLoading } = useGetMyLeavesQuery();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <PageHeader title="My Leave" subtitle="Apply for leave and see your requests" />
      <ApplyLeaveCard
        who="yourself"
        hint={role === "PRINCIPAL" ? "Your request goes to the Super Admin." : "Your request goes to the Principal or the office."}
      />
      <Card title="My requests">{isLoading ? <Spinner /> : <LeaveTable rows={mine} mode="mine" />}</Card>
    </div>
  );
};

export default MyLeavePage;
