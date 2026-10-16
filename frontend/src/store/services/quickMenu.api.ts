import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiQuickMenu = createApi({
  reducerPath: "apiQuickMenu",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getQuickMenuById: builder.query({
      query: (id) => `/quick-menu/${id}`,
    }),
    getQuickMenu: builder.query({
      query: () => "quick-menu",
    }),
    createQuickMenu: builder.mutation({
      query: (newQuickMenu) => ({
        url: "quick-menu",
        method: "POST",
        body: newQuickMenu,
      }),
    }),
    updateQuickMenu: builder.mutation({
      query: (updatedQuickMenu) => ({
        url: `quick-menu/${updatedQuickMenu.id}`,
        method: "PUT",
        body: updatedQuickMenu,
      }),
    }),
    patchQuickMenu: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedQuickMenu) => ({
        url: `quick-menu/${updatedQuickMenu.id}`,
        method: "PATCH",
        body: updatedQuickMenu,
      }),
    }),
    deleteQuickMenu: builder.mutation({
      query: (updatedQuickMenu) => ({
        url: `quick-menu/${updatedQuickMenu.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateQuickMenuMutation,
  useGetQuickMenuByIdQuery,
  useGetQuickMenuQuery,
  useDeleteQuickMenuMutation,
  usePatchQuickMenuMutation,
  useUpdateQuickMenuMutation,
} = apiQuickMenu;
