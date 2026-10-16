import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiUser = createApi({
  reducerPath: "apiUser",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getUserById: builder.query({
      query: (id) => `users/${id}`,
    }),
    getCollegeDashboard: builder.query({
      query: () => `users/dashboard/college`,
    }),
    getCompanyDashboard: builder.query({
      query: () => `users/dashboard/company`,
    }),
    getUsers: builder.query({
      query: () => "users",
    }),
    createUser: builder.mutation({
      query: (newUser) => ({
        url: "users",
        method: "POST",
        body: newUser,
      }),
    }),
    loginUser: builder.mutation<ILoginFormInputs, Partial<ILoginFormInputs>>({
      query: (newUser) => ({
        url: "users/login",
        method: "POST",
        body: newUser,
      }),
    }),
    forgotPassword: builder.mutation<{ email: string }, { email: string }>({
      query: (newUser) => ({
        url: "users/forgot-password",
        method: "POST",
        body: newUser,
      }),
    }),
    resetPassword: builder.mutation<
      { code: string; password: string; token: string },
      { email: string; password: string; token: string }
    >({
      query: (newUser) => ({
        url: "users/reset-password",
        method: "POST",
        body: newUser,
        headers: { Authorization: `Bearer ${newUser?.token}` },
      }),
    }),
    updateUser: builder.mutation({
      query: (updatedUser) => ({
        url: `users/${updatedUser.id}`,
        method: "PUT",
        body: updatedUser,
      }),
    }),
    patchUser: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedUser) => ({
        url: `users/${updatedUser.id}`,
        method: "PATCH",
        body: updatedUser,
      }),
    }),
    deleteUser: builder.mutation({
      query: (updatedUser) => ({
        url: `users/${updatedUser.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useGetUserByIdQuery,
  useGetUsersQuery,
  useGetCollegeDashboardQuery,
  useGetCompanyDashboardQuery,
  useCreateUserMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useLoginUserMutation,
  useUpdateUserMutation,
  usePatchUserMutation,
  useDeleteUserMutation,
} = apiUser;
