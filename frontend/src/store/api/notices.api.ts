import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CreateNoticeInput {
  title: string;
  body: string;
  targetRole?: UserRole;
  targetClassSectionId?: number;
}

// Tag name "Notice" is referenced as a plain string here — the integration pass wires it
// into erpApi's shared tagTypes list (see erpApi.ts).
export const noticesApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotices: builder.query<INotice[], void>({
      query: () => "notices",
      transformResponse: (res: ApiEnvelope<INotice[]>) => res.data,
      providesTags: ["Notice"],
    }),
    createNotice: builder.mutation<INotice, CreateNoticeInput>({
      query: (body) => ({ url: "notices", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<INotice>) => res.data,
      invalidatesTags: ["Notice"],
    }),
    deleteNotice: builder.mutation<void, number>({
      query: (id) => ({ url: `notices/${id}`, method: "DELETE" }),
      invalidatesTags: ["Notice"],
    }),
  }),
});

export const { useGetNoticesQuery, useCreateNoticeMutation, useDeleteNoticeMutation } = noticesApi;
