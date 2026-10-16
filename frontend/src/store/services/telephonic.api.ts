import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiTelephonic = createApi({
  reducerPath: "apiTelephonic",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getTelephonicById: builder.query({
      query: (id) => `/telephonic/${id}`,
    }),
    getTelephonic: builder.query({
      query: () => "telephonic",
    }),
    createTelephonic: builder.mutation({
      query: (newTelephonic) => ({
        url: "telephonic",
        method: "POST",
        body: newTelephonic,
      }),
    }),
    updateTelephonic: builder.mutation({
      query: (updatedTelephonic) => ({
        url: `telephonic/${updatedTelephonic.id}`,
        method: "PUT",
        body: updatedTelephonic,
      }),
    }),
    patchTelephonic: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedTelephonic) => ({
        url: `telephonic/${updatedTelephonic.id}`,
        method: "PATCH",
        body: updatedTelephonic,
      }),
    }),
    deleteTelephonic: builder.mutation({
      query: (updatedTelephonic) => ({
        url: `telephonic/${updatedTelephonic.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
    useCreateTelephonicMutation,
    useGetTelephonicByIdQuery,
    useGetTelephonicQuery,
    usePatchTelephonicMutation,
    useUpdateTelephonicMutation,
    useDeleteTelephonicMutation

} = apiTelephonic;
