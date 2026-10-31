import { erpApi } from "./erpApi";

// Exam planning, assessment schemes, periodic assessment, term remarks and term/final
// results (backend: modules/exams/planRoutes.ts).

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}
const data = <T,>(res: ApiEnvelope<T>) => res.data;

export type ExamType = "TERM_EXAM" | "PERIODIC_TEST" | "CLASS_TEST";
export const EXAM_TYPE_LABEL: Record<ExamType, string> = { TERM_EXAM: "Term exam", PERIODIC_TEST: "Periodic test", CLASS_TEST: "Class test" };

export interface PaComponent {
  key: string;
  label: string;
  max: number;
  source: "TESTS" | "MARKS";
  rule?: "AVERAGE" | "BEST";
  best?: number;
}
export interface Scheme {
  id: number;
  name: string;
  classNames: string[];
  terms: number;
  paMax: number;
  examMax: number;
  passPercentage: number;
  finalWeights: number[];
  paComponents: PaComponent[];
  gradeScale: { min: number; grade: string }[];
  coScale: number;
}

export interface ExamMeta {
  permissions: { coordinator: boolean; publisher: boolean };
  settings: { admitCardsForDefaulters: boolean };
}

export interface PlanGroup {
  groupKey: string;
  name: string;
  type: ExamType;
  term: number;
  admitCard: boolean;
  marksDeadline: string | null;
  exams: {
    id: number;
    classSectionId: number;
    className: string;
    section: string;
    isLocked: boolean;
    resultsPublished: boolean;
    readyAt: string | null;
    marksCount: number;
    hasDateSheet: boolean;
  }[];
}

export interface PlanInput {
  name?: string;
  type?: ExamType;
  term?: number;
  admitCard?: boolean;
  marksDeadline?: string | null;
  classSectionIds?: number[];
  addClassSectionIds?: number[];
}

export interface ExamSubjectRow {
  subjectId: number;
  name: string;
  maxMarks: number | null;
  canEdit: boolean;
}

export interface TermSubjectResult {
  subjectId: number;
  subjectName: string;
  components: { key: string; label: string; max: number; score: number | null }[];
  paSuggested: number;
  paAdjusted: number | null;
  pa: number;
  exam: number | null;
  examAbsent: boolean;
  hasPaper: boolean;
  total: number | null;
  max: number;
  percentage: number | null;
  grade: string | null;
  passed: boolean | null;
  complete: boolean;
}
export interface FinalSubjectResult {
  subjectId: number;
  subjectName: string;
  term1: { total: number | null; max: number; percentage: number | null; grade: string | null } | null;
  term2: { total: number | null; max: number; percentage: number | null; grade: string | null } | null;
  percentage: number | null;
  grade: string | null;
  passed: boolean | null;
  complete: boolean;
}
export type ResultStatus = "PASS" | "NEEDS_IMPROVEMENT" | "INCOMPLETE" | "PENDING";
export interface ResultStudent<S> {
  student: { id: number; name: string; admissionNo: string; rollNo: string; dob: string | null; gender: string | null; fatherName: string | null; motherName: string | null; photoUrl: string | null };
  subjects: S[];
  total?: number;
  maxTotal?: number;
  percentage: number | null;
  grade: string | null;
  result: ResultStatus;
  failedSubjects: string[];
  complete: boolean;
  remark: string | null;
  coScholastic: Record<string, string | null>;
  term1?: { percentage: number | null; grade: string | null } | null;
  term2?: { percentage: number | null; grade: string | null } | null;
  term1Remark?: string | null;
  term1CoScholastic?: Record<string, string | null> | null;
}
export interface ClassResult {
  kind: "TERM" | "FINAL";
  term?: number;
  classSection: { id: number; className: string; section: string };
  session: string;
  classTeacher: string | null;
  scheme: Omit<Scheme, "id" | "classNames" | "finalWeights">;
  exams?: { termExams: string[]; tests: string[] };
  weights?: number[];
  subjects: { id: number; name: string }[];
  students: ResultStudent<TermSubjectResult & FinalSubjectResult>[];
  attendance?: Record<number, { present: number; workingDays: number }>;
  termsInScheme: number;
  defaultWeights: number[];
  published: { at: string; weights: number[] } | null;
  canPublish: boolean;
}
export interface PublicationOverview {
  id: number;
  className: string;
  section: string;
  scheme: string;
  terms: number;
  published: { term: number; at: string }[];
}
export interface MyResult {
  classSectionId: number;
  term: number;
  publishedAt: string;
  kind: "TERM" | "FINAL";
  session: string;
  classSection: { className: string; section: string };
  classTeacher: string | null;
  scheme: ClassResult["scheme"];
  weights: number[] | null;
  subjects: { id: number; name: string }[];
  attendance: { present: number; workingDays: number } | null;
  row: ResultStudent<TermSubjectResult & FinalSubjectResult>;
}
export interface AssessmentSheet {
  term: number;
  classSection: { id: number; className: string; section: string };
  subject: { id: number; name: string };
  scheme: ClassResult["scheme"];
  exams: { termExams: string[]; tests: string[] };
  published: boolean;
  canEdit: boolean;
  students: {
    student: { id: number; name: string; rollNo: string };
    components: TermSubjectResult["components"];
    paSuggested: number;
    paAdjusted: number | null;
    pa: number;
    exam: number | null;
    total: number | null;
    grade: string | null;
  }[];
}
export interface TermRemarksSheet {
  term: number;
  classSection: { id: number; className: string; section: string };
  coScale: number;
  grades: string[];
  canEdit: boolean;
  students: { studentId: number; name: string; rollNo: string; remark: string | null; workEducation: string | null; artEducation: string | null; healthPhysical: string | null; discipline: string | null }[];
}

