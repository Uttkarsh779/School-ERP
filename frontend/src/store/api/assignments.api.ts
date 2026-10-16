import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
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
  classSection?: {
    id: number;
    className: string;
    section: string;
  };
  subject?: {
    id: number;
    name: string;
  };
  assignedBy?: {
    id: number;
    user?: {
      name: string;
    };
  };
}

export const assignmentsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAssignments: builder.query<IAssignment[], { classSectionId?: number; subjectId?: number } | void>({
      query: (params) => ({ url: "assignments", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IAssignment[]>) => res.data,
      providesTags: ["Notice"],
    }),
    createAssignment: builder.mutation<IAssignment, { title: string; description: string; classSectionId: number; subjectId: number; dueDate: string; endDate?: string; attachmentUrl?: string }>({
      query: (body) => ({ url: "assignments", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IAssignment>) => res.data,
      invalidatesTags: ["Notice"],
    }),
    deleteAssignment: builder.mutation<void, number>({
      query: (id) => ({ url: `assignments/${id}`, method: "DELETE" }),
      invalidatesTags: ["Notice"],
    }),
  }),
});

export const {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useDeleteAssignmentMutation,
} = assignmentsApi;
