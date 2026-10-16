import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Select, Input, Table, Badge, Spinner, EmptyState } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetAttendanceDefaultersQuery } from "../../../../store/api/attendance.api";
import type { AttendanceDefaulter } from "../../../../store/api/attendance.api";
import styles from "./AdminAttendancePage.module.css";

const DefaultersSection = () => {
  const { data: classSections } = useGetClassSectionsQuery();
  const [classSectionId, setClassSectionId] = useState<number | "">("");
  const [threshold, setThreshold] = useState(75);

  const {
    data: defaulters,
    isLoading,
    isFetching,
    isError,
  } = useGetAttendanceDefaultersQuery(
    { classSectionId: classSectionId as number, threshold },
    { skip: classSectionId === "" }
  );

  useEffect(() => {
    if (isError) toast.error("Failed to load attendance defaulters.");
  }, [isError]);

  const columns: TableColumn<AttendanceDefaulter>[] = [
    { key: "name", label: "Student", render: (row) => row.student.name },
    { key: "rollNo", label: "Roll No", render: (row) => row.student.rollNo },
    {
      key: "presentTotal",
      label: "Present / Total",
      render: (row) => `${row.present} / ${row.total}`,
    },
    {
      key: "percentage",
      label: "Attendance %",
      render: (row) => (
        <Badge tone={row.percentage < 50 ? "danger" : "warning"}>{row.percentage.toFixed(1)}%</Badge>
      ),
    },
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
        <Input
          label="Threshold %"
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </div>

      {classSectionId === "" ? (
        <EmptyState
          title="Select a class section"
          description="Choose a class section above to view attendance defaulters."
        />
      ) : isLoading || isFetching ? (
        <Spinner />
      ) : !defaulters || defaulters.length === 0 ? (
        <EmptyState
          title="No defaulters"
          description={`No students are below ${threshold}% attendance in this class section.`}
        />
      ) : (
        <Table columns={columns} data={defaulters} keyField="studentId" />
      )}
    </div>
  );
};

export default DefaultersSection;
