import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiMainMenu = createApi({
  reducerPath: "apiMainMenu",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getMainMenuById: builder.query({
      query: (id) => `/main-menu/${id}`,
    }),
    getMainMenu: builder.query({
      query: () => "main-menu",
    }),
    getMainMenuBySlug: builder.query({
      query: (id: string) => `/main-menu/slug/${id}`,
    }),
    getMainMenuAll: builder.query({
      query: () => "main-menu/all",
    }),
    createMainMenu: builder.mutation({
      query: (newMainMenu) => ({
        url: "main-menu",
        method: "POST",
        body: newMainMenu,
      }),
    }),
    updateMainMenu: builder.mutation({
      query: (updatedMainMenu) => ({
        url: `main-menu/${updatedMainMenu.id}`,
        method: "PUT",
        body: updatedMainMenu,
      }),
    }),
    patchMainMenu: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedMainMenu) => ({
        url: `main-menu/${updatedMainMenu.id}`,
        method: "PATCH",
        body: updatedMainMenu,
      }),
    }),
    deleteMainMenu: builder.mutation({
      query: (updatedMainMenu) => ({
        url: `main-menu/${updatedMainMenu.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateMainMenuMutation,
  useGetMainMenuByIdQuery,
  useGetMainMenuQuery,
  useGetMainMenuBySlugQuery,
  useGetMainMenuAllQuery,
  useDeleteMainMenuMutation,
  usePatchMainMenuMutation,
  useUpdateMainMenuMutation,
} = apiMainMenu;
