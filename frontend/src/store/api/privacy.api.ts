import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}
const data = <T,>(r: ApiEnvelope<T>) => r.data;

// Privacy (DPDP Act): the notice, parental consent and families' data requests.
export interface PrivacyNotice {
  schoolName: string;
  noticeText: string;
  noticeVersion: number;
  grievanceName: string | null;
  grievanceEmail: string | null;
  grievancePhone: string | null;
  updatedAt: string;
}
export interface DataConsent {
  id: number;
  noticeVersion: number;
  givenBy: string;
  relationship: string;
  method: "ONLINE" | "PAPER";
  givenAt: string;
  withdrawnAt: string | null;
  withdrawReason: string | null;
  recordedBy?: { name: string } | null;
  withdrawnBy?: { name: string } | null;
}
export type DataRequestType = "CORRECTION" | "ERASURE" | "WITHDRAW_CONSENT";
export interface DataRequest {
  id: number;
  type: DataRequestType;
  details: string;
  status: "OPEN" | "RESOLVED" | "REJECTED";
  response: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy?: { name: string } | null;
  student?: { id: number; name: string; admissionNo: string; classSection: { className: string; section: string } };
}
export interface PrivacySettings {
  noticeText: string;
  noticeVersion: number;
  consentEnabled: boolean;
  grievanceName: string | null;
  grievanceEmail: string | null;
  grievancePhone: string | null;
  updatedAt: string;
}
export interface ConsentSummary {
  noticeVersion: number;
  consentEnabled: boolean;
  activeStudents: number;
  withConsent: number;
  openRequests: number;
  missing: Array<{ id: number; name: string; admissionNo: string; className: string; outdated: boolean }>;
}
export interface MyData {
  generatedAt: string;
  profile: Record<string, string | number | boolean | null>;
  records: { attendanceDays: number; examResults: number; payments: number; certificates: number };
  consents: Array<{ givenBy: string; relationship: string; method: string; noticeVersion: number; givenAt: string; withdrawnAt: string | null }>;
  requests: Array<{ type: string; status: string; createdAt: string; response: string | null }>;
}

export const REQUEST_LABEL: Record<DataRequestType, string> = {
  CORRECTION: "Correct my child's data",
  ERASURE: "Erase data",
  WITHDRAW_CONSENT: "Withdraw consent",
};

export const privacyApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    getPrivacyNotice: b.query<PrivacyNotice, void>({ query: () => "privacy/notice", transformResponse: data<PrivacyNotice>, providesTags: ["Privacy"] }),
    // Student login (parents use it)
    getMyConsentStatus: b.query<{ studentName: string; needsConsent: boolean; consent: DataConsent | null; notice: PrivacyNotice }, void>({
      query: () => "privacy/me/status",
      transformResponse: data<any>,
      providesTags: ["Privacy"],
    }),
    giveConsent: b.mutation<ApiEnvelope<null>, { givenBy: string; relationship: string; agree: boolean }>({
      query: (body) => ({ url: "privacy/me/consent", method: "POST", body }),
      invalidatesTags: ["Privacy"],
    }),
    getMyData: b.query<MyData, void>({ query: () => "privacy/me/data", transformResponse: data<MyData> }),
    getMyDataRequests: b.query<DataRequest[], void>({ query: () => "privacy/me/requests", transformResponse: data<DataRequest[]>, providesTags: ["Privacy"] }),
    createDataRequest: b.mutation<ApiEnvelope<null>, { type: DataRequestType; details: string }>({
      query: (body) => ({ url: "privacy/me/requests", method: "POST", body }),
      invalidatesTags: ["Privacy"],
    }),
    // Office
    getPrivacySettings: b.query<PrivacySettings, void>({ query: () => "privacy/settings", transformResponse: data<PrivacySettings>, providesTags: ["Privacy"] }),
    updatePrivacySettings: b.mutation<ApiEnvelope<PrivacySettings>, Partial<PrivacySettings> & { askAgain?: boolean }>({
      query: (body) => ({ url: "privacy/settings", method: "PUT", body }),
      invalidatesTags: ["Privacy"],
    }),
    getConsentSummary: b.query<ConsentSummary, void>({ query: () => "privacy/summary", transformResponse: data<ConsentSummary>, providesTags: ["Privacy"] }),
    getDataRequests: b.query<DataRequest[], string | void>({
      query: (status) => ({ url: "privacy/requests", params: status ? { status } : undefined }),
      transformResponse: data<DataRequest[]>,
      providesTags: ["Privacy"],
    }),
    resolveDataRequest: b.mutation<ApiEnvelope<null>, { id: number; status: "RESOLVED" | "REJECTED"; response: string }>({
      query: ({ id, ...body }) => ({ url: `privacy/requests/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Privacy"],
    }),
    getStudentPrivacy: b.query<{ noticeVersion: number; status: "NONE" | "OUTDATED" | "GIVEN"; consents: DataConsent[]; requests: DataRequest[] }, number>({
      query: (id) => `privacy/students/${id}`,
      transformResponse: data<any>,
      providesTags: ["Privacy"],
    }),
    recordPaperConsent: b.mutation<ApiEnvelope<null>, { studentId: number; givenBy: string; relationship: string; signedOn: string }>({
      query: ({ studentId, ...body }) => ({ url: `privacy/students/${studentId}/consent`, method: "POST", body }),
      invalidatesTags: ["Privacy"],
    }),
    withdrawConsent: b.mutation<ApiEnvelope<null>, { studentId: number; reason: string }>({
      query: ({ studentId, ...body }) => ({ url: `privacy/students/${studentId}/consent/withdraw`, method: "POST", body }),
      invalidatesTags: ["Privacy"],
    }),
  }),
});

export const {
  useGetPrivacyNoticeQuery,
  useGetMyConsentStatusQuery,
  useGiveConsentMutation,
  useLazyGetMyDataQuery,
  useGetMyDataRequestsQuery,
  useCreateDataRequestMutation,
  useGetPrivacySettingsQuery,
  useUpdatePrivacySettingsMutation,
  useGetConsentSummaryQuery,
  useGetDataRequestsQuery,
  useResolveDataRequestMutation,
  useGetStudentPrivacyQuery,
  useRecordPaperConsentMutation,
  useWithdrawConsentMutation,
} = privacyApi;
