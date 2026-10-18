import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from "../../../../components/ui";
import ClassRegisterView from "../../admin/Attendance/ClassRegisterView";
import tabStyles from "../../admin/Attendance/AdminAttendancePage.module.css";
import { useGetTeacherDashboardQuery } from "../../../../store/api/dashboard.api";
import type { SelectOption } from "../../../../components/ui";
import {
  useGetClassAttendanceQuery,
  useMarkAttendanceMutation,
  type MarkAttendanceResult,
} from "../../../../store/api/attendance.api";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import styles from "./TeacherAttendancePage.module.css";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "LEAVE", label: "Leave" },
];

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

const TeacherAttendancePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(todayIso());
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus>>({});
  const [lastResults, setLastResults] = useState<MarkAttendanceResult[] | null>(null);
  const [tab, setTab] = useState<"mark" | "register">(searchParams.get("tab") === "register" ? "register" : "mark");
  const [monthValue, setMonthValue] = useState(todayIso().slice(0, 7));
  // Which of my classes I'm the class teacher of — only those have a register to show.
  const { data: teacherDashboard } = useGetTeacherDashboardQuery();

  const { data: classSections, isLoading: sectionsLoading, isError: sectionsError } = useGetMyClassSectionsQuery();

  const classSectionIdParam = searchParams.get("classSectionId");
  const selectedClassSectionId = classSectionIdParam ? Number(classSectionIdParam) : undefined;

  // Once class sections load, resolve which one is active: keep a valid param,
  // or default to the (only, or first) section otherwise.
  useEffect(() => {
    if (!classSections || classSections.length === 0) return;
    const isValid = selectedClassSectionId && classSections.some((cs) => cs.id === selectedClassSectionId);
    if (!isValid) {
      const next = new URLSearchParams(searchParams);
      next.set("classSectionId", String(classSections[0].id));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSections]);

  const classSectionId = useMemo(() => {
    if (!classSections) return undefined;
    return classSections.some((cs) => cs.id === selectedClassSectionId) ? selectedClassSectionId : undefined;
  }, [classSections, selectedClassSectionId]);

  const {
    data: students,
    isLoading: studentsLoading,
    isFetching: studentsFetching,
    isError: studentsError,
  } = useGetStudentsQuery({ classSectionId }, { skip: !classSectionId });

  const {
    data: attendanceRecords,
    isFetching: attendanceFetching,
    isError: attendanceError,
  } = useGetClassAttendanceQuery(
    { classSectionId: classSectionId ?? 0, date },
    { skip: !classSectionId }
  );

  const [markAttendance, { isLoading: isSaving }] = useMarkAttendanceMutation();

  // Pre-fill statuses: existing marks for the day win, everyone else defaults to Present.
  useEffect(() => {
    if (!students || attendanceFetching) return;
    const existing = new Map((attendanceRecords ?? []).map((record) => [record.studentId, record.status]));
    const next: Record<number, AttendanceStatus> = {};
    for (const student of students) {
      next[student.id] = existing.get(student.id) ?? "PRESENT";
    }
    setStatuses(next);
    setLastResults(null);
  }, [students, attendanceRecords, attendanceFetching]);

  useEffect(() => {
    if (studentsError) toast.error("Failed to load the class roster.");
    if (attendanceError) toast.error("Failed to load existing attendance for this date.");
  }, [studentsError, attendanceError]);

  const sectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const handleSectionChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("classSectionId", value);
    setSearchParams(next);
  };

  const setStatus = (studentId: number, status: AttendanceStatus) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAllPresent = () => {
    if (!students) return;
    const next: Record<number, AttendanceStatus> = {};
    for (const student of students) next[student.id] = "PRESENT";
    setStatuses(next);
  };

  const handleSave = async () => {
    if (!classSectionId || !students || students.length === 0) return;
    const entries = students.map((student) => ({
      studentId: student.id,
      status: statuses[student.id] ?? "PRESENT",
    }));

    try {
      const results = await markAttendance({ classSectionId, date, entries }).unwrap();
      setLastResults(results);
      const failures = results.filter((r) => !r.success);
      if (failures.length === 0) {
        toast.success("Attendance saved for the whole class.");
      } else {
        toast.error(`${failures.length} of ${results.length} student(s) could not be saved.`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save attendance."));
    }
  };

  const studentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (students ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [students]);

  const failures = (lastResults ?? []).filter((r) => !r.success);

  const isBusy = sectionsLoading || (!!classSectionId && (studentsLoading || studentsFetching || attendanceFetching));

  if (sectionsLoading) {
    return (
      <div>
        <PageHeader title="Mark Attendance" />
        <Spinner />
      </div>
    );
  }

  if (sectionsError) {
    return (
      <div>
        <PageHeader title="Mark Attendance" />
        <EmptyState title="Couldn't load your classes" description="Please try refreshing the page." />
      </div>
    );
  }

  if (!classSections || classSections.length === 0) {
    return (
      <div>
        <PageHeader title="Mark Attendance" />
        <EmptyState
          title="No class assigned yet"
          description="You haven't been assigned as a class teacher for any section, so there's nothing to mark attendance for."
        />
      </div>
    );
  }

  const isClassTeacherOfSelected = !!teacherDashboard?.classes?.some(
    (c) => c.classSectionId === classSectionId && c.isClassTeacher
  );
  const [regYear, regMonth] = monthValue.split("-").map(Number);

  return (
    <div>
      <PageHeader title="Attendance" subtitle="RRS International School — Class Attendance Register" />

      <div className={tabStyles.tabs} role="tablist" style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mark"}
          className={[tabStyles.tab, tab === "mark" ? tabStyles.tabActive : ""].join(" ")}
          onClick={() => setTab("mark")}
        >
          Mark attendance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "register"}
          className={[tabStyles.tab, tab === "register" ? tabStyles.tabActive : ""].join(" ")}
          onClick={() => setTab("register")}
        >
          Monthly register
        </button>
      </div>

      {tab === "register" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Card>
            <div className={styles.controls}>
              {classSections.length > 1 ? (
                <Select
                  key={`reg-${classSectionId}`}
                  label="Class Section"
                  name="registerClassSectionId"
                  options={sectionOptions}
                  defaultValue={classSectionId}
                  onChange={(e) => handleSectionChange(e.target.value)}
                />
              ) : (
                <div className={styles.singleSection}>
                  <span className={styles.controlLabel}>Class Section</span>
                  <span className={styles.singleSectionValue}>
                    {classSections[0].className} - {classSections[0].section}
                  </span>
                </div>
              )}
              <Input label="Month" type="month" value={monthValue} max={todayIso().slice(0, 7)} onChange={(e) => setMonthValue(e.target.value)} />
            </div>
          </Card>
          {!teacherDashboard ? (
            <Spinner />
          ) : !classSectionId || !isClassTeacherOfSelected ? (
            <EmptyState
              title="Register available to the class teacher"
              description="The monthly register is shown for classes where you're the class teacher — the same classes you can mark attendance for."
            />
          ) : regYear && regMonth ? (
            <ClassRegisterView classSectionId={classSectionId} year={regYear} month={regMonth} />
          ) : null}
        </div>
      ) : (
      <>
      <Card>
        <div className={styles.controls}>
          {classSections.length > 1 ? (
            <Select
              key={classSectionId}
              label="Class Section"
              name="classSectionId"
              options={sectionOptions}
              defaultValue={classSectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
            />
          ) : (
            <div className={styles.singleSection}>
              <span className={styles.controlLabel}>Class Section</span>
              <span className={styles.singleSectionValue}>
                {classSections[0].className} - {classSections[0].section}
              </span>
            </div>
          )}

          <label className={styles.dateField}>
            <span className={styles.controlLabel}>Date</span>
            <input
              type="date"
              className={styles.dateInput}
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <Button variant="outline" onClick={markAllPresent} disabled={!students || students.length === 0}>
            Mark whole class Present
          </Button>
        </div>
      </Card>

      {failures.length > 0 && (
        <Card title="Some rows could not be saved" className={styles.failureCard}>
          <ul className={styles.failureList}>
            {failures.map((f) => (
              <li key={f.studentId}>
                <strong>{studentNameById.get(f.studentId) ?? `Student #${f.studentId}`}</strong>: {f.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padded={false} className={styles.rosterCard}>
        {isBusy ? (
          <div className={styles.rosterLoading}>
            <Spinner />
          </div>
        ) : !students || students.length === 0 ? (
          <EmptyState title="No students in this class" description="Once students are added to this class, they'll show up here." />
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Roll No</th>
                    <th>Student Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const status = statuses[student.id] ?? "PRESENT";
                    return (
                      <tr key={student.id}>
                        <td className={styles.rollCell}>{student.rollNo}</td>
                        <td>{student.name}</td>
                        <td>
                          <div className={styles.statusGroup}>
                            {STATUS_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={[
                                  styles.statusChip,
                                  styles[`status${opt.value}`],
                                  status === opt.value ? styles.statusChipActive : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => setStatus(student.id, opt.value)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.saveBar}>
              <Button variant="primary" isLoading={isSaving} onClick={handleSave}>
                Save Attendance
              </Button>
            </div>
          </>
        )}
      </Card>
      </>
      )}
    </div>
  );
};

export default TeacherAttendancePage;
