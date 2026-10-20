import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CreateClassSectionInput {
  sessionId: number;
  className: string;
  section: string;
  classTeacherId?: number;
}

export const classSectionsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    // Defaults to the current session; pass sessionId "all" for every session.
    getClassSections: builder.query<IClassSection[], { sessionId?: number | "all" } | void>({
      query: (params) => ({ url: "class-sections", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IClassSection[]>) => res.data,
      providesTags: ["ClassSection"],
    }),
    getMyClassSections: builder.query<IClassSection[], void>({
      query: () => "class-sections/mine",
      transformResponse: (res: ApiEnvelope<IClassSection[]>) => res.data,
      providesTags: ["ClassSection"],
    }),
    createClassSection: builder.mutation<IClassSection, CreateClassSectionInput>({
      query: (body) => ({ url: "class-sections", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IClassSection>) => res.data,
      invalidatesTags: ["ClassSection"],
    }),
    updateClassSection: builder.mutation<
      IClassSection,
      { id: number; className?: string; section?: string; classTeacherId?: number | null }
    >({
      query: ({ id, ...body }) => ({ url: `class-sections/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<IClassSection>) => res.data,
      invalidatesTags: ["ClassSection"],
    }),
    deleteClassSection: builder.mutation<void, number>({
      query: (id) => ({ url: `class-sections/${id}`, method: "DELETE" }),
      invalidatesTags: ["ClassSection"],
    }),
  }),
});

export const {
  useGetClassSectionsQuery,
  useGetMyClassSectionsQuery,
  useCreateClassSectionMutation,
  useUpdateClassSectionMutation,
  useDeleteClassSectionMutation,
} = classSectionsApi;
