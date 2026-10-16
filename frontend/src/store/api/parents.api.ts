import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CreateParentInput {
  name: string;
  email?: string;
  password?: string;
  contact?: string;
  studentIds: number[];
}

export interface IParentDuesSummary {
  parentId: number;
  familyTotal: number;
  childrenSummaries: Array<{
    student: IStudent;
    relationshipType?: string;
    dueSummary: IDueSummary;
  }>;
}

export const parentsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getParents: builder.query<IParentGuardian[], void>({
      query: () => "parents",
      transformResponse: (res: ApiEnvelope<IParentGuardian[]>) => res.data,
      providesTags: ["Parent"],
    }),
    getParentById: builder.query<IParentGuardian, number>({
      query: (id) => `parents/${id}`,
      transformResponse: (res: ApiEnvelope<IParentGuardian>) => res.data,
      providesTags: ["Parent"],
    }),
    getParentDuesSummary: builder.query<IParentDuesSummary, number>({
      query: (id) => `parents/${id}/dues`,
      transformResponse: (res: ApiEnvelope<IParentDuesSummary>) => res.data,
      providesTags: ["Parent", "Student", "Fee"],
    }),
    getMyParentProfile: builder.query<IParentGuardian, void>({
      query: () => "parents/me",
      transformResponse: (res: ApiEnvelope<IParentGuardian>) => res.data,
      providesTags: ["Parent"],
    }),
    createParent: builder.mutation<IParentGuardian, CreateParentInput>({
      query: (body) => ({ url: "parents", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IParentGuardian>) => res.data,
      invalidatesTags: ["Parent", "Student"],
    }),
    linkChildToParent: builder.mutation<void, { parentId: number; studentId: number }>({
      query: ({ parentId, studentId }) => ({
        url: `parents/${parentId}/children`,
        method: "POST",
        body: { studentId },
      }),
      invalidatesTags: ["Parent"],
    }),
    unlinkChildFromParent: builder.mutation<void, { parentId: number; studentId: number }>({
      query: ({ parentId, studentId }) => ({
        url: `parents/${parentId}/children/${studentId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Parent"],
    }),
  }),
});

export const {
  useGetParentsQuery,
  useGetParentByIdQuery,
  useGetParentDuesSummaryQuery,
  useGetMyParentProfileQuery,
  useCreateParentMutation,
  useLinkChildToParentMutation,
  useUnlinkChildFromParentMutation,
} = parentsApi;
