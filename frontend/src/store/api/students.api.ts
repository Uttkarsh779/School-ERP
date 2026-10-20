import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface StudentProfileInput {
  dob?: string;
  gender?: Gender;
  bloodGroup?: string;
  photoUrl?: string;
  fatherName?: string;
  fatherContact?: string;
  motherName?: string;
  motherContact?: string;
  aadharNumber?: string;
  apaarId?: string;
  category?: StudentCategory;
  address?: string;
  contactNumber?: string;
  nationality?: string;
  previousSchool?: string;
  admissionDate?: string;
}

export type CreateStudentInput = StudentProfileInput & {
  name: string;
  rollNo: string;
  classSectionId: number;
  admissionNo: string;
};

type StatusCounts = { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number };

// Admin-only full history of one student (GET /students/:id/history).
export interface StudentHistory {
  studentId: number;
  academicHistory: Array<{
    sessionId: number;
    sessionName: string;
    classes: string[];
    current: boolean;
    outcome?: "PROMOTED" | "DETAINED" | "PASSED_OUT" | "LEFT" | null;
    remarks?: string | null;
  }>;
  attendance: {
    overall: { counts: StatusCounts; marked: number; percentage: number | null };
    sessions: Array<{
      sessionId: number;
      sessionName: string;
      classes: string[];
      totals: { counts: StatusCounts; marked: number; percentage: number | null };
      months: Array<{
        year: number;
        month: number;
        counts: StatusCounts;
        days: Record<string, AttendanceStatus>;
        marked: number;
        percentage: number | null;
      }>;
    }>;
  };
  exams: Array<{
    examId: number;
    examName: string;
    sessionName: string | null;
    className: string;
    isLocked: boolean;
    passPercentage: number;
    total: number;
    maxTotal: number;
    percentage: number | null;
    status: "PASS" | "FAIL" | "ABSENT" | "PENDING" | "NOT_ENTERED";
    rank: number | null;
    rankedCount: number;
    classAverage: number | null;
    failedSubjects: string[];
    subjects: Array<{
      subjectId: number;
      subjectName: string;
      entered: boolean;
      isAbsent?: boolean;
      marksObtained?: number;
      maxMarks?: number;
      percentage?: number;
      passed?: boolean;
    }>;
  }>;
  fees: {
    summary: {
      totalBilled: number;
      totalPaid: number;
      totalDiscounts: number;
      totalRefunded: number;
      totalOutstanding: number | null;
      advanceAvailable: number | null;
    };
    charges: Array<{
      id: number;
      feeHead: string;
      sessionName: string | null;
      billingMonth: number;
      billingYear: number;
      dueDate: string;
      baseAmount: number;
      discountAmount: number;
      lateFeeAmount: number;
      netAmount: number;
      paidAmount: number;
      balance: number;
      status: string;
    }>;
    payments: Array<{
      id: number;
      paymentNumber: string;
      receiptNumber: string | null;
      amount: number;
      mode: string;
      status: string;
      transactionRef: string | null;
      date: string;
    }>;
    adjustments: Array<{ id: number; type: string; amount: number; reason: string; appliedBy: string | null; date: string }>;
    concessions: Array<{
      id: number;
      name: string | null;
      type: string;
      calculationType: string;
      value: number;
      status: string;
      startsFrom: string | null;
      endsOn: string | null;
      reason: string | null;
      approvedBy: string | null;
    }>;
    refunds: Array<{ id: number; refundNumber: string; amount: number; reason: string; status: string; date: string }>;
    legacyPayments: Array<{ id: number; amount: number; mode: string; status: string; receiptNumber: string | null; date: string }>;
  };
  transport: Array<{
    id: number;
    villageName: string | null;
    monthlyFee: number | null;
    startDate: string;
    endDate: string | null;
    status: string;
    policy: string;
    discontinuedAt: string | null;
    discontinueReason: string | null;
  }>;
}

export const studentsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getStudents: builder.query<IStudent[], { classSectionId?: number } | void>({
      query: (params) => ({ url: "students", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IStudent[]>) => res.data,
      providesTags: ["Student"],
    }),
    getStudentById: builder.query<IStudent, number>({
      query: (id) => `students/${id}`,
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      providesTags: ["Student"],
    }),
    getStudentHistory: builder.query<StudentHistory, number>({
      query: (id) => `students/${id}/history`,
      transformResponse: (res: ApiEnvelope<StudentHistory>) => res.data,
      providesTags: ["Student", "Attendance", "Exam", "Fee", "Transport"],
    }),
    getMyStudentProfile: builder.query<IStudent, void>({
      query: () => "students/me",
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      providesTags: ["Student"],
    }),
    createStudent: builder.mutation<IStudent, CreateStudentInput>({
      query: (body) => ({ url: "students", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      invalidatesTags: ["Student"],
    }),
    updateStudent: builder.mutation<IStudent, { id: number } & Partial<CreateStudentInput>>({
      query: ({ id, ...body }) => ({ url: `students/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      invalidatesTags: ["Student"],
    }),
    setStudentActive: builder.mutation<IStudent, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({ url: `students/${id}/active`, method: "PATCH", body: { isActive } }),
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      invalidatesTags: ["Student"],
    }),
    setStudentCredentials: builder.mutation<{ email: string }, { id: number; email?: string; password: string }>({
      query: ({ id, ...body }) => ({ url: `students/${id}/credentials`, method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ email: string }>) => res.data,
    }),
    bulkImportStudents: builder.mutation<IBulkImportRowResult[], File>({
      query: (file) => {
        const formData = new FormData();
        formData.append("file", file);
        return { url: "students/bulk-import", method: "POST", body: formData };
      },
      transformResponse: (res: ApiEnvelope<IBulkImportRowResult[]>) => res.data,
      invalidatesTags: ["Student"],
    }),
  }),
});

export const {
  useGetStudentsQuery,
  useGetStudentByIdQuery,
  useGetStudentHistoryQuery,
  useGetMyStudentProfileQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useSetStudentActiveMutation,
  useSetStudentCredentialsMutation,
  useBulkImportStudentsMutation,
} = studentsApi;