export const examPlanApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getExamMeta: builder.query<ExamMeta, void>({ query: () => "exams/meta", transformResponse: data<ExamMeta>, providesTags: ["Exam"] }),
    updateExamSettings: builder.mutation<unknown, { admitCardsForDefaulters: boolean }>({
      query: (body) => ({ url: "exams/settings", method: "PUT", body }),
      invalidatesTags: ["Exam"],
    }),
    getSchemes: builder.query<Scheme[], void>({ query: () => "exams/schemes", transformResponse: data<Scheme[]>, providesTags: ["Exam"] }),
    saveScheme: builder.mutation<Scheme, Partial<Scheme>>({
      query: ({ id, ...body }) => ({ url: id ? `exams/schemes/${id}` : "exams/schemes", method: id ? "PUT" : "POST", body }),
      transformResponse: data<Scheme>,
      invalidatesTags: ["Exam", "ExamResult"],
    }),
    deleteScheme: builder.mutation<unknown, number>({ query: (id) => ({ url: `exams/schemes/${id}`, method: "DELETE" }), invalidatesTags: ["Exam", "ExamResult"] }),

    getExamPlan: builder.query<PlanGroup[], void>({ query: () => "exams/plan", transformResponse: data<PlanGroup[]>, providesTags: ["Exam"] }),
    createPlannedExam: builder.mutation<{ groupKey: string; created: number }, PlanInput>({
      query: (body) => ({ url: "exams/plan", method: "POST", body }),
      transformResponse: data<{ groupKey: string; created: number }>,
      invalidatesTags: ["Exam"],
    }),
    updatePlannedExam: builder.mutation<unknown, { groupKey: string } & PlanInput>({
      query: ({ groupKey, ...body }) => ({ url: `exams/plan/${groupKey}`, method: "PATCH", body }),
      invalidatesTags: ["Exam"],
    }),
    deleteExam: builder.mutation<unknown, number>({ query: (id) => ({ url: `exams/${id}`, method: "DELETE" }), invalidatesTags: ["Exam", "ExamResult"] }),
    getExamSubjects: builder.query<ExamSubjectRow[], number>({ query: (id) => `exams/${id}/subjects`, transformResponse: data<ExamSubjectRow[]>, providesTags: ["Exam"] }),
    saveExamSubjects: builder.mutation<ExamSubjectRow[], { examId: number; subjects: { subjectId: number; maxMarks: number | null }[] }>({
      query: ({ examId, subjects }) => ({ url: `exams/${examId}/subjects`, method: "PUT", body: { subjects } }),
      transformResponse: data<ExamSubjectRow[]>,
      invalidatesTags: ["Exam", "ExamResult"],
    }),
    createClassTest: builder.mutation<IExam, { classSectionId: number; subjectId: number; name: string; maxMarks: number; testDate: string; term?: number }>({
      query: (body) => ({ url: "exams/class-tests", method: "POST", body }),
      transformResponse: data<IExam>,
      invalidatesTags: ["Exam"],
    }),
    setExamReady: builder.mutation<IExam, { examId: number; ready: boolean }>({
      query: ({ examId, ready }) => ({ url: `exams/${examId}/ready`, method: "PATCH", body: { ready } }),
      invalidatesTags: ["Exam"],
    }),

    getResultsOverview: builder.query<PublicationOverview[], void>({ query: () => "exams/results/overview", transformResponse: data<PublicationOverview[]>, providesTags: ["ExamResult"] }),
    getClassResult: builder.query<ClassResult, { classSectionId: number; term: number; weights?: number[] }>({
      query: ({ classSectionId, term, weights }) => ({ url: "exams/results", params: { classSectionId, term, ...(weights ? { weights: weights.join(",") } : {}) } }),
      transformResponse: data<ClassResult>,
      providesTags: ["ExamResult", "Exam"],
    }),
    publishResult: builder.mutation<{ published: number }, { classSectionIds: number[]; term: number; weights?: number[] }>({
      query: (body) => ({ url: "exams/results/publish", method: "POST", body }),
      transformResponse: data<{ published: number }>,
      invalidatesTags: ["ExamResult"],
    }),
    unpublishResult: builder.mutation<unknown, { classSectionId: number; term: number }>({
      query: (params) => ({ url: "exams/results", method: "DELETE", params }),
      invalidatesTags: ["ExamResult"],
    }),
    getMyResults: builder.query<MyResult[], void>({ query: () => "exams/my-results", transformResponse: data<MyResult[]>, providesTags: ["ExamResult"] }),

    getAssessmentSheet: builder.query<AssessmentSheet, { classSectionId: number; term: number; subjectId: number }>({
      query: (params) => ({ url: "exams/assessment", params }),
      transformResponse: data<AssessmentSheet>,
      providesTags: ["ExamResult", "Exam"],
    }),
    saveAssessmentMarks: builder.mutation<unknown, { classSectionId: number; term: number; subjectId: number; rows: { studentId: number; component: string; marks: number | null }[] }>({
      query: (body) => ({ url: "exams/assessment/marks", method: "PUT", body }),
      invalidatesTags: ["ExamResult"],
    }),
    saveAdjustments: builder.mutation<unknown, { classSectionId: number; term: number; subjectId: number; rows: { studentId: number; marks: number | null }[] }>({
      query: (body) => ({ url: "exams/assessment/adjust", method: "PUT", body }),
      invalidatesTags: ["ExamResult"],
    }),
    getTermRemarks: builder.query<TermRemarksSheet, { classSectionId: number; term: number }>({
      query: (params) => ({ url: "exams/term-remarks", params }),
      transformResponse: data<TermRemarksSheet>,
      providesTags: ["ExamResult"],
    }),
    saveTermRemarks: builder.mutation<unknown, { classSectionId: number; term: number; rows: Record<string, unknown>[] }>({
      query: (body) => ({ url: "exams/term-remarks", method: "PUT", body }),
      invalidatesTags: ["ExamResult"],
    }),
  }),
});

export const {
  useGetExamMetaQuery,
  useUpdateExamSettingsMutation,
  useGetSchemesQuery,
  useSaveSchemeMutation,
  useDeleteSchemeMutation,
  useGetExamPlanQuery,
  useCreatePlannedExamMutation,
  useUpdatePlannedExamMutation,
  useDeleteExamMutation,
  useGetExamSubjectsQuery,
  useSaveExamSubjectsMutation,
  useCreateClassTestMutation,
  useSetExamReadyMutation,
  useGetResultsOverviewQuery,
  useGetClassResultQuery,
  usePublishResultMutation,
  useUnpublishResultMutation,
  useGetMyResultsQuery,
  useGetAssessmentSheetQuery,
  useSaveAssessmentMarksMutation,
  useSaveAdjustmentsMutation,
  useGetTermRemarksQuery,
  useSaveTermRemarksMutation,
} = examPlanApi;
