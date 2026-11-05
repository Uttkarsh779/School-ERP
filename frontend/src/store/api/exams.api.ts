import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface EnterExamResultInput {
  studentId: number;
  subjectId: number;
  marksObtained: number;
  maxMarks: number;
  isAbsent?: boolean;
  clear?: boolean; // take back a saved mark (its box was emptied)
}

export type ExamResultStatus = "PASS" | "FAIL" | "ABSENT" | "PENDING" | "NOT_ENTERED";

export interface ExamAnalysisStudent {
  studentId: number;
  name: string;
  rollNo: string;
  admissionNo: string;
  isActive: boolean;
  marks: Array<
    | { subjectId: number; entered: false }
    | { subjectId: number; entered: true; isAbsent: boolean; marksObtained: number; maxMarks: number; percentage: number; passed: boolean }
  >;
  total: number;
  maxTotal: number;
  percentage: number | null;
  absentSubjects: number;
  failedSubjects: string[];
  status: ExamResultStatus;
  rank: number | null;
}

export interface ExamSubjectStats {
  subjectId: number;
  subjectName: string;
  entered: number;
  appeared: number;
  absent: number;
  passed: number;
  failed: number;
  passRate: number | null;
  highestPercentage: number | null;
  lowestPercentage: number | null;
  averagePercentage: number | null;
  toppers: Array<{ studentId: number; name: string; marksObtained: number; maxMarks: number }>;
}

export interface ExamAuditEntry {
  id: number;
  examId: number;
  studentId: number;
  subjectId: number;
  studentName: string;
  rollNo: string | null;
  subjectName: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  oldMarks: number | null;
  oldMaxMarks: number | null;
  oldIsAbsent: boolean | null;
  newMarks: number;
  newMaxMarks: number;
  newIsAbsent: boolean;
  changedByUser: { id: number; name: string };
  changedAt: string;
}

export interface ExamAnalysis {
  // FULL = admin / class teacher; SUBJECT = a subject teacher's view (own subjects, no ranks)
  scope: "FULL" | "SUBJECT";
  exam: {
    id: number;
    name: string;
    sessionName: string | null;
    classSection: { id: number; className: string; section: string };
    isLocked: boolean;
    lockedAt: string | null;
  };
  passPercentage: number;
  subjects: Array<{ id: number; name: string }>;
  summary: {
    totalStudents: number;
    appeared: number;
    passed: number;
    failed: number;
    absent: number;
    pending: number;
    notEntered: number;
    passRate: number | null;
    averagePercentage: number | null;
    highestPercentage: number | null;
    lowestPercentage: number | null;
  };
  toppers: ExamAnalysisStudent[];
  subjectStats: ExamSubjectStats[];
  students: ExamAnalysisStudent[];
}

export type CoGrade = "" | "A" | "B" | "C";

// Marks-entry progress per subject (all subjects for admins/class teacher, own for others).
export interface ExamProgress {
  examId: number;
  totalStudents: number;
  isClassTeacher: boolean;
  subjects: Array<{ subjectId: number; name: string; teachers: string[]; isMine: boolean; entered: number }>;
}

export interface PrintableReportCard {
  student: {
    id: number;
    name: string;
    admissionNo: string;
    rollNo: string;
    dob: string | null;
    gender: string | null;
    fatherName: string | null;
    motherName: string | null;
    photoUrl: string | null;
  };
  subjects: Array<{
    subjectName: string;
    entered: boolean;
    isAbsent: boolean;
    marksObtained: number | null;
    maxMarks: number | null;
    percentage: number | null;
    passed: boolean | null;
  }>;
  total: number;
  maxTotal: number;
  percentage: number | null;
  status: ExamResultStatus;
  failedSubjects: string[];
  rank: number | null;
  remark: string | null;
  coScholastic: { workEducation: string | null; artEducation: string | null; healthPhysical: string | null; discipline: string | null };
  attendance: { present: number; workingDays: number } | null;
}

// Report cards ready to print — one student, or the whole class (admins/class teacher).
export interface PrintableReportCards {
  exam: { id: number; name: string; passPercentage: number; isFinal: boolean; resultsPublished: boolean };
  sessionName: string | null;
  classSection: { className: string; section: string };
  classTeacher: string | null;
  rankedCount: number | null;
  classAverage: number | null;
  cards: PrintableReportCard[];
}

