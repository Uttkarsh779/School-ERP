import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";
import type { EndpointBuilder } from "@reduxjs/toolkit/query/react";

type Builder = EndpointBuilder<
  BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>,
  never,
  "apiListpage"
>;

interface IPage {
  id: number;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const apiListpage = createApi({
  reducerPath: "apiListpage",
  baseQuery: baseQueryWithReauth,
  endpoints: (builder: Builder) => ({
    getListpageById: builder.query<IPage, number>({
      query: (id: number) => `/pages/${id}`,
    }),
    getListpageBySlug: builder.query<IPage, string>({
      query: (id: string) => `/pages/slug/${id}`,
    }),
    getListpage: builder.query<{ data: IPage[]; total: number }, void>({
      query: () => "pages",
    }),
    createListpage: builder.mutation<IPage, Partial<IPage>>({
      query: (newListpage: Partial<IPage>) => ({
        url: "pages",
        method: "POST",
        body: newListpage,
      }),
    }),
    updateListpage: builder.mutation<IPage, IPage>({
      query: (updatedListpage: IPage) => ({
        url: `pages/${updatedListpage.id}`,
        method: "PUT",
        body: updatedListpage,
      }),
    }),
    patchListpage: builder.mutation<IPage, Partial<IPage>>({
      query: (updatedListpage: Partial<IPage>) => ({
        url: `pages/${updatedListpage.id}`,
        method: "PATCH",
        body: updatedListpage,
      }),
    }),
    deleteListpage: builder.mutation<void, { id: number }>({
      query: ({ id }: { id: number }) => ({
        url: `pages/${id}`,
        method: "DELETE",
      }),
    }),
  }),
});

export const {
  useCreateListpageMutation,
  useGetListpageByIdQuery,
  useGetListpageBySlugQuery,
  useGetListpageQuery,
  useDeleteListpageMutation,
  usePatchListpageMutation,
  useUpdateListpageMutation,
} = apiListpage;
