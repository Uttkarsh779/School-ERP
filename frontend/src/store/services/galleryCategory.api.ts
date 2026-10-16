import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "./api";

export interface GalleryCategory {
  id: number;
  title: string;
  description?: string;
  // add other fields as needed
}

interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  // You can extend for pagination metadata if your API sends it
}

export const galleryCategoryApi = createApi({
  reducerPath: "galleryCategoryApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["GalleryCategory"],
  endpoints: (builder) => ({
    // GET /gallery-category?limit=..&offset=..&search=..
    getGalleryCategories: builder.query<
      PaginatedResponse<GalleryCategory>,
      { limit?: number; offset?: number; search?: string } | void
    >({
      query: ({ limit = 10, offset = 0, search = "" } = {}) => {
        let url = `gallery-category?limit=${limit}&offset=${offset}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        return { url, method: "GET" };
      },
      providesTags: (result) =>
        result?.data && result.data.length
          ? [
              ...result.data.map(({ id }) => ({
                type: "GalleryCategory" as const,
                id,
              })),
              { type: "GalleryCategory", id: "LIST" },
            ]
          : [{ type: "GalleryCategory", id: "LIST" }],
    }),

    // GET /gallery-category/:id
    getGalleryCategory: builder.query<GalleryCategory, number>({
      query: (id) => ({ url: `gallery-category/${id}`, method: "GET" }),
      providesTags: (result, error, id) => [{ type: "GalleryCategory", id }],
    }),

    // POST /gallery-category
    addGalleryCategory: builder.mutation<
      GalleryCategory,
      Partial<GalleryCategory>
    >({
      query: (body) => ({
        url: "gallery-category",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "GalleryCategory", id: "LIST" }],
    }),

    // PUT /gallery-category/:id
    updateGalleryCategory: builder.mutation<
      GalleryCategory,
      { id: number; body: Partial<GalleryCategory> }
    >({
      query: ({ id, body }) => ({
        url: `gallery-category/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "GalleryCategory", id },
        { type: "GalleryCategory", id: "LIST" },
      ],
    }),

    // DELETE /gallery-category/:id
    deleteGalleryCategory: builder.mutation<void, number>({
      query: (id) => ({ url: `gallery-category/${id}`, method: "DELETE" }),
      invalidatesTags: (result, error, id) => [
        { type: "GalleryCategory", id },
        { type: "GalleryCategory", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetGalleryCategoriesQuery,
  useGetGalleryCategoryQuery,
  useLazyGetGalleryCategoriesQuery,
  useAddGalleryCategoryMutation,
  useUpdateGalleryCategoryMutation,
  useDeleteGalleryCategoryMutation,
} = galleryCategoryApi;

export default galleryCategoryApi;
