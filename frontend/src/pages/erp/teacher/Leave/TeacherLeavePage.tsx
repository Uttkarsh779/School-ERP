import { useState } from "react";
import { Card, PageHeader, Spinner } from "../../../../components/ui";
import { ApplyLeaveCard, LeaveTable } from "../../../../components/shared/Leave/LeaveParts";
import { useGetClassLeavesQuery, useGetMyLeavesQuery } from "../../../../store/api/leaves.api";
import tabStyles from "../../admin/Attendance/AdminAttendancePage.module.css";

// Teacher: decide student leave for classes they're class teacher of, and apply for their
// own leave (decided by an admin).
const TeacherLeavePage = () => {
  const { data: classLeaves = [], isLoading: classLoading } = useGetClassLeavesQuery();
  const { data: mine = [], isLoading: mineLoading } = useGetMyLeavesQuery();
  const pending = classLeaves.filter((l) => l.status === "PENDING").length;
  const [tab, setTab] = useState<"class" | "mine">("class");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <PageHeader title="Leave" subtitle="Student leave requests for your class, and your own leave" />
      <div className={tabStyles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "class"} className={[tabStyles.tab, tab === "class" ? tabStyles.tabActive : ""].join(" ")} onClick={() => setTab("class")}>
          Student requests{pending ? ` (${pending})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "mine"} className={[tabStyles.tab, tab === "mine" ? tabStyles.tabActive : ""].join(" ")} onClick={() => setTab("mine")}>
          My leave
        </button>
      </div>

      {tab === "class" ? (
        <Card title="Student leave requests" subtitle="For classes where you're the class teacher · approved days are marked Leave in attendance">
          {classLoading ? (
            <Spinner />
          ) : (
            <LeaveTable rows={classLeaves} mode="decide" showPerson emptyMessage="No student leave requests for your class." />
          )}
        </Card>
      ) : (
        <>
          <ApplyLeaveCard who="yourself" hint="Your request goes to the school admin." />
          <Card title="My requests">{mineLoading ? <Spinner /> : <LeaveTable rows={mine} mode="mine" />}</Card>
        </>
      )}
    </div>
  );
};

export default TeacherLeavePage;
