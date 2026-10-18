import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// Extra operational sections of GET /dashboard/admin (see backend adminOverviewService).
export interface AdminDashboard extends IAdminDashboardCounts {
  today: string;
  currentSession: { id: number; name: string } | null;
  fees: {
    collectedToday: number;
    paymentsToday: number;
    collectedThisMonth: number;
    billedThisMonth: number;
    collectionRate: number | null;
    outstanding: number;
    overdue: number;
    defaulterCount: number;
    recentPayments: Array<{
      id: number;
      receiptNumber: string;
      amount: number;
      mode: string;
      paidAt: string;
      student: { id: number; name: string; admissionNo: string; classSection: string | null };
    }>;
  };
  attendanceToday: {
    classesTotal: number;
    classesMarked: number;
    counts: { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number };
    marked: number;
    presentPercentage: number | null;
    notMarked: Array<{ classSectionId: number; classSection: string; classTeacher: string | null; students: number }>;
  };
  attendanceMonth: {
    percentage: number | null;
    lowClasses: Array<{ classSectionId: number; classSection: string; percentage: number | null }>;
    lowThreshold: number;
  };
  exams: Array<{ examId: number; name: string; classSection: string; isLocked: boolean; entered: number; expected: number }>;
  admissions: {
    newThisMonth: number;
    recent: Array<{ id: number; name: string; admissionNo: string; date: string; classSection: string | null }>;
  };
  birthdays: Array<{ id: number; name: string; classSection: string | null }>;
  attention: {
    noCurrentSession: boolean;
    classesWithoutFeeStructure: string[];
    classesWithoutTeacher: string[];
    subjectsWithoutTeacher: string[];
    lateFeeRuleMissing: boolean;
    pendingRefunds: number;
  };
}

export interface TeacherDashboard {
  hasStaffProfile: boolean;
  today?: string;
  lowAttendanceThreshold?: number;
  summary?: {
    classCount: number;
    classTeacherCount: number;
    studentCount: number;
    attendanceMarkedToday: number;
    periodsToday: number;
    openHomework: number;
  };
  classes?: Array<{
    classSectionId: number;
    className: string;
    section: string;
    isClassTeacher: boolean;
    studentCount: number;
    attendanceMarkedToday: boolean | null;
    markedTodayCount: number | null;
    monthAttendancePercentage: number | null;
  }>;
  todaySchedule?: Array<{ id: number; periodNumber: number; subjectName: string | null; className: string | null; room: string | null }>;
  exams?: Array<{
    examId: number;
    name: string;
    sessionName: string | null;
    classSectionId: number;
    className: string | null;
    expected: number;
    entered: number;
  }>;
  homework?: Array<{ id: number; title: string; subjectName: string | null; className: string | null; dueDate: string }>;
  lowAttendance?: Array<{
    studentId: number;
    name: string;
    rollNo: string;
    className: string | null;
    classSectionId: number;
    percentage: number | null;
    present: number;
    marked: number;
  }>;
}

interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  LEAVE: number;
  marked: number;
  percentage: number | null;
}

export interface StudentDashboard {
  hasStudentProfile: boolean;
  today?: string;
  profileExtras?: {
    sessionName: string | null;
    classTeacherName: string | null;
    guardians: Array<{ name: string; relationship: string | null; contact: string | null; email: string | null; isPrimary: boolean }>;
    transport: { villageName: string | null; startDate: string; policy: string } | null;
  };
  todaySchedule?: Array<{ id: number; periodNumber: number; subjectName: string | null; teacherName: string | null; room: string | null }>;
  attendance?: {
    month: AttendanceCounts;
    overall: AttendanceCounts;
    recent: Array<{ date: string; status: AttendanceStatus }>;
  };
  fees?: {
    totalOutstanding: number;
    totalAdvanceAvailable: number;
    overdueCount: number;
    nextDue: { label: string; dueDate: string; amount: number } | null;
  } | null;
  homework?: Array<{ id: number; title: string; subjectName: string | null; dueDate: string }>;
  latestResult?: {
    examId: number;
    examName: string;
    isFinal: boolean;
    total: number;
    maxTotal: number;
    percentage: number | null;
    status: "PASS" | "FAIL" | "ABSENT" | "PENDING" | "NOT_ENTERED";
    rank: number | null;
    rankedCount: number | null;
    failedSubjects: string[];
  } | null;
}

export const dashboardApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminDashboard: builder.query<AdminDashboard, void>({
      query: () => "dashboard/admin",
      transformResponse: (res: ApiEnvelope<AdminDashboard>) => res.data,
      // Refreshes whenever the things it summarises change.
      providesTags: ["Dashboard", "Attendance", "Fee", "Exam", "Student", "Notice", "Subject", "ClassSection"],
    }),
    // Re-fetches whenever attendance, marks, timetable or homework change.
    getTeacherDashboard: builder.query<TeacherDashboard, void>({
      query: () => "dashboard/teacher",
      transformResponse: (res: ApiEnvelope<TeacherDashboard>) => res.data,
      providesTags: ["Dashboard", "Attendance", "Exam", "Timetable"],
    }),
    getStudentDashboard: builder.query<StudentDashboard, void>({
      query: () => "dashboard/student",
      transformResponse: (res: ApiEnvelope<StudentDashboard>) => res.data,
      providesTags: ["Dashboard", "Attendance", "Exam", "Timetable", "Fee", "Student"],
    }),
  }),
});

export const { useGetAdminDashboardQuery, useGetTeacherDashboardQuery, useGetStudentDashboardQuery } = dashboardApi;
