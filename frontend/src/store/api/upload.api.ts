import { erpApi } from "./erpApi";
import { shrinkImage } from "./shrinkImage";

export interface IUploadResponse {
  url: string;
  publicId: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
}

// Largest PDF the server accepts (backend middleware/upload.ts); checked here too so the
// user isn't left waiting for a big upload that will be refused.
export const MAX_DOCUMENT_MB = 5;

export const uploadApi = erpApi.injectEndpoints({
  endpoints: (build) => ({
    // Every upload in the ERP goes through here, so photos are always shrunk first.
    uploadFile: build.mutation<{ success: boolean; data: IUploadResponse }, { file: File | Blob; folder?: string }>({
      async queryFn({ file, folder }, _api, _extra, baseQuery) {
        const asFile = file instanceof File ? file : new File([file], "photo.jpg", { type: file.type || "image/jpeg" });
        const ready = await shrinkImage(asFile);
        const isPhoto = ["image/jpeg", "image/png", "image/webp"].includes(ready.type);
        if (!isPhoto && ready.size > MAX_DOCUMENT_MB * 1024 * 1024) {
          return {
            error: {
              status: 400,
              data: { message: `This file is ${(ready.size / 1024 / 1024).toFixed(1)} MB. PDFs and other files can be at most ${MAX_DOCUMENT_MB} MB.` },
            },
          };
        }
        const formData = new FormData();
        formData.append("file", ready);
        if (folder) formData.append("folder", folder);
        const res = await baseQuery({ url: "/upload", method: "POST", body: formData });
        return res.error ? { error: res.error } : { data: res.data as { success: boolean; data: IUploadResponse } };
      },
    }),
  }),
});

export const { useUploadFileMutation } = uploadApi;
