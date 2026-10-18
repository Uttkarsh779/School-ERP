import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveRequest {
  id: number;
  kind: "STUDENT" | "STAFF";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  decidedBy: string | null;
  student: { id: number; name: string; rollNo: string; admissionNo: string; classSection: string | null } | null;
  staff: { id: number; name: string; category: string } | null;
  attendanceMarked?: number;
}

export const leavesApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyLeaves: builder.query<LeaveRequest[], void>({
      query: () => "leaves/mine",
      transformResponse: (res: ApiEnvelope<LeaveRequest[]>) => res.data,
      providesTags: ["Leave"],
    }),
    getClassLeaves: builder.query<LeaveRequest[], void>({
      query: () => "leaves/class",
      transformResponse: (res: ApiEnvelope<LeaveRequest[]>) => res.data,
      providesTags: ["Leave"],
    }),
    getAllLeaves: builder.query<LeaveRequest[], { kind?: string; status?: string } | void>({
      query: (params) => ({ url: "leaves", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<LeaveRequest[]>) => res.data,
      providesTags: ["Leave"],
    }),
    applyLeave: builder.mutation<LeaveRequest, { fromDate: string; toDate: string; reason: string }>({
      query: (body) => ({ url: "leaves", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<LeaveRequest>) => res.data,
      invalidatesTags: ["Leave"],
    }),
    cancelLeave: builder.mutation<LeaveRequest, number>({
      query: (id) => ({ url: `leaves/${id}/cancel`, method: "PATCH" }),
      transformResponse: (res: ApiEnvelope<LeaveRequest>) => res.data,
      invalidatesTags: ["Leave"],
    }),
    decideLeave: builder.mutation<LeaveRequest, { id: number; approved: boolean; note?: string }>({
      query: ({ id, ...body }) => ({ url: `leaves/${id}/decision`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<LeaveRequest>) => res.data,
      invalidatesTags: ["Leave", "Attendance", "Dashboard"],
    }),
  }),
});

export const {
  useGetMyLeavesQuery,
  useGetClassLeavesQuery,
  useGetAllLeavesQuery,
  useApplyLeaveMutation,
  useCancelLeaveMutation,
  useDecideLeaveMutation,
} = leavesApi;
