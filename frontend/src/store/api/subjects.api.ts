import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const subjectsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getSubjects: builder.query<ISubject[], { classSectionId: number }>({
      query: (params) => ({ url: "subjects", params }),
      transformResponse: (res: ApiEnvelope<ISubject[]>) => res.data,
      providesTags: ["Subject"],
    }),
    createSubject: builder.mutation<ISubject, { classSectionId: number; name: string }>({
      query: (body) => ({ url: "subjects", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<ISubject>) => res.data,
      invalidatesTags: ["Subject"],
    }),
    assignSubjectTeacher: builder.mutation<ISubject, { subjectId: number; staffId: number }>({
      query: ({ subjectId, staffId }) => ({ url: `subjects/${subjectId}/teacher`, method: "POST", body: { staffId } }),
      transformResponse: (res: ApiEnvelope<ISubject>) => res.data,
      invalidatesTags: ["Subject"],
    }),
    unassignSubjectTeacher: builder.mutation<ISubject, number>({
      query: (subjectId) => ({ url: `subjects/${subjectId}/teacher`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<ISubject>) => res.data,
      invalidatesTags: ["Subject"],
    }),
  }),
});

export const {
  useGetSubjectsQuery,
  useCreateSubjectMutation,
  useAssignSubjectTeacherMutation,
  useUnassignSubjectTeacherMutation,
} = subjectsApi;
