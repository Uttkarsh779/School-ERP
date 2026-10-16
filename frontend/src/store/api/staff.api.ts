import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CreateStaffInput {
  email?: string;
  password?: string;
  name: string;
  qualifications?: string;
  contact?: string;
  staffCategory?: string;
}

export const staffApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getStaffList: builder.query<IStaff[], void>({
      query: () => "staff",
      transformResponse: (res: ApiEnvelope<IStaff[]>) => res.data,
      providesTags: ["Staff"],
    }),
    getStaffById: builder.query<IStaff, number>({
      query: (id) => `staff/${id}`,
      transformResponse: (res: ApiEnvelope<IStaff>) => res.data,
      providesTags: ["Staff"],
    }),
    createStaff: builder.mutation<IStaff, CreateStaffInput>({
      query: (body) => ({ url: "staff", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IStaff>) => res.data,
      invalidatesTags: ["Staff"],
    }),
    updateStaff: builder.mutation<IStaff, { id: number; name?: string; email?: string; qualifications?: string; contact?: string; staffCategory?: string }>({
      query: ({ id, ...body }) => ({ url: `staff/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<IStaff>) => res.data,
      invalidatesTags: ["Staff"],
    }),
    setStaffActive: builder.mutation<void, { id: number; isActive: boolean }>({
      query: ({ id, isActive }) => ({ url: `staff/${id}/active`, method: "PATCH", body: { isActive } }),
      invalidatesTags: ["Staff"],
    }),
  }),
});

export const {
  useGetStaffListQuery,
  useGetStaffByIdQuery,
  useCreateStaffMutation,
  useUpdateStaffMutation,
  useSetStaffActiveMutation,
} = staffApi;
