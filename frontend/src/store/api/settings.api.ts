import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// Principal's signature, school seal and on which printed documents they appear.
export interface DocumentSettings {
  principalSignatureUrl: string | null;
  schoolSealUrl: string | null;
  signIdCards: boolean;
  signReportCards: boolean;
  signCertificates: boolean;
  signTc: boolean;
}

export const settingsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getDocumentSettings: builder.query<DocumentSettings, void>({
      query: () => "settings/documents",
      transformResponse: (res: ApiEnvelope<DocumentSettings>) => res.data,
      providesTags: ["DocumentSetting"],
    }),
    updateDocumentSettings: builder.mutation<DocumentSettings, Partial<DocumentSettings>>({
      query: (body) => ({ url: "settings/documents", method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<DocumentSettings>) => res.data,
      invalidatesTags: ["DocumentSetting"],
    }),
  }),
});

export const { useGetDocumentSettingsQuery, useUpdateDocumentSettingsMutation } = settingsApi;
