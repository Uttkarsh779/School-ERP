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
    // Forgot password: staff get a code by email, students by SMS. mode matches the login tab.
    forgotPassword: builder.mutation<{ success: boolean; message: string }, { identifier: string; mode: "staff" | "family" }>({
      query: (body) => ({
        url: "users/forgot-password",
        method: "POST",
        body,
      }),
    }),
    resetPassword: builder.mutation<
      { success: boolean; message: string },
      { identifier: string; mode: "staff" | "family"; code: string; newPassword: string }
    >({
      query: (body) => ({
        url: "users/reset-password",
        method: "POST",
        body,
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
