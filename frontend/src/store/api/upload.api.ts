import { erpApi } from "./erpApi";

export interface IUploadResponse {
  url: string;
  publicId: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
}

export const uploadApi = erpApi.injectEndpoints({
  endpoints: (build) => ({
    uploadFile: build.mutation<{ success: boolean; data: IUploadResponse }, { file: File; folder?: string }>({
      query: ({ file, folder }) => {
        const formData = new FormData();
        formData.append("file", file);
        if (folder) {
          formData.append("folder", folder);
        }
        return {
          url: "/upload",
          method: "POST",
          body: formData,
        };
      },
    }),
  }),
});

export const { useUploadFileMutation } = uploadApi;
