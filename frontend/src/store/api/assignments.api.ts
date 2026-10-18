import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type HomeworkStatus = "SUBMITTED" | "CHECKED" | "REDO";

export interface HomeworkSubmission {
  id: number;
  text: string | null;
  attachmentUrl: string | null;
  submittedOffline: boolean;
  submittedAt: string;
  isLate: boolean;
  status: HomeworkStatus;
  teacherComment: string | null;
  checkedAt: string | null;
  checkedBy?: string | null;
}

export interface IAssignment {
  id: number;
  title: string;
  description: string;
  classSectionId: number;
  subjectId: number;
  assignedById: number;
  dueDate: string;
  endDate?: string;
  attachmentUrl?: string | null;
  createdAt: string;
  classSection?: { id: number; className: string; section: string };
  subject?: { id: number; name: string };
  assignedBy?: { id: number; user?: { name: string } };
  // Staff view
  stats?: { submitted: number; students: number; toReview: number };
  // Student view
  mySubmission?: HomeworkSubmission | null;
}

export interface SubmissionsSheet {
  assignment: IAssignment;
  rows: Array<{ studentId: number; name: string; rollNo: string; submission: HomeworkSubmission | null }>;
}

export type AssignmentInput = {
  title: string;
  description: string;
  classSectionId: number;
  subjectId: number;
  dueDate: string;
  endDate?: string;
  attachmentUrl?: string | null;
};

export const assignmentsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAssignments: builder.query<IAssignment[], { classSectionId?: number; subjectId?: number } | void>({
      query: (params) => ({ url: "assignments", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IAssignment[]>) => res.data,
      providesTags: ["Homework"],
    }),
    createAssignment: builder.mutation<IAssignment, AssignmentInput>({
      query: (body) => ({ url: "assignments", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IAssignment>) => res.data,
      invalidatesTags: ["Homework", "Dashboard"],
    }),
    updateAssignment: builder.mutation<IAssignment, { id: number } & Partial<AssignmentInput>>({
      query: ({ id, ...body }) => ({ url: `assignments/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<IAssignment>) => res.data,
      invalidatesTags: ["Homework", "Dashboard"],
    }),
    deleteAssignment: builder.mutation<void, number>({
      query: (id) => ({ url: `assignments/${id}`, method: "DELETE" }),
      invalidatesTags: ["Homework", "Dashboard"],
    }),
    getSubmissions: builder.query<SubmissionsSheet, number>({
      query: (id) => `assignments/${id}/submissions`,
      transformResponse: (res: ApiEnvelope<SubmissionsSheet>) => res.data,
      providesTags: ["Homework"],
    }),
    submitHomework: builder.mutation<HomeworkSubmission, { id: number; text?: string; attachmentUrl?: string | null }>({
      query: ({ id, ...body }) => ({ url: `assignments/${id}/submit`, method: "POST", body }),
      transformResponse: (res: ApiEnvelope<HomeworkSubmission>) => res.data,
      invalidatesTags: ["Homework", "Dashboard"],
    }),
    reviewSubmission: builder.mutation<
      HomeworkSubmission,
      { id: number; studentId: number; action: "CHECKED" | "REDO" | "OFFLINE"; comment?: string }
    >({
      query: ({ id, studentId, ...body }) => ({ url: `assignments/${id}/submissions/${studentId}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<HomeworkSubmission>) => res.data,
      invalidatesTags: ["Homework"],
    }),
  }),
});

export const {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetSubmissionsQuery,
  useSubmitHomeworkMutation,
  useReviewSubmissionMutation,
} = assignmentsApi;
