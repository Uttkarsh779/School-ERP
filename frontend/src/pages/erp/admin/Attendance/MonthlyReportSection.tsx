import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useGetAttendanceMonthlyOverviewQuery } from "../../../../store/api/attendance.api";
import type { AttendanceMonthlyOverview } from "../../../../store/api/attendance.api";
import ClassRegisterView from "./ClassRegisterView";
import { LOW_ATTENDANCE_THRESHOLD, formatPct, monthLabel, pctTone } from "./attendanceFormat";
import styles from "./AdminAttendancePage.module.css";
import reportStyles from "./MonthlyReport.module.css";

type ClassRow = AttendanceMonthlyOverview["classes"][number];

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Month overview → click a class → day-wise class register → click a student → their month.
const MonthlyReportSection = () => {
  const { data: sessions } = useGetSessionsQuery();
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [sessionId, setSessionId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Default to the current academic session once sessions load.
  useEffect(() => {
    if (sessionId || !sessions) return;
    const current = sessions.find((s) => s.isCurrent);
    if (current) setSessionId(String(current.id));
  }, [sessions, sessionId]);

  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const hasValidMonth = Boolean(year && month);

  const { data, isLoading, isFetching, isError, refetch } = useGetAttendanceMonthlyOverviewQuery(
    { year, month, ...(sessionId ? { sessionId: Number(sessionId) } : {}) },
    { skip: !hasValidMonth || selectedClassId !== null }
  );

  useEffect(() => {
    if (isError) toast.error("Failed to load the monthly attendance report.");
  }, [isError]);

  if (selectedClassId !== null && hasValidMonth) {
    return (
      <ClassRegisterView
        classSectionId={selectedClassId}
        year={year}
        month={month}
        onBack={() => setSelectedClassId(null)}
      />
    );
  }

  const columns: TableColumn<ClassRow>[] = [
    {
      key: "class",
      label: "Class",
      render: (c) => (
        <button type="button" className={reportStyles.linkButton} onClick={() => setSelectedClassId(c.classSectionId)}>
          {c.className} - {c.section}
        </button>
      ),
    },
    { key: "studentCount", label: "Students" },
    { key: "workingDays", label: "Days Marked" },
    { key: "present", label: "Present", render: (c) => c.counts.PRESENT },
    { key: "absent", label: "Absent", render: (c) => c.counts.ABSENT },
    { key: "late", label: "Late", render: (c) => c.counts.LATE },
    { key: "leave", label: "Leave", render: (c) => c.counts.LEAVE },
    {
      key: "percentage",
      label: "Attendance %",
      render: (c) => (c.marked === 0 ? <Badge tone="neutral">Not marked</Badge> : <Badge tone={pctTone(c.percentage)}>{formatPct(c.percentage)}</Badge>),
    },
    {
      key: "actions",
      label: "",
      render: (c) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setSelectedClassId(c.classSectionId)}>
          View register →
        </Button>
      ),
    },
  ];

  const lowClasses = data?.classes.filter((c) => c.percentage !== null && c.percentage < LOW_ATTENDANCE_THRESHOLD).length ?? 0;

  return (
    <div className={styles.section}>
      <div className={reportStyles.filters}>
        <Select
          label="Academic session"
          options={(sessions ?? []).map((s) => ({ label: `${s.name}${s.isCurrent ? " (Current)" : ""}`, value: String(s.id) }))}
          placeholder="Select session"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
        <Input label="Month" type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
      </div>

      {isError ? (
        <EmptyState
          title="Couldn't load the monthly report"
          description="Check your connection and try again."
          action={<Button type="button" variant="outline" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || isFetching || !data ? (
        <Spinner />
      ) : data.classes.length === 0 ? (
        <EmptyState title="No class sections" description="There are no class sections in this academic session." />
      ) : (
        <>
          <div className={reportStyles.statsGrid}>
            <StatCard label={`School attendance · ${monthLabel(year, month)}`} value={formatPct(data.summary.percentage)} icon={<Icon name="clipboardCheck" />} />
            <StatCard label="Classes reporting" value={`${data.summary.classesWithData} / ${data.summary.classCount}`} icon={<Icon name="layers" />} />
            <StatCard label="Active students" value={data.summary.studentCount} icon={<Icon name="graduationCap" />} />
            <StatCard label={`Classes below ${LOW_ATTENDANCE_THRESHOLD}%`} value={lowClasses} icon={<Icon name="bell" />} />
          </div>

          <Card title="Class-wise attendance" subtitle="Click a class to see each student's day-by-day attendance">
            <Table columns={columns} data={data.classes} keyField="classSectionId" defaultPageSize={20} />
          </Card>
        </>
      )}
    </div>
  );
};

export default MonthlyReportSection;
