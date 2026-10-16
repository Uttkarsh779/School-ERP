import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiPortal = createApi({
  reducerPath: "apiPortal",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getPortalById: builder.query({
      query: (id) => `/other-portal/${id}`,
    }),
    getPortal: builder.query({
      query: () => "other-portal",
    }),
    createPortal: builder.mutation({
      query: (newPortal) => ({
        url: "other-portal",
        method: "POST",
        body: newPortal,
      }),
    }),
    updatePortal: builder.mutation({
      query: (updatedPortal) => ({
        url: `other-portal/${updatedPortal.id}`,
        method: "PUT",
        body: updatedPortal,
      }),
    }),
    patchPortal: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedPortal) => ({
        url: `other-portal/${updatedPortal.id}`,
        method: "PATCH",
        body: updatedPortal,
      }),
    }),
    deletePortal: builder.mutation({
      query: (updatedPortal) => ({
        url: `other-portal/${updatedPortal.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreatePortalMutation,
  useGetPortalByIdQuery,
  useGetPortalQuery,
  useDeletePortalMutation,
  usePatchPortalMutation,
  useUpdatePortalMutation,
} = apiPortal;
