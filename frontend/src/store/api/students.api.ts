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
  useGetMyStudentProfileQuery,
  useCreateStudentMutation,
  useUpdateStudentMutation,
  useSetStudentActiveMutation,
  useSetStudentCredentialsMutation,
  useBulkImportStudentsMutation,
} = studentsApi;
