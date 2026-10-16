import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface MarkAttendanceEntry {
  studentId: number;
  status: AttendanceStatus;
}

export interface MarkAttendanceResult {
  studentId: number;
  success: boolean;
  message: string;
}

export interface AttendanceDefaulter {
  studentId: number;
  student: IStudent;
  total: number;
  present: number;
  percentage: number;
}

export interface AttendanceMonthlyReportEntry {
  studentId: number;
  student: IStudent;
  counts: Record<AttendanceStatus, number>;
}

export const attendanceApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    markAttendance: builder.mutation<
      MarkAttendanceResult[],
      { classSectionId: number; date: string; entries: MarkAttendanceEntry[] }
    >({
      query: (body) => ({ url: "attendance/mark", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<MarkAttendanceResult[]>) => res.data,
      invalidatesTags: ["Attendance"],
    }),
    getClassAttendance: builder.query<IAttendanceRecord[], { classSectionId: number; date: string }>({
      query: ({ classSectionId, date }) => ({ url: `attendance/class/${classSectionId}`, params: { date } }),
      transformResponse: (res: ApiEnvelope<IAttendanceRecord[]>) => res.data,
      providesTags: ["Attendance"],
    }),
    getStudentAttendanceSummary: builder.query<
      IAttendanceSummary,
      { studentId: number; from?: string; to?: string }
    >({
      query: ({ studentId, from, to }) => ({
        url: `attendance/student/${studentId}/summary`,
        params: { from, to },
      }),
      transformResponse: (res: ApiEnvelope<IAttendanceSummary>) => res.data,
      providesTags: ["Attendance"],
    }),
    getAttendanceDefaulters: builder.query<AttendanceDefaulter[], { classSectionId: number; threshold?: number }>({
      query: (params) => ({ url: "attendance/defaulters", params }),
      transformResponse: (res: ApiEnvelope<AttendanceDefaulter[]>) => res.data,
      providesTags: ["Attendance"],
    }),
    getAttendanceMonthlyReport: builder.query<
      AttendanceMonthlyReportEntry[],
      { classSectionId: number; year: number; month: number }
    >({
      query: (params) => ({ url: "attendance/report", params }),
      transformResponse: (res: ApiEnvelope<AttendanceMonthlyReportEntry[]>) => res.data,
      providesTags: ["Attendance"],
    }),
  }),
});

export const {
  useMarkAttendanceMutation,
  useGetClassAttendanceQuery,
  useGetStudentAttendanceSummaryQuery,
  useGetAttendanceDefaultersQuery,
  useGetAttendanceMonthlyReportQuery,
} = attendanceApi;
