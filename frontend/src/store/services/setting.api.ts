import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export const apiSetting = createApi({
  reducerPath: "apiSetting",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder) => ({
    getSettingById: builder.query({
      query: (id) => `/setting/${id}`,
    }),
    getSetting: builder.query({
      query: () => "setting",
    }),
    createSetting: builder.mutation({
      query: (newSetting) => ({
        url: "setting",
        method: "POST",
        body: newSetting,
      }),
    }),
    updateSetting: builder.mutation({
      query: (updatedSetting) => ({
        url: `setting/${updatedSetting.id}`,
        method: "PUT",
        body: updatedSetting,
      }),
    }),
    patchSetting: builder.mutation<IUser, Partial<IUser>>({
      query: (updatedSetting) => ({
        url: `setting/${updatedSetting.id}`,
        method: "PATCH",
        body: updatedSetting,
      }),
    }),
    deleteSetting: builder.mutation({
      query: (updatedSetting) => ({
        url: `setting/${updatedSetting.id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateSettingMutation,
  useGetSettingByIdQuery,
  useGetSettingQuery,
  useDeleteSettingMutation,
  usePatchSettingMutation,
  useUpdateSettingMutation,
} = apiSetting;
