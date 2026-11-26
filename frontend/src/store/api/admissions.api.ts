import { erpApi } from "./erpApi";

// Online admissions (backend /api/admissions). /public/* is the website (no login).
interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type Stage = "ENQUIRY" | "APPLIED" | "TEST" | "SELECTED" | "ADMITTED" | "REJECTED" | "WITHDRAWN";
export type FeeStatus = "NONE" | "UNPAID" | "PAID" | "WAIVED";

export const STAGE_LABEL: Record<Stage, string> = {
  ENQUIRY: "Enquiry",
  APPLIED: "Applied",
  TEST: "Test / interview",
  SELECTED: "Selected",
  ADMITTED: "Admitted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};
export const OPEN_STAGES: Stage[] = ["ENQUIRY", "APPLIED", "TEST", "SELECTED"];

export interface PublicAdmissionSettings {
  isOpen: boolean;
  sessionName: string | null;
  closesOn: string | null;
  instructions: string | null;
  allowUploads: boolean;
  onlinePayment: boolean;
  classes: Array<{ name: string; fee: number }>;
  enquiryClasses: string[];
  fileTypes: Array<{ value: string; label: string }>;
}

export interface FamilyStatus {
  applicationNo: string;
  studentName: string;
  className: string;
  sessionName: string | null;
  stage: Stage;
  stageText: string;
  appliedOn: string;
  testAt: string | null;
  testVenue: string | null;
  fee: { amount: number; status: FeeStatus; receiptNo: string | null; paidAt: string | null; mode: string | null; reference: string | null; contactName: string };
  canPayOnline: boolean;
}

export interface PayOrder {
  orderId: string;
  keyId: string;
  amountInPaise: number;
  currency: string;
  mock: boolean;
  name: string;
  contact: string;
  email: string | null;
}

export interface AdmissionSettings {
  isOpen: boolean;
  sessionId: number | null;
  sessionName: string | null;
  classNames: string[];
  allClasses: string[];
  defaultFee: number;
  classFees: Record<string, number>;
  closesOn: string | null;
  instructions: string | null;
  allowUploads: boolean;
  onlinePayment: boolean;
}

export interface ApplicationRow {
  id: number;
  applicationNo: string;
  stage: Stage;
  source: string;
  sessionName: string | null;
  className: string;
  studentName: string;
  contactName: string;
  phone: string;
  contactedAt: string | null;
  testAt: string | null;
  testResult: string | null;
  feeAmount: number;
  feeStatus: FeeStatus;
  files: number;
  admittedStudentId: number | null;
  createdAt: string;
}

export interface Application {
  id: number;
  applicationNo: string;
  stage: Stage;
  source: string;
  sessionId: number | null;
  session: { id: number; name: string } | null;
  className: string;
  studentName: string;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  aadharNumber: string | null;
  category: string | null;
  nationality: string | null;
  previousSchool: string | null;
  previousClass: string | null;
  contactName: string;
  phone: string;
  email: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherPhone: string | null;
  motherOccupation: string | null;
  address: string | null;
  message: string | null;
  officeNotes: string | null;
  contactedAt: string | null;
  testAt: string | null;
  testVenue: string | null;
  testResult: string | null;
  testRemarks: string | null;
  feeAmount: number;
  feeStatus: FeeStatus;
  feeReceiptNo: string | null;
  feePaidAt: string | null;
  feeMode: string | null;
  feeReference: string | null;
  feeWaiveReason: string | null;
  closedReason: string | null;
  admittedStudent: { id: number; name: string; admissionNo: string } | null;
  createdAt: string;
  files: Array<{ id: number; docType: string; label: string; isPdf: boolean; bytes: number; moved: boolean; createdAt: string }>;
  events: Array<{ id: number; action: string; fromStage: string | null; toStage: string | null; note: string | null; by: string; createdAt: string }>;
}

export interface AdmitPrefill {
  admissionNo: string;
  admissionDate: string;
  sections: Array<{ id: number; label: string; className: string; students: number; nextRollNo: string }>;
}

const toForm = (fields: Record<string, unknown>, files: Array<{ file: File; type: string }>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  files.forEach((f, i) => {
    form.append("files", f.file);
    form.append(`fileType${i}`, f.type);
  });
  return form;
};

export const admissionsApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    // --- Website ---
    getPublicAdmissionSettings: b.query<PublicAdmissionSettings, void>({
      query: () => "admissions/public/settings",
      transformResponse: (r: Envelope<PublicAdmissionSettings>) => r.data,
    }),
    submitApplication: b.mutation<{ applicationNo: string; feeAmount: number; feeStatus: FeeStatus; onlinePayment: boolean }, { fields: Record<string, unknown>; files: Array<{ file: File; type: string }> }>({
      query: ({ fields, files }) => ({ url: "admissions/public/apply", method: "POST", body: toForm(fields, files), timeout: 180_000 }),
      transformResponse: (r: Envelope<{ applicationNo: string; feeAmount: number; feeStatus: FeeStatus; onlinePayment: boolean }>) => r.data,
    }),
    getFamilyStatus: b.mutation<FamilyStatus, { applicationNo: string; phone: string }>({
      query: (body) => ({ url: "admissions/public/status", method: "POST", body }),
      transformResponse: (r: Envelope<FamilyStatus>) => r.data,
    }),
    startRegistrationPayment: b.mutation<PayOrder, { applicationNo: string; phone: string }>({
      query: (body) => ({ url: "admissions/public/pay", method: "POST", body }),
      transformResponse: (r: Envelope<PayOrder>) => r.data,
    }),
    verifyRegistrationPayment: b.mutation<FamilyStatus, { applicationNo: string; phone: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }>({
      query: (body) => ({ url: "admissions/public/pay/verify", method: "POST", body }),
      transformResponse: (r: Envelope<FamilyStatus>) => r.data,
    }),

    // --- Office ---
    getAdmissionSettings: b.query<AdmissionSettings, void>({
      query: () => "admissions/settings",
      transformResponse: (r: Envelope<AdmissionSettings>) => r.data,
      providesTags: ["Admission"],
    }),
    saveAdmissionSettings: b.mutation<AdmissionSettings, Partial<AdmissionSettings>>({
      query: (body) => ({ url: "admissions/settings", method: "PUT", body }),
      invalidatesTags: ["Admission"],
    }),
    getApplications: b.query<{ applications: ApplicationRow[]; counts: Record<string, number> }, Record<string, string | number | undefined>>({
      query: (params) => ({ url: "admissions/applications", params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")) }),
      transformResponse: (r: Envelope<{ applications: ApplicationRow[]; counts: Record<string, number> }>) => r.data,
      providesTags: ["Admission"],
    }),
    getApplication: b.query<Application, number>({
      query: (id) => `admissions/applications/${id}`,
      transformResponse: (r: Envelope<Application>) => r.data,
      providesTags: ["Admission"],
    }),
    addApplication: b.mutation<{ id: number; applicationNo: string }, { fields: Record<string, unknown>; files: Array<{ file: File; type: string }> }>({
      query: ({ fields, files }) => ({ url: "admissions/applications", method: "POST", body: toForm(fields, files), timeout: 180_000 }),
      transformResponse: (r: Envelope<{ id: number; applicationNo: string }>) => r.data,
      invalidatesTags: ["Admission"],
    }),
    updateApplication: b.mutation<Application, { id: number } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `admissions/applications/${id}`, method: "PUT", body }),
      invalidatesTags: ["Admission"],
    }),
    changeApplicationStage: b.mutation<Application, { id: number; action: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `admissions/applications/${id}/stage`, method: "POST", body }),
      invalidatesTags: ["Admission"],
    }),
    recordRegistrationFee: b.mutation<Application, { id: number; mode: string; reference?: string }>({
      query: ({ id, ...body }) => ({ url: `admissions/applications/${id}/fee`, method: "POST", body }),
      invalidatesTags: ["Admission", "Account"],
    }),
    waiveRegistrationFee: b.mutation<Application, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `admissions/applications/${id}/fee/waive`, method: "POST", body: { reason } }),
      invalidatesTags: ["Admission"],
    }),
    getAdmitPrefill: b.query<AdmitPrefill, number>({
      query: (id) => `admissions/applications/${id}/admit`,
      transformResponse: (r: Envelope<AdmitPrefill>) => r.data,
      keepUnusedDataFor: 0,
    }),
    admitApplication: b.mutation<{ studentId: number; admissionNo: string }, { id: number; classSectionId: number; admissionNo: string; rollNo: string; admissionDate: string }>({
      query: ({ id, ...body }) => ({ url: `admissions/applications/${id}/admit`, method: "POST", body }),
      transformResponse: (r: Envelope<{ studentId: number; admissionNo: string }>) => r.data,
      invalidatesTags: ["Admission", "Student", "Dashboard"],
    }),
    openApplicationFile: b.mutation<{ url: string; type: string }, number>({
      query: (id) => ({
        url: `admissions/files/${id}`,
        responseHandler: async (res: Response) => (res.ok ? { url: URL.createObjectURL(await res.blob()), type: res.headers.get("content-type") ?? "" } : res.json()),
        timeout: 60_000,
      }),
    }),
  }),
});

export const {
  useGetPublicAdmissionSettingsQuery,
  useSubmitApplicationMutation,
  useGetFamilyStatusMutation,
  useStartRegistrationPaymentMutation,
  useVerifyRegistrationPaymentMutation,
  useGetAdmissionSettingsQuery,
  useSaveAdmissionSettingsMutation,
  useGetApplicationsQuery,
  useGetApplicationQuery,
  useAddApplicationMutation,
  useUpdateApplicationMutation,
  useChangeApplicationStageMutation,
  useRecordRegistrationFeeMutation,
  useWaiveRegistrationFeeMutation,
  useGetAdmitPrefillQuery,
  useAdmitApplicationMutation,
  useOpenApplicationFileMutation,
} = admissionsApi;
