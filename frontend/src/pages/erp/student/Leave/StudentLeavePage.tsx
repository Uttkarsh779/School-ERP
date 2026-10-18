import { Card, PageHeader, Spinner } from "../../../../components/ui";
import { ApplyLeaveCard, LeaveTable } from "../../../../components/shared/Leave/LeaveParts";
import { useGetMyLeavesQuery } from "../../../../store/api/leaves.api";

// Student: apply for leave (decided by the class teacher) and track requests.
const StudentLeavePage = () => {
  const { data = [], isLoading } = useGetMyLeavesQuery();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <PageHeader title="Leave" subtitle="Apply for leave — your class teacher approves it" />
      <ApplyLeaveCard who="yourself" hint="Apply before the leave, or within 7 days after it started." />
      <Card title="My requests">{isLoading ? <Spinner /> : <LeaveTable rows={data} mode="mine" />}</Card>
    </div>
  );
};

export default StudentLeavePage;
