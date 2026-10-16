import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiFaq = createApi({
  reducerPath: "apiFaq",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getFaqById: builder.query({
      query: (id) => `/faq/${id}`,
    }),
    getFaq: builder.query({
      query: () => "faq",
    }),
    createFaq: builder.mutation({
      query: (newFaq) => ({
        url: "faq",
        method: "POST",
        body: newFaq,
      }),
    }),
    updateFaq: builder.mutation({
      query: (updatedFaq) => ({
        url: `faq/${updatedFaq.id}`,
        method: "PUT",
        body: updatedFaq,
      }),
    }),
    patchFaq: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedFaq) => ({
        url: `faq/${updatedFaq.id}`,
        method: "PATCH",
        body: updatedFaq,
      }),
    }),
    deleteFaq: builder.mutation({
      query: (updatedFaq) => ({
        url: `faq/${updatedFaq.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
 useCreateFaqMutation,
 useGetFaqByIdQuery,
 useGetFaqQuery,
 useDeleteFaqMutation,
 usePatchFaqMutation,
 useUpdateFaqMutation
} = apiFaq;