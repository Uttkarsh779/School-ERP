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
}

export const examsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getExams: builder.query<IExam[], { classSectionId?: number } | void>({
      query: (params) => ({ url: "exams", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IExam[]>) => res.data,
      providesTags: ["Exam"],
    }),
    createExam: builder.mutation<IExam, { sessionId: number; name: string; classSectionId: number }>({
      query: (body) => ({ url: "exams", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IExam>) => res.data,
      invalidatesTags: ["Exam"],
    }),
    enterExamResults: builder.mutation<IExamResultOutcome[], { examId: number; results: EnterExamResultInput[] }>({
      query: ({ examId, results }) => ({ url: `exams/${examId}/results`, method: "POST", body: { results } }),
      transformResponse: (res: ApiEnvelope<IExamResultOutcome[]>) => res.data,
      invalidatesTags: ["Exam"],
    }),
    getExamResults: builder.query<IExamResult[], number>({
      query: (examId) => `exams/${examId}/results`,
      transformResponse: (res: ApiEnvelope<IExamResult[]>) => res.data,
      providesTags: ["Exam"],
    }),
    getReportCard: builder.query<IReportCard, { examId: number; studentId: number }>({
      query: ({ examId, studentId }) => `exams/${examId}/report-card/${studentId}`,
      transformResponse: (res: ApiEnvelope<IReportCard>) => res.data,
      providesTags: ["Exam"],
    }),
  }),
});

export const {
  useGetExamsQuery,
  useCreateExamMutation,
  useEnterExamResultsMutation,
  useGetExamResultsQuery,
  useGetReportCardQuery,
} = examsApi;
