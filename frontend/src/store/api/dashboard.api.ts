import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const dashboardApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminDashboard: builder.query<IAdminDashboardCounts, void>({
      query: () => "dashboard/admin",
      transformResponse: (res: ApiEnvelope<IAdminDashboardCounts>) => res.data,
      providesTags: ["Dashboard"],
    }),
  }),
});

export const { useGetAdminDashboardQuery } = dashboardApi;
