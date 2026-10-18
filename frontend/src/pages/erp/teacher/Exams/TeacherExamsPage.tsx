import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
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
  Table,
} from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useGetSubjectsQuery } from "../../../../store/api/subjects.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useGetStaffListQuery } from "../../../../store/api/staff.api";
import { useAppSelector } from "../../../../store/store";
import {
  useCreateExamMutation,
  useEnterExamResultsMutation,
  useGetExamResultsQuery,
  useGetExamsQuery,
  type EnterExamResultInput,
} from "../../../../store/api/exams.api";
import styles from "../../admin/Exams/AdminExamsPage.module.css";
import ExamResultsView from "../../admin/Exams/ExamResultsView";
import RemarksEditor from "../../admin/Exams/RemarksEditor";
import { isAbsentText, validateMarksCell } from "../../admin/Exams/marksCell";

interface NewExamFormInputs {
  name: string;
  sessionId: string;
  passPercentage: string;
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

// Same flow as AdminExamsPage, scoped to the teacher's own classes (class-teacher
// classes and classes where they're assigned to teach a subject — see
// GET /class-sections/mine on the backend). A subject teacher who isn't the class
// teacher only has their own subject's columns accepted when saving — see the
// per-row "You aren't assigned to teach this subject" failures if they try others.
const TeacherExamsPage = () => {
  // ?classSectionId= lets the teacher dashboard deep-link straight to a class's exams.
  const [searchParams] = useSearchParams();
  const [classSectionId, setClassSectionId] = useState<string>(searchParams.get("classSectionId") ?? "");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<IExam | null>(null);
  const [marks, setMarks] = useState<Record<string, MarksCell>>({});
  const [lastOutcomes, setLastOutcomes] = useState<IExamResultOutcome[] | null>(null);
  const [resultsExamId, setResultsExamId] = useState<number | null>(null);
  const [remarksExamId, setRemarksExamId] = useState<number | null>(null);

  const csId = classSectionId ? Number(classSectionId) : undefined;

  const { data: classSections, isLoading: isLoadingSections } = useGetMyClassSectionsQuery();
  const { data: sessions } = useGetSessionsQuery();

  const {
    data: exams,
    isLoading: isLoadingExams,
    isFetching: isFetchingExams,
  } = useGetExamsQuery({ classSectionId: csId ?? 0 }, { skip: !csId });

  const { data: subjects } = useGetSubjectsQuery({ classSectionId: csId ?? 0 }, { skip: !csId || !selectedExam });
  const { data: students, isLoading: isLoadingStudents } = useGetStudentsQuery(
    { classSectionId: csId ?? 0 },
    { skip: !csId || !selectedExam }
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
        marksObtained: result.isAbsent ? "AB" : String(result.marksObtained),
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
  const { user } = useAppSelector((state) => state.auth);
  const { data: staffList } = useGetStaffListQuery();

  const currentStaff = useMemo(() => {
    return staffList?.find((s) => s.userId === user?.id);
  }, [staffList, user]);

  const currentStaffId = currentStaff?.id;

  const currentClassSection = classSections?.find((cs) => cs.id === csId);

  const isClassTeacher = useMemo(() => {
    if (!currentClassSection || !currentStaffId) return false;
    return currentClassSection.classTeacherId === currentStaffId;
  }, [currentClassSection, currentStaffId]);

  // Marks are editable only by the subject's allocated teacher (Subjects panel) — the class
  // teacher included; they see the other subjects read-only. Mirrors the backend rule.
  const isLocked = !!selectedExam?.isLocked;
  const canEditSubject = (subject: ISubject) => {
    if (isLocked || !currentStaffId) return false;
    return Boolean(subject.teacherSubjects?.some((ts) => ts.staffId === currentStaffId));
  };

  const openModal = () => {
    reset({ name: "", sessionId: "", passPercentage: "33" });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    reset({ name: "", sessionId: "", passPercentage: "33" });
  };

  const onCreateExam = async (values: NewExamFormInputs) => {
    if (!csId) return;
    try {
      await createExam({
        name: values.name,
        sessionId: Number(values.sessionId),
        classSectionId: csId,
        passPercentage: Number(values.passPercentage),
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
    const key = cellKey(studentId, subjectId);
    setMarks((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { marksObtained: "", maxMarks: "" }), [field]: value },
    }));
  };

  const handleSaveMarks = async () => {
    if (!selectedExam || !students || !subjects) return;

    const results: EnterExamResultInput[] = [];
    for (const student of students) {
      for (const subject of subjects) {
        if (!canEditSubject(subject)) continue; // read-only columns are never sent
        const cell = marks[cellKey(student.id, subject.id)];
        if (!cell || cell.marksObtained.trim() === "" || cell.maxMarks === "") continue;
        const error = validateMarksCell(cell.marksObtained, cell.maxMarks);
        if (error) {
          toast.error(`${student.name} — ${subject.name}: ${error}`);
          return;
        }
        const absent = isAbsentText(cell.marksObtained);
        results.push({
          studentId: student.id,
          subjectId: subject.id,
          marksObtained: absent ? 0 : Number(cell.marksObtained),
          maxMarks: Number(cell.maxMarks),
          isAbsent: absent,
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
        toast.success("Marks saved.");
      } else {
        toast.error(`${failures.length} of ${outcomes.length} result(s) could not be saved.`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save marks."));
    }
  };

  const examColumns: TableColumn<IExam>[] = [
    {
      key: "name",
      label: "Exam Name",
      render: (exam) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          {exam.name}
          {exam.resultsPublished ? <Badge tone="success">Published</Badge> : exam.isLocked && <Badge tone="warning">Locked</Badge>}
        </span>
      ),
    },
    { key: "session", label: "Session", render: (exam) => exam.session?.name ?? "—" },
    { key: "passPercentage", label: "Pass Mark", render: (exam) => `${exam.passPercentage ?? 33}%` },
    {
      key: "actions",
      label: "Actions",
      render: (exam) => (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <Button type="button" size="sm" onClick={() => openMarksEntry(exam)}>
            Enter Marks
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setResultsExamId(exam.id)}>
            Results &amp; Ranks
          </Button>
          {isClassTeacher && (
            <Button type="button" size="sm" variant="outline" onClick={() => setRemarksExamId(exam.id)}>
              Report remarks
            </Button>
          )}
        </div>
      ),
    },
  ];

  const studentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (students ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [students]);

  const failures = (lastOutcomes ?? []).filter((o) => !o.success);

  if (resultsExamId !== null) {
    return <ExamResultsView examId={resultsExamId} onBack={() => setResultsExamId(null)} />;
  }

  return (
    <div>
      <PageHeader
        title="Exams"
        subtitle="Set up tests and enter marks for the classes you teach"
        actions={
          !selectedExam ? (
            <Button type="button" icon={<Icon name="plus" />} onClick={openModal} disabled={!csId}>
              New Exam
            </Button>
          ) : undefined
        }
      />

      {!selectedExam && (
        <Card title="My Classes" subtitle="Select a class to view and manage its exams.">
          <div className={styles.filterRow}>
            <Select
              label="Class Section"
              options={classSectionOptions}
              placeholder={isLoadingSections ? "Loading…" : "Select a class section"}
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            />
          </div>

          {!csId ? (
            <EmptyState
              title="Pick a class section"
              description="Select a class section above to view and manage its exams."
            />
          ) : isLoadingExams || isFetchingExams ? (
            <Spinner />
          ) : (
            <Table
              columns={examColumns}
              data={exams ?? []}
              keyField="id"
              emptyMessage="No exams created for this class section yet."
            />
          )}
        </Card>
      )}

      {selectedExam && (
        <Card
          title={`${selectedExam.name} — Marks Entry`}
          subtitle={currentClassSection ? `${currentClassSection.className} - ${currentClassSection.section}` : undefined}
          action={
            <Button type="button" variant="outline" size="sm" onClick={closeMarksEntry}>
              Back to exams
            </Button>
          }
        >
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
              description="Once students are added to this class, they'll show up here."
            />
          ) : subjects.length === 0 ? (
            <EmptyState
              title="No subjects for this class"
              description="Ask an admin to add subjects to this class section (via Timetable) before entering marks."
            />
          ) : (
            <>
              {/* Access Mode Notification Banner */}
              {isLocked ? (
                <div style={{ background: "var(--erp-warning-bg)", border: "1px solid var(--erp-warning)", borderRadius: "var(--erp-radius-sm)", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--erp-warning)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>🔒</span>
                  <span>Marks for this exam are locked{selectedExam?.lockedByUser ? ` by ${selectedExam.lockedByUser.name}` : ""}. Ask an administrator to unlock it if a correction is needed.</span>
                </div>
              ) : isClassTeacher ? (
                <div style={{ background: "var(--erp-primary-50, #f0f7ff)", border: "1px solid var(--erp-primary-600)", borderRadius: "var(--erp-radius-sm)", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--erp-primary-700)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>👑</span>
                  <span>Class Teacher Access: You can view marks for ALL subjects of this class. You can enter &amp; update only the subject(s) allocated to you — the others are read-only.</span>
                </div>
              ) : (
                <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--erp-text-muted)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>📘</span>
                  <span>Subject Teacher Access: You can enter &amp; update marks ONLY for your assigned subject(s). Other subjects are read-only.</span>
                </div>
              )}

              <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "var(--erp-text-muted)" }}>
                Type <strong>AB</strong> in the Marks box for a student who was absent (still fill in Max). Leave a cell
                empty if marks aren&apos;t available yet.
              </p>
              <div className={styles.gridWrapper}>
                <table className={styles.grid}>
                  <thead>
                    <tr>
                      <th className={styles.stickyCol}>Roll No</th>
                      <th className={styles.stickyCol2}>Student</th>
                      {subjects.map((subject) => {
                        const editable = canEditSubject(subject);
                        return (
                          <th key={subject.id} colSpan={2} className={styles.subjectHeader} style={{ background: editable ? undefined : "var(--erp-surface-muted, #f8fafc)", opacity: editable ? 1 : 0.75 }}>
                            {subject.name} {!editable && <span title={isLocked ? "Exam marks are locked" : "Read-only: allocated to another teacher"}>🔒</span>}
                          </th>
                        );
                      })}
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
                          const editable = canEditSubject(subject);
                          return (
                            <Fragment key={subject.id}>
                              <td>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className={styles.cellInput}
                                  placeholder="–"
                                  aria-label={`${student.name} ${subject.name} marks (number or AB)`}
                                  value={cell.marksObtained}
                                  disabled={!editable}
                                  title={editable ? "" : isLocked ? "Exam marks are locked" : "Only the subject's allocated teacher can edit"}
                                  style={editable ? {} : { opacity: 0.5, cursor: "not-allowed", background: "var(--erp-surface-muted, #f1f5f9)" }}
                                  onChange={(e) => setCell(student.id, subject.id, "marksObtained", e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className={styles.cellInput}
                                  min={0}
                                  value={cell.maxMarks}
                                  disabled={!editable}
                                  title={editable ? "" : isLocked ? "Exam marks are locked" : "Only the subject's allocated teacher can edit"}
                                  style={editable ? {} : { opacity: 0.5, cursor: "not-allowed", background: "var(--erp-surface-muted, #f1f5f9)" }}
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
              <div className={styles.saveBar}>
                <Button
                  variant="primary"
                  isLoading={isSavingMarks}
                  onClick={handleSaveMarks}
                  disabled={isLocked || !subjects.some(canEditSubject)}
                >
                  Save Marks
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {remarksExamId !== null && <RemarksEditor examId={remarksExamId} onClose={() => setRemarksExamId(null)} />}

      {isModalOpen && (
        <Modal title="New Exam" onClose={closeModal}>
          <form onSubmit={handleSubmit(onCreateExam)}>
            <FormSection title="Exam Details">
              <FormGrid>
                <Input
                  label="Exam Name"
                  placeholder="e.g. Unit Test 1"
                  required
                  error={errors.name?.message}
                  {...register("name", { required: "Exam name is required" })}
                />
                <Select
                  label="Session"
                  options={sessionOptions}
                  placeholder="Select a session"
                  error={errors.sessionId?.message}
                  {...register("sessionId", { required: "Session is required" })}
                />
                <Input
                  label="Pass Mark (% per subject)"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  required
                  error={errors.passPercentage?.message}
                  {...register("passPercentage", {
                    required: "Pass mark is required",
                    validate: (v) => (Number(v) >= 0 && Number(v) <= 100) || "Enter a value between 0 and 100",
                  })}
                />
                <div className={styles.prefilledField} style={{ gridColumn: "1 / -1" }}>
                  <span className={styles.prefilledLabel}>Class Section</span>
                  <span className={styles.prefilledValue}>
                    {currentClassSection ? `${currentClassSection.className} - ${currentClassSection.section}` : "—"}
                  </span>
                </div>
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

export default TeacherExamsPage;
