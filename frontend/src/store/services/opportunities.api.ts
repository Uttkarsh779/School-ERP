import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiOpportunities = createApi({
  reducerPath: "apiOpportunities",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getOpportunitiesById: builder.query({
      query: (id) => `/opportunities/${id}`,
    }),
    getOpportunities: builder.query({
      query: () => "opportunities",
    }),
    getNotice: builder.query({
      query: () => "opportunities/notice",
    }),
    createOpportunities: builder.mutation({
      query: (newOpportunities) => ({
        url: "opportunities",
        method: "POST",
        body: newOpportunities,
      }),
    }),
    updateOpportunities: builder.mutation({
      query: (updatedOpportunities) => ({
        url: `opportunities/${updatedOpportunities.id}`,
        method: "PUT",
        body: updatedOpportunities,
      }),
    }),
    patchOpportunities: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedOpportunities) => ({
        url: `opportunities/${updatedOpportunities.id}`,
        method: "PATCH",
        body: updatedOpportunities,
      }),
    }),
    deleteOpportunities: builder.mutation({
      query: (updatedOpportunities) => ({
        url: `opportunities/${updatedOpportunities.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateOpportunitiesMutation,
  useGetOpportunitiesByIdQuery,
  useGetOpportunitiesQuery,
  useGetNoticeQuery,
  usePatchOpportunitiesMutation,
  useUpdateOpportunitiesMutation,
  useDeleteOpportunitiesMutation,
} = apiOpportunities;