// Admit cards: the exam's date sheet and the class list (exams/admitCardService.ts).
export interface DateSheetEntry {
  subjectId: number;
  date: string;
  start: string;
  end: string;
}
export interface DateSheet {
  entries: DateSheetEntry[];
  instructions: string | null;
  warnings?: string[]; // papers set on a day off
}
export interface AdmitCardSet {
  exam: { id: number; name: string; session: string | null };
  admitCard: boolean;
  classSection: { className: string; section: string };
  classTeacher: string | null;
  subjects: { id: number; name: string }[];
  dateSheet: { entries: (DateSheetEntry & { subjectName: string })[]; instructions: string | null };
  students: { id: number; name: string; admissionNo: string; rollNo: string; dob: string | null; fatherName: string | null; photoUrl: string | null }[];
  // Students with overdue fees left out (unless the Super Admin allows cards for everyone).
  heldBack: { id: number; name: string; rollNo: string; admissionNo: string; due: number }[];
  allowDefaulters: boolean;
}

export const examsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getExams: builder.query<IExam[], { classSectionId?: number; sessionId?: number } | void>({
      query: (params) => ({ url: "exams", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IExam[]>) => res.data,
      providesTags: ["Exam"],
    }),
    enterExamResults: builder.mutation<IExamResultOutcome[], { examId: number; results: EnterExamResultInput[] }>({
      query: ({ examId, results }) => ({ url: `exams/${examId}/results`, method: "POST", body: { results } }),
      transformResponse: (res: ApiEnvelope<IExamResultOutcome[]>) => res.data,
      invalidatesTags: ["Exam", "ExamResult", "Dashboard"],
    }),
    getExamResults: builder.query<IExamResult[], number>({
      query: (examId) => `exams/${examId}/results`,
      transformResponse: (res: ApiEnvelope<IExamResult[]>) => res.data,
      providesTags: ["Exam"],
    }),
    getExamProgress: builder.query<ExamProgress, number>({
      query: (examId) => `exams/${examId}/progress`,
      transformResponse: (res: ApiEnvelope<ExamProgress>) => res.data,
      providesTags: ["Exam"],
    }),
    getExamAnalysis: builder.query<ExamAnalysis, number>({
      query: (examId) => `exams/${examId}/analysis`,
      transformResponse: (res: ApiEnvelope<ExamAnalysis>) => res.data,
      providesTags: ["Exam"],
    }),
    getExamAudit: builder.query<ExamAuditEntry[], number>({
      query: (examId) => `exams/${examId}/audit`,
      transformResponse: (res: ApiEnvelope<ExamAuditEntry[]>) => res.data,
      providesTags: ["Exam"],
    }),
    setExamLock: builder.mutation<IExam, { examId: number; locked: boolean }>({
      query: ({ examId, locked }) => ({ url: `exams/${examId}/lock`, method: "PATCH", body: { locked } }),
      transformResponse: (res: ApiEnvelope<IExam>) => res.data,
      invalidatesTags: ["Exam", "ExamResult"],
    }),
    setResultsPublished: builder.mutation<IExam, { examId: number; published: boolean }>({
      query: ({ examId, published }) => ({ url: `exams/${examId}/publish`, method: "PATCH", body: { published } }),
      transformResponse: (res: ApiEnvelope<IExam>) => res.data,
      invalidatesTags: ["Exam", "ExamResult", "Remarks", "Dashboard"],
    }),
    getReportCard: builder.query<IReportCard, { examId: number; studentId: number }>({
      query: ({ examId, studentId }) => `exams/${examId}/report-card/${studentId}`,
      transformResponse: (res: ApiEnvelope<IReportCard>) => res.data,
      providesTags: ["Exam"],
    }),
    getAdmitCards: builder.query<AdmitCardSet, number>({
      query: (examId) => `exams/${examId}/admit-cards`,
      transformResponse: (res: ApiEnvelope<AdmitCardSet>) => res.data,
      providesTags: ["Exam"],
    }),
    saveDateSheet: builder.mutation<DateSheet, { examId: number; entries: DateSheetEntry[]; instructions: string | null }>({
      query: ({ examId, ...body }) => ({ url: `exams/${examId}/date-sheet`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<DateSheet>) => res.data,
      invalidatesTags: ["Exam"],
    }),
    getPrintableReportCards: builder.query<PrintableReportCards, { examId: number; studentId?: number }>({
      query: ({ examId, studentId }) => ({ url: `exams/${examId}/report-cards/print`, params: studentId ? { studentId } : undefined }),
      transformResponse: (res: ApiEnvelope<PrintableReportCards>) => res.data,
      providesTags: ["Exam", "Remarks"],
    }),
  }),
});

export const {
  useGetAdmitCardsQuery,
  useLazyGetAdmitCardsQuery,
  useSaveDateSheetMutation,
  useGetExamsQuery,
  useEnterExamResultsMutation,
  useGetExamResultsQuery,
  useGetExamProgressQuery,
  useGetReportCardQuery,
  useLazyGetPrintableReportCardsQuery,
  useGetExamAnalysisQuery,
  useGetExamAuditQuery,
  useSetExamLockMutation,
  useSetResultsPublishedMutation,
} = examsApi;
