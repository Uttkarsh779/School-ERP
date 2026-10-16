import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Select, Input, Table, Spinner, EmptyState } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetAttendanceMonthlyReportQuery } from "../../../../store/api/attendance.api";
import type { AttendanceMonthlyReportEntry } from "../../../../store/api/attendance.api";
import styles from "./AdminAttendancePage.module.css";

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const MonthlyReportSection = () => {
  const { data: classSections } = useGetClassSectionsQuery();
  const [classSectionId, setClassSectionId] = useState<number | "">("");
  const [monthValue, setMonthValue] = useState(currentMonthValue());

  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const hasValidMonth = Boolean(year && month);

  const {
    data: report,
    isLoading,
    isFetching,
    isError,
  } = useGetAttendanceMonthlyReportQuery(
    { classSectionId: classSectionId as number, year, month },
    { skip: classSectionId === "" || !hasValidMonth }
  );

  useEffect(() => {
    if (isError) toast.error("Failed to load the monthly attendance report.");
  }, [isError]);

  const columns: TableColumn<AttendanceMonthlyReportEntry>[] = [
    { key: "name", label: "Student", render: (row) => row.student.name },
    { key: "rollNo", label: "Roll No", render: (row) => row.student.rollNo },
    { key: "present", label: "Present", render: (row) => row.counts.PRESENT ?? 0 },
    { key: "absent", label: "Absent", render: (row) => row.counts.ABSENT ?? 0 },
    { key: "late", label: "Late", render: (row) => row.counts.LATE ?? 0 },
    { key: "leave", label: "Leave", render: (row) => row.counts.LEAVE ?? 0 },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.filters}>
        <Select
          label="Class section"
          placeholder="Select a class section"
          onChange={(e) => setClassSectionId(e.target.value ? Number(e.target.value) : "")}
          options={(classSections ?? []).map((c) => ({
            label: `${c.className} - ${c.section}`,
            value: c.id,
          }))}
        />
        <Input label="Month" type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
      </div>

      {classSectionId === "" ? (
        <EmptyState
          title="Select a class section"
          description="Choose a class section above to view its monthly attendance report."
        />
      ) : isLoading || isFetching ? (
        <Spinner />
      ) : !report || report.length === 0 ? (
        <EmptyState
          title="No attendance data"
          description="No attendance records found for this class section and month."
        />
      ) : (
        <Table columns={columns} data={report} keyField="studentId" />
      )}
    </div>
  );
};

export default MonthlyReportSection;
