import { useState } from "react";
import { toast } from "react-toastify";
import { Card, EmptyState, Select, Spinner, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useAssignStudentTransportMutation, useGetTransportRoutesQuery } from "../../../../store/api/transport.api";
import styles from "./AdminTransportPage.module.css";

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Class-section-scoped student picker (same pattern as the admin Students
// page's roster filter) with a per-row Select to assign/change/remove each
// student's transport route.
const AssignStudentSection = () => {
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);

  const { data: classSections, isLoading: isLoadingSections } = useGetClassSectionsQuery();
  const { data: routes } = useGetTransportRoutesQuery();
  const {
    data: students,
    isLoading: isLoadingStudents,
    isFetching: isFetchingStudents,
    isError: isStudentsError,
  } = useGetStudentsQuery(classSectionId ? { classSectionId: Number(classSectionId) } : undefined, {
    skip: !classSectionId,
  });
  const [assignStudentTransport] = useAssignStudentTransportMutation();

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const routeOptions: SelectOption[] = (routes ?? []).map((route) => ({ label: route.routeName, value: route.id }));

  const handleAssign = async (studentId: number, value: string) => {
    setSavingStudentId(studentId);
    try {
      await assignStudentTransport({ studentId, transportRouteId: value ? Number(value) : null }).unwrap();
      toast.success("Transport assignment updated");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update transport assignment"));
    } finally {
      setSavingStudentId(null);
    }
  };

  const columns: TableColumn<IStudent>[] = [
    { key: "rollNo", label: "Roll No" },
    { key: "name", label: "Name" },
    {
      key: "transport",
      label: "Transport Route",
      render: (student) => (
        <Select
          options={routeOptions}
          placeholder="Not using transport"
          value={student.transportRouteId ?? ""}
          disabled={savingStudentId === student.id}
          onChange={(event) => handleAssign(student.id, event.target.value)}
        />
      ),
    },
  ];

  return (
    <Card title="Assign Students to Routes" subtitle="Pick a class section, then assign each student's transport route.">
      <div className={styles.filterRow}>
        <Select
          label="Class Section"
          options={classSectionOptions}
          placeholder={isLoadingSections ? "Loading class sections…" : "Select a class section"}
          value={classSectionId}
          onChange={(event) => setClassSectionId(event.target.value)}
        />
      </div>

      {!classSectionId ? (
        <EmptyState
          title="Pick a class section"
          description="Select a class section above to assign its students to transport routes."
        />
      ) : isLoadingStudents || isFetchingStudents ? (
        <Spinner />
      ) : isStudentsError ? (
        <EmptyState title="Couldn't load students" description="Please try refreshing the page." />
      ) : (
        <Table
          columns={columns}
          data={students ?? []}
          keyField="id"
          emptyMessage="No students found for this class section."
        />
      )}
    </Card>
  );
};

export default AssignStudentSection;
