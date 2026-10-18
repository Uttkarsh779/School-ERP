import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// SUPER_ADMIN only — the backend returns 403 for every other role.

export interface AdmissionReportFilters {
  sessionId?: string;
  from?: string;
  to?: string;
  className?: string;
  section?: string;
  gender?: string;
  category?: string;
  status?: "active" | "inactive" | "all";
  search?: string;
  sortBy?: "admissionDate" | "name" | "admissionNo" | "className";
  sortOrder?: "asc" | "desc";
}

export interface AdmissionReportRow {
  id: number;
  admissionNo: string;
  name: string;
  admissionDate: string;
  admissionDateRecorded: boolean;
  rollNo: string;
  className: string | null;
  section: string | null;
  sessionName: string | null;
  gender: Gender | null;
  category: StudentCategory | null;
  dob: string | null;
  fatherName: string | null;
  motherName: string | null;
  contact: string | null;
  previousSchool: string | null;
  isActive: boolean;
}

export interface AdmissionReportSummary {
  total: number;
  active: number;
  inactive: number;
  byGender: Record<string, number>;
  byCategory: Record<string, number>;
  byClass: Array<{ className: string; total: number; male: number; female: number }>;
  monthlyTrend: Array<{ month: string; count: number }>;
}

export interface AdmissionReport {
  session: { id: number; name: string } | null;
  summary: AdmissionReportSummary;
  rows: AdmissionReportRow[];
}

export interface AdmissionOverview {
  currentSession: { id: number; name: string } | null;
  totalStudents: number;
  activeStudents: number;
  currentSessionAdmissions: number;
  currentMonthAdmissions: number;
  currentSessionByGender: Record<string, number>;
  enquiries: Record<string, number> | null;
}

// Drops empty values so the query string only carries filters that are actually set.
const toParams = (filters: AdmissionReportFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));

export const admissionReportApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdmissionReport: builder.query<AdmissionReport, AdmissionReportFilters>({
      query: (filters) => ({ url: "admission-report", params: toParams(filters) }),
      transformResponse: (res: ApiEnvelope<AdmissionReport>) => res.data,
      providesTags: ["AdmissionReport", "Student"],
    }),
    getAdmissionFilterOptions: builder.query<{ classNames: string[]; sections: string[] }, void>({
      query: () => "admission-report/filter-options",
      transformResponse: (res: ApiEnvelope<{ classNames: string[]; sections: string[] }>) => res.data,
      providesTags: ["AdmissionReport", "ClassSection"],
    }),
    getAdmissionOverview: builder.query<AdmissionOverview, void>({
      query: () => "admission-report/overview",
      transformResponse: (res: ApiEnvelope<AdmissionOverview>) => res.data,
      providesTags: ["AdmissionReport", "Student", "Inquiry"],
    }),
  }),
});

export const { useGetAdmissionReportQuery, useGetAdmissionFilterOptionsQuery, useGetAdmissionOverviewQuery } =
  admissionReportApi;
