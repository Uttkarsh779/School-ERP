import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiSocial = createApi({
  reducerPath: "apiSocial",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getSocialById: builder.query({
      query: (id) => `/social-links/${id}`,
    }),
    getSocial: builder.query({
      query: () => "social-links",
    }),
    createSocial: builder.mutation({
      query: (newSocial) => ({
        url: "social-links",
        method: "POST",
        body: newSocial,
      }),
    }),
    updateSocial: builder.mutation({
      query: (updatedSocial) => ({
        url: `social-links/${updatedSocial.id}`,
        method: "PUT",
        body: updatedSocial,
      }),
    }),
    patchSocial: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedSocial) => ({
        url: `social-links/${updatedSocial.id}`,
        method: "PATCH",
        body: updatedSocial,
      }),
    }),
    deleteSocial: builder.mutation({
      query: (updatedSocial) => ({
        url: `social-links/${updatedSocial.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateSocialMutation,
  useGetSocialByIdQuery,
  useGetSocialQuery,
  useDeleteSocialMutation,
  usePatchSocialMutation,
  useUpdateSocialMutation,
} = apiSocial;
