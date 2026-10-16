import { useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetStudentAttendanceSummaryQuery } from "../../../../store/api/attendance.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import styles from "./StudentAttendancePage.module.css";

const statusTone: Record<AttendanceStatus, "success" | "danger" | "warning" | "info"> = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  LEAVE: "info",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const percentageTone = (percentage: number) => {
  if (percentage >= 75) return "good";
  if (percentage >= 50) return "warn";
  return "bad";
};

const StudentAttendancePage = () => {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetMyStudentProfileQuery();

  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    isError: summaryError,
  } = useGetStudentAttendanceSummaryQuery({ studentId: profile?.id ?? 0 }, { skip: !profile });

  useEffect(() => {
    if (profileError) toast.error("Failed to load your profile.");
    if (summaryError) toast.error("Failed to load your attendance.");
  }, [profileError, summaryError]);

  const sortedRecords = useMemo(
    () => [...(summary?.records ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [summary]
  );

  const columns: TableColumn<IAttendanceRecord>[] = [
    { key: "date", label: "Date", render: (row) => formatDate(row.date) },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <Badge tone={statusTone[row.status]}>{row.status.charAt(0) + row.status.slice(1).toLowerCase()}</Badge>
      ),
    },
  ];

  const subtitle = profile?.classSection
    ? `${profile.classSection.className} - ${profile.classSection.section}`
    : "Ram Raj Singh International School";

  if (profileLoading) {
    return (
      <div>
        <PageHeader title="Attendance" />
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle={subtitle} />

      {summaryLoading || summaryFetching ? (
        <Spinner />
      ) : summaryError ? (
        <EmptyState title="Couldn't load attendance" description="Please try refreshing the page." />
      ) : !summary || summary.total === 0 ? (
        <EmptyState
          title="No attendance recorded yet"
          description="Your attendance will appear here once your class teacher marks it."
        />
      ) : (
        <>
          <div className={styles.statsRow}>
            <div className={[styles.percentageCard, styles[percentageTone(summary.percentage)]].join(" ")}>
              <div className={styles.percentageValue}>{summary.percentage.toFixed(1)}%</div>
              <div className={styles.percentageLabel}>Overall attendance</div>
            </div>
            <StatCard label="Days Present" value={summary.present} />
            <StatCard label="Total Days Marked" value={summary.total} />
          </div>

          <Card padded={false} className={styles.tableCard}>
            <Table columns={columns} data={sortedRecords} keyField="id" emptyMessage="No records yet" />
          </Card>
        </>
      )}
    </div>
  );
};

export default StudentAttendancePage;
