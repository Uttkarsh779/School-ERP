import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const sessionsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getSessions: builder.query<IAcademicSession[], void>({
      query: () => "sessions",
      transformResponse: (res: ApiEnvelope<IAcademicSession[]>) => res.data,
      providesTags: ["Session"],
    }),
    createSession: builder.mutation<IAcademicSession, { name: string; startDate: string; endDate: string }>({
      query: (body) => ({ url: "sessions", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IAcademicSession>) => res.data,
      invalidatesTags: ["Session"],
    }),
    setCurrentSession: builder.mutation<void, number>({
      query: (id) => ({ url: `sessions/${id}/set-current`, method: "PUT" }),
      invalidatesTags: ["Session"],
    }),
  }),
});

export const { useGetSessionsQuery, useCreateSessionMutation, useSetCurrentSessionMutation } = sessionsApi;
