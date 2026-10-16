import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormGrid,
  FormSection,
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
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import {
  useCreateExamMutation,
  useEnterExamResultsMutation,
  useGetExamResultsQuery,
  useGetExamsQuery,
  type EnterExamResultInput,
} from "../../../../store/api/exams.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./AdminExamsPage.module.css";

interface NewExamFormInputs {
  name: string;
  sessionId: string;
  classSectionId: string;
}

interface MarksCell {
  marksObtained: string;
  maxMarks: string;
}

const cellKey = (studentId: number, subjectId: number) => `${studentId}:${subjectId}`;

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const AdminExamsPage = () => {
  const currentUser = useAppSelector((state) => state.auth.user);
  const isTeacher = currentUser?.role === "TEACHER";

  const [classSectionId, setClassSectionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<IExam | null>(null);
  const [marks, setMarks] = useState<Record<string, MarksCell>>({});
  const [lastOutcomes, setLastOutcomes] = useState<IExamResultOutcome[] | null>(null);

  const csId = classSectionId ? Number(classSectionId) : undefined;
  const examCsId = selectedExam?.classSectionId;

  const { data: classSections, isLoading: isLoadingSections } = useGetClassSectionsQuery();
  const { data: sessions } = useGetSessionsQuery();

  const {
    data: exams,
    isLoading: isLoadingExams,
    isFetching: isFetchingExams,
  } = useGetExamsQuery(classSectionId ? { classSectionId: Number(classSectionId) } : undefined);

  const { data: subjects } = useGetSubjectsQuery({ classSectionId: examCsId ?? 0 }, { skip: !selectedExam });
  const { data: students, isLoading: isLoadingStudents } = useGetStudentsQuery(
    { classSectionId: examCsId ?? 0 },
    { skip: !selectedExam }
  );
  const { data: existingResults, isLoading: isLoadingResults } = useGetExamResultsQuery(selectedExam?.id ?? 0, {
    skip: !selectedExam,
  });

  const [createExam, { isLoading: isCreating }] = useCreateExamMutation();
  const [enterResults, { isLoading: isSavingMarks }] = useEnterExamResultsMutation();

  useEffect(() => {
    if (!existingResults) return;
    const seeded: Record<string, MarksCell> = {};
    for (const result of existingResults) {
      seeded[cellKey(result.studentId, result.subjectId)] = {
        marksObtained: String(result.marksObtained),
        maxMarks: String(result.maxMarks),
      };
    }
    setMarks(seeded);
  }, [existingResults]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewExamFormInputs>();

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));
  const sessionOptions: SelectOption[] = (sessions ?? []).map((s) => ({ label: s.name, value: s.id }));
  const currentClassSection = classSections?.find((cs) => cs.id === examCsId);

  const openModal = () => {
    reset({ name: "", sessionId: String(sessions?.[0]?.id || ""), classSectionId: classSectionId || "" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset({ name: "", sessionId: "", classSectionId: "" });
  };

  const onCreateExam = async (values: NewExamFormInputs) => {
    if (!values.classSectionId) {
      toast.error("Please select a target class section.");
      return;
    }
    try {
      await createExam({
        name: values.name,
        sessionId: Number(values.sessionId),
        classSectionId: Number(values.classSectionId),
      }).unwrap();
      toast.success("Exam created successfully.");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create exam."));
    }
  };

  const openMarksEntry = (exam: IExam) => {
    setSelectedExam(exam);
    setMarks({});
    setLastOutcomes(null);
  };

  const closeMarksEntry = () => {
    setSelectedExam(null);
    setMarks({});
    setLastOutcomes(null);
  };

  const setCell = (studentId: number, subjectId: number, field: keyof MarksCell, value: string) => {
    if (!isTeacher) return;
    const key = cellKey(studentId, subjectId);
    setMarks((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { marksObtained: "", maxMarks: "" }), [field]: value },
    }));
  };

  const handleSaveMarks = async () => {
    if (!isTeacher) {
      toast.error("Only teachers assigned to teach subjects in this class can enter or modify marks.");
      return;
    }
    if (!selectedExam || !students || !subjects) return;

    const results: EnterExamResultInput[] = [];
    for (const student of students) {
      for (const subject of subjects) {
        const cell = marks[cellKey(student.id, subject.id)];
        if (!cell || cell.marksObtained === "" || cell.maxMarks === "") continue;
        results.push({
          studentId: student.id,
          subjectId: subject.id,
          marksObtained: Number(cell.marksObtained),
          maxMarks: Number(cell.maxMarks),
        });
      }
    }

    if (results.length === 0) {
      toast.error("Enter at least one student's marks before saving.");
      return;
    }

    try {
      const outcomes = await enterResults({ examId: selectedExam.id, results }).unwrap();
      setLastOutcomes(outcomes);
      const failures = outcomes.filter((o) => !o.success);
      if (failures.length === 0) {
        toast.success("Marks saved successfully.");
      } else {
        toast.error(`${failures.length} of ${outcomes.length} result(s) could not be saved.`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save marks."));
    }
  };

  const filteredExams = useMemo(() => {
    if (!exams) return [];
    return exams.filter((e) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || e.name.toLowerCase().includes(q) || (e.session && e.session.name.toLowerCase().includes(q));
      return matchesQuery;
    });
  }, [exams, searchQuery]);

  const examColumns: TableColumn<IExam>[] = [
    { key: "name", label: "Exam Name" },
    {
      key: "classSection",
      label: "Class & Section",
      render: (exam) =>
        exam.classSection ? `${exam.classSection.className} - ${exam.classSection.section}` : "Global Class",
    },
    { key: "session", label: "Academic Session", render: (exam) => exam.session?.name ?? "2026-27" },
    {
      key: "actions",
      label: "Actions",
      render: (exam) => (
        <Button
          type="button"
          size="sm"
          variant={isTeacher ? "primary" : "outline"}
          onClick={() => openMarksEntry(exam)}
        >
          {isTeacher ? "Enter Marks →" : "View Marks 👁️"}
        </Button>
      ),
    },
  ];

  const studentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (students ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [students]);

  const failures = (lastOutcomes ?? []).filter((o) => !o.success);

  return (
    <div>
      <PageHeader
        title="Exams & Grading Management"
        subtitle="Create exams, configure schedules, and record student marks across classes"
        actions={
          !selectedExam ? (
            <Button type="button" icon={<Icon name="plus" />} onClick={openModal}>
              + New Exam
            </Button>
          ) : undefined
        }
      />

      {!selectedExam && (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <StatCard label="Total Exams Scheduled" value={exams?.length || 0} />
            <StatCard label="Class Sections" value={classSections?.length || 0} />
            <StatCard label="Active Session" value={sessions?.find((s) => s.isCurrent)?.name || "2026-27"} />
          </div>

          <Card title="School Exams Directory">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", alignItems: "flex-end", marginBottom: "1.25rem" }}>
              <Input
                label="Search Exams"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by exam name or session..."
              />

              <Select
                label="Filter by Class Section"
                options={[{ label: "All Class Sections", value: "" }, ...classSectionOptions]}
                placeholder={isLoadingSections ? "Loading…" : "All Class Sections"}
                value={classSectionId}
                onChange={(e) => setClassSectionId(e.target.value)}
              />
            </div>

            {isLoadingExams || isFetchingExams ? (
              <Spinner />
            ) : (
              <Table
                columns={examColumns}
                data={filteredExams}
                keyField="id"
                emptyMessage="No exams found matching your criteria."
              />
            )}
          </Card>
        </>
      )}

      {selectedExam && (
        <Card
          title={`${selectedExam.name} — ${isTeacher ? "Marks Entry Grid" : "Marks Review (Read-Only)"}`}
          subtitle={currentClassSection ? `${currentClassSection.className} - ${currentClassSection.section}` : undefined}
          action={
            <Button type="button" variant="outline" size="sm" onClick={closeMarksEntry}>
              ← Back to All Exams
            </Button>
          }
        >
          {!isTeacher && (
            <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem 1rem", borderRadius: "var(--erp-radius-sm)", marginBottom: "1.25rem", color: "var(--erp-text-muted)", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>👁️</span>
              <span>
                <strong>Read-Only View:</strong> Administrators can review marks and report cards. Only assigned subject teachers can enter or modify marks.
              </span>
            </div>
          )}

          {failures.length > 0 && (
            <div className={styles.failureBox}>
              <p className={styles.failureTitle}>Some results could not be saved</p>
              <ul className={styles.failureList}>
                {failures.map((f) => (
                  <li key={cellKey(f.studentId, f.subjectId)}>
                    <strong>{studentNameById.get(f.studentId) ?? `Student #${f.studentId}`}</strong>: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoadingStudents || isLoadingResults || !subjects ? (
            <Spinner />
          ) : !students || students.length === 0 ? (
            <EmptyState
              title="No students in this class"
              description="Once students are added to this class section, they'll show up here for marks entry."
            />
          ) : subjects.length === 0 ? (
            <EmptyState
              title="No subjects for this class"
              description="Add subjects to this class section before entering marks."
            />
          ) : (
            <>
              <div className={styles.gridWrapper}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Roll No</th>
                      <th className={styles.stickyCol2}>Student</th>
                      {subjects.map((subject) => (
                        <th key={subject.id} colSpan={2} className={styles.subjectHeader}>
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className={styles.stickyCol} />
                      <th className={styles.stickyCol2} />
                      {subjects.map((subject) => (
                        <Fragment key={subject.id}>
                          <th className={styles.subHeader}>Marks</th>
                          <th className={styles.subHeader}>Max</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td className={styles.stickyCol}>{student.rollNo}</td>
                        <td className={styles.stickyCol2}>{student.name}</td>
                        {subjects.map((subject) => {
                          const cell = marks[cellKey(student.id, subject.id)] ?? { marksObtained: "", maxMarks: "" };
                          return (
                            <Fragment key={subject.id}>
                              <td>
                                <input
                                  type="number"
                                  className={styles.cellInput}
                                  min={0}
                                  disabled={!isTeacher}
                                  value={cell.marksObtained}
                                  onChange={(e) => setCell(student.id, subject.id, "marksObtained", e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={styles.cellInput}
                                  min={0}
                                  disabled={!isTeacher}
                                  value={cell.maxMarks}
                                  onChange={(e) => setCell(student.id, subject.id, "maxMarks", e.target.value)}
                                />
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isTeacher && (
                <div className={styles.saveBar}>
                  <Button variant="primary" isLoading={isSavingMarks} onClick={handleSaveMarks}>
                    Save Marks
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {isModalOpen && (
        <Modal title="Create New Exam" onClose={closeModal}>
          <form onSubmit={handleSubmit(onCreateExam)}>
            <FormSection title="Exam Configurations">
              <FormGrid>
                <Input
                  label="Exam Name *"
                  placeholder="e.g. Mid-Term Examination 2026"
                  required
                  error={errors.name?.message}
                  {...register("name", { required: "Exam name is required" })}
                />
                <Select
                  label="Target Class Section *"
                  options={classSectionOptions}
                  placeholder="Select Class Section..."
                  error={errors.classSectionId?.message}
                  {...register("classSectionId", { required: "Class section is required" })}
                />
                <Select
                  label="Academic Session *"
                  options={sessionOptions}
                  placeholder="Select Session..."
                  error={errors.sessionId?.message}
                  {...register("sessionId", { required: "Session is required" })}
                />
              </FormGrid>
            </FormSection>
            <div className={styles.formActions}>
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreating}>
                Create Exam
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminExamsPage;
