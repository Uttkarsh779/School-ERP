import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
} from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useCreateStudentMutation, useGetStudentsQuery, useSetStudentActiveMutation } from "../../../../store/api/students.api";
import type { CreateStudentInput } from "../../../../store/api/students.api";
import StudentFormFields from "./StudentFormFields";
import { emptyStudentFormValues, type StudentFormValues } from "./studentForm";
import BulkImportPanel from "./BulkImportPanel";
import styles from "./StudentsPage.module.css";

const StudentsPage = () => {
  const navigate = useNavigate();
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<IStudent | null>(null);

  const { data: classSections, isLoading: isLoadingSections } = useGetClassSectionsQuery();

  // Load all students by default when no classSectionId selected
  const {
    data: students,
    isLoading: isLoadingStudents,
    isFetching: isFetchingStudents,
    isError: isStudentsError,
  } = useGetStudentsQuery(classSectionId ? { classSectionId: Number(classSectionId) } : undefined);

  const [createStudent, { isLoading: isCreating }] = useCreateStudentMutation();
  const [setStudentActive] = useSetStudentActiveMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StudentFormValues>({ defaultValues: emptyStudentFormValues });

  useEffect(() => {
    if (isStudentsError) {
      toast.error("Failed to load students directory.");
    }
  }, [isStudentsError]);

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const openModal = () => {
    reset({ ...emptyStudentFormValues, classSectionId: classSectionId || "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset(emptyStudentFormValues);
  };

  const onSubmit = async (values: StudentFormValues) => {
    if (!values.classSectionId) {
      toast.error("Please select a class section.");
      return;
    }

    const payload: CreateStudentInput = {
      name: values.name,
      rollNo: values.rollNo,
      admissionNo: values.admissionNo,
      admissionDate: values.admissionDate || undefined,
      classSectionId: Number(values.classSectionId),
      dob: values.dob || undefined,
      gender: values.gender ? (values.gender as Gender) : undefined,
      bloodGroup: values.bloodGroup || undefined,
      fatherName: values.fatherName || undefined,
      fatherContact: values.fatherContact || undefined,
      motherName: values.motherName || undefined,
      motherContact: values.motherContact || undefined,
      aadharNumber: values.aadharNumber || undefined,
      apaarId: values.apaarId || undefined,
      category: values.category ? (values.category as StudentCategory) : undefined,
      address: values.address || undefined,
      contactNumber: values.contactNumber || undefined,
      nationality: values.nationality || undefined,
      previousSchool: values.previousSchool || undefined,
    };

    try {
      await createStudent(payload).unwrap();
      const pwd = values.dob ? values.dob.split("-").reverse().join("") : values.admissionNo;
      toast.success(`Student created. Login: ${values.admissionNo} · Password: ${pwd}${values.dob ? " (date of birth)" : ""}`);
      closeModal();
    } catch {
      toast.error("Failed to create student. Please check the details and try again.");
    }
  };

  const setActive = async (studentId: number, nextActive: boolean) => {
    setTogglingId(studentId);
    try {
      await setStudentActive({ id: studentId, isActive: nextActive }).unwrap();
      toast.success(`Student ${nextActive ? "activated" : "deactivated"} successfully.`);
    } catch {
      toast.error("Failed to update student status.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleActive = (student: IStudent) => {
    if (student.isActive) {
      setPendingDeactivate(student);
    } else {
      setActive(student.id, true);
    }
  };

  // Client-side filtering across name, admissionNo, rollNo, fatherName, and status
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q) ||
        s.rollNo.toString().toLowerCase().includes(q) ||
        (s.fatherName && s.fatherName.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && s.isActive) ||
        (statusFilter === "INACTIVE" && !s.isActive);

      return matchesQuery && matchesStatus;
    });
  }, [students, searchQuery, statusFilter]);

  const activeCount = useMemo(() => students?.filter((s) => s.isActive).length || 0, [students]);

  const columns: TableColumn<IStudent>[] = [
    { key: "rollNo", label: "Roll No", width: "90px" },
    {
      key: "name",
      label: "Student Name",
      render: (s) => (
        <div>
          <Link to={`/admin/students/${s.id}`} className={styles.nameLink}>
            {s.name}
          </Link>
          {s.fatherName && <small className={styles.subText}>Father: {s.fatherName}</small>}
        </div>
      ),
    },
    { key: "admissionNo", label: "Admission No" },
    {
      key: "classSection",
      label: "Class & Section",
      render: (s) => (s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : "Unassigned"),
    },
    {
      key: "contactNumber",
      label: "Contact",
      render: (s) => s.contactNumber || s.fatherContact || "—",
    },
    {
      key: "isActive",
      label: "Status",
      render: (s) => (
        <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (s) => (
        <div className={styles.rowActions}>
          <button type="button" className={styles.viewBtn} onClick={() => navigate(`/admin/students/${s.id}`)} aria-label={`View profile of ${s.name}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            View profile
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${s.isActive ? styles.toggleDeactivate : styles.toggleActivate}`}
            disabled={togglingId === s.id}
            onClick={() => handleToggleActive(s)}
          >
            {togglingId === s.id ? "Saving…" : s.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.section} style={{ marginTop: 0 }}>
      <PageHeader
        title="Student Directory & Roster"
        subtitle="View, search, and manage all student profiles across RRS Intl School"
        actions={
          <Button type="button" icon={<Icon name="plus" />} onClick={openModal}>
            New Student
          </Button>
        }
      />

      {/* Summary Stat Cards */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Students Roster" value={students?.length || 0} />
        <StatCard label="Active Students" value={activeCount} />
        <StatCard label="Class Sections" value={classSections?.length || 0} />
      </div>

      {/* Roster Directory Card */}
      <Card title="School Student Directory">
        <div className={styles.controlsRow}>
          <Input
            label="Search Roster"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, admission no, or roll no..."
          />

          <Select
            label="Filter by Class Section"
            options={[{ label: "All Class Sections", value: "" }, ...classSectionOptions]}
            placeholder={isLoadingSections ? "Loading class sections…" : "All Class Sections"}
            value={classSectionId}
            onChange={(event) => setClassSectionId(event.target.value)}
          />

          <Select
            label="Status Filter"
            options={[
              { label: "All Statuses", value: "ALL" },
              { label: "Active", value: "ACTIVE" },
              { label: "Inactive", value: "INACTIVE" },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          />
        </div>

        {isLoadingStudents || isFetchingStudents ? (
          <Spinner />
        ) : (
          <Table
            columns={columns}
            data={filteredStudents}
            keyField="id"
            emptyMessage="No students found matching your search criteria."
          />
        )}
      </Card>

      <div className={styles.section}>
        <BulkImportPanel />
      </div>

      {isModalOpen && (
        <Modal title="New Student Registration" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <StudentFormFields register={register} errors={errors} classSectionOptions={classSectionOptions} />
            <div className={styles.formActions}>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreating}>
                Create Student
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {pendingDeactivate && (
        <ConfirmDialog
          title="Deactivate student?"
          message={`${pendingDeactivate.name} (Roll No ${pendingDeactivate.rollNo}) will be marked inactive. You can reactivate this record any time.`}
          confirmLabel="Deactivate"
          tone="danger"
          isLoading={togglingId === pendingDeactivate.id}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={async () => {
            await setActive(pendingDeactivate.id, false);
            setPendingDeactivate(null);
          }}
        />
      )}
    </div>
  );
};

export default StudentsPage;
