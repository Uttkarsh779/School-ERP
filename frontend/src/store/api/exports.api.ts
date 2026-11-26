import { erpApi } from "./erpApi";
import { saveFile } from "./download";

// Excel downloads (backend /api/exports/*). Each one is permission-checked and audit-logged.
export type ExportPath = "students" | "udise-students" | "cbse-loc" | "attendance" | "staff" | "fee-dues" | "day-book" | "marks-register" | "transport" | "inventory" | "admissions";

// One student on school transport (the transport list print).
export interface TransportRider {
  route: string | null;
  vehicle: string | null;
  driver: string | null;
  stop: string;
  className: string | null;
  rollNo: string;
  admissionNo: string;
  name: string;
  fatherName: string | null;
  contact: string | null;
  monthlyFee: number;
  since: string;
}

export const exportsApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    downloadExport: b.mutation<{ saved: string }, { path: ExportPath; params?: Record<string, string | number | undefined> }>({
      query: ({ path, params }) => ({
        url: `exports/${path}`,
        params: Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "")),
        responseHandler: saveFile,
        timeout: 120_000,
      }),
    }),
    getTransportRows: b.query<TransportRider[], void>({
      query: () => "exports/transport/rows",
      transformResponse: (res: { data: TransportRider[] }) => res.data,
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useDownloadExportMutation, useLazyGetTransportRowsQuery } = exportsApi;
