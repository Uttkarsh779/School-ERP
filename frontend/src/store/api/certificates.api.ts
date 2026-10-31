import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type CertificateType = "TRANSFER" | "BONAFIDE" | "CHARACTER" | "FEE";

export interface StudentCertificate {
  id: number;
  serialNo: string;
  type: CertificateType;
  studentId: number;
  issueDate: string;
  // Every printed field, as issued.
  data: Record<string, string>;
  issuedByUser: { name: string } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  student?: { id: number; name: string; admissionNo: string };
}

export const certificatesApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getCertificateRegister: builder.query<StudentCertificate[], { type?: CertificateType } | void>({
      query: (params) => ({ url: "certificates", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<StudentCertificate[]>) => res.data,
      providesTags: ["Certificate"],
    }),
    getStudentCertificates: builder.query<StudentCertificate[], number>({
      query: (studentId) => `certificates/students/${studentId}`,
      transformResponse: (res: ApiEnvelope<StudentCertificate[]>) => res.data,
      providesTags: ["Certificate"],
    }),
    // Fields filled from the student's record; always fresh so edits to the profile show up.
    getCertificatePrefill: builder.query<Record<string, string>, { studentId: number; type: CertificateType }>({
      query: ({ studentId, type }) => ({ url: `certificates/students/${studentId}/prefill`, params: { type } }),
      transformResponse: (res: ApiEnvelope<Record<string, string>>) => res.data,
      keepUnusedDataFor: 0,
    }),
    issueCertificate: builder.mutation<
      StudentCertificate,
      { studentId: number; type: CertificateType; issueDate: string; data: Record<string, string>; markLeft?: boolean }
    >({
      query: ({ studentId, ...body }) => ({ url: `certificates/students/${studentId}`, method: "POST", body }),
      transformResponse: (res: ApiEnvelope<StudentCertificate>) => res.data,
      invalidatesTags: ["Certificate", "Student"],
    }),
    cancelCertificate: builder.mutation<StudentCertificate, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `certificates/${id}/cancel`, method: "PATCH", body: { reason } }),
      transformResponse: (res: ApiEnvelope<StudentCertificate>) => res.data,
      invalidatesTags: ["Certificate", "Student"],
    }),
  }),
});

export const {
  useGetCertificateRegisterQuery,
  useGetStudentCertificatesQuery,
  useGetCertificatePrefillQuery,
  useIssueCertificateMutation,
  useCancelCertificateMutation,
} = certificatesApi;
