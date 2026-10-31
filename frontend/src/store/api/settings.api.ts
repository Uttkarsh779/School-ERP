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

export interface BackupRecord {
  id: number;
  kind: "AUTO" | "MANUAL";
  publicId: string | null;
  sizeBytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  error: string | null;
  deletedAt: string | null;
  createdAt: string;
}

// Saves the downloaded file in the browser (name from the server's Content-Disposition).
const saveFile = async (res: Response) => {
  if (!res.ok) return res.json();
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "backup.json.gz";
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: name };
};

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
    getBackups: builder.query<BackupRecord[], void>({
      query: () => "backups",
      transformResponse: (res: ApiEnvelope<BackupRecord[]>) => res.data,
      providesTags: ["Backup"],
    }),
    createBackup: builder.mutation<BackupRecord, void>({
      query: () => ({ url: "backups", method: "POST", timeout: 180_000 }),
      transformResponse: (res: ApiEnvelope<BackupRecord>) => res.data,
      invalidatesTags: ["Backup"],
    }),
    downloadBackup: builder.mutation<{ saved: string }, number>({
      query: (id) => ({ url: `backups/${id}/download`, responseHandler: saveFile }),
    }),
  }),
});

export const {
  useGetDocumentSettingsQuery,
  useUpdateDocumentSettingsMutation,
  useGetBackupsQuery,
  useCreateBackupMutation,
  useDownloadBackupMutation,
} = settingsApi;
