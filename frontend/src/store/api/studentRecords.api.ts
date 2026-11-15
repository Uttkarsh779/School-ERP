import { erpApi } from "./erpApi";
import { shrinkImage } from "./shrinkImage";

// Student documents and health records (backend /api/student-records).
interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type DocStatus = "VERIFIED" | "ON_FILE" | "MISSING";

export interface StudentDocument {
  id: number;
  docType: string;
  label: string;
  title: string | null;
  isPdf: boolean;
  bytes: number;
  uploadedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}
export interface DocChecklistItem {
  docType: string;
  label: string;
  status: DocStatus;
}
export interface StudentDocuments {
  documents: StudentDocument[];
  checklist: DocChecklistItem[];
  types: Array<{ value: string; label: string }>;
}

export interface HealthProfile {
  allergies: string | null;
  conditions: string | null;
  medicines: string | null;
  emergencyMedicine: string | null;
  dietary: string | null;
  disability: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  officeNotes?: string | null;
}
export interface HealthCheckup {
  id: number;
  checkupDate: string;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  visionLeft: string | null;
  visionRight: string | null;
  dental: string | null;
  notes: string | null;
}
export interface Vaccination {
  id: number;
  vaccine: string;
  dose: string | null;
  givenOn: string | null;
  notes: string | null;
}
export interface StudentHealth {
  bloodGroup: string | null;
  profile: HealthProfile;
  updatedAt: string | null;
  checkups: HealthCheckup[];
  vaccinations: Vaccination[];
}
// What a teacher sees.
export interface HealthAlert {
  allergies: string | null;
  conditions: string | null;
  emergencyMedicine: string | null;
  dietary: string | null;
}

export interface MyRecords {
  documents: {
    documents: Array<{ id: number; label: string; title: string | null; verified: boolean; createdAt: string }>;
    checklist: DocChecklistItem[];
  };
  health: StudentHealth;
}

export const studentRecordsApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    getStudentDocuments: b.query<StudentDocuments, number>({
      query: (studentId) => `student-records/students/${studentId}/documents`,
      transformResponse: (r: Envelope<StudentDocuments>) => r.data,
      providesTags: (_r, _e, id) => [{ type: "StudentDocument", id }],
    }),
    uploadStudentDocument: b.mutation<StudentDocument, { studentId: number; file: File; docType: string; title?: string }>({
      async queryFn({ studentId, file, docType, title }, _api, _extra, baseQuery) {
        const ready = await shrinkImage(file);
        const form = new FormData();
        form.append("file", ready);
        form.append("docType", docType);
        if (title) form.append("title", title);
        const res = await baseQuery({ url: `student-records/students/${studentId}/documents`, method: "POST", body: form, timeout: 120_000 });
        return res.error ? { error: res.error } : { data: (res.data as Envelope<StudentDocument>).data };
      },
      invalidatesTags: (_r, _e, a) => [{ type: "StudentDocument", id: a.studentId }],
    }),
    // The file, fetched with the login's token and handed back as a temporary object URL.
    openStudentDocument: b.mutation<{ url: string; type: string }, number>({
      query: (id) => ({
        url: `student-records/documents/${id}/file`,
        responseHandler: async (res: Response) => (res.ok ? { url: URL.createObjectURL(await res.blob()), type: res.headers.get("content-type") ?? "" } : res.json()),
        timeout: 60_000,
      }),
    }),
    verifyStudentDocument: b.mutation<StudentDocument, { id: number; studentId: number; verified: boolean }>({
      query: ({ id, verified }) => ({ url: `student-records/documents/${id}/verify`, method: "PATCH", body: { verified } }),
      transformResponse: (r: Envelope<StudentDocument>) => r.data,
      invalidatesTags: (_r, _e, a) => [{ type: "StudentDocument", id: a.studentId }],
    }),
    removeStudentDocument: b.mutation<{ id: number }, { id: number; studentId: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `student-records/documents/${id}/remove`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, a) => [{ type: "StudentDocument", id: a.studentId }],
    }),

    getStudentHealth: b.query<StudentHealth, number>({
      query: (studentId) => `student-records/students/${studentId}/health`,
      transformResponse: (r: Envelope<StudentHealth>) => r.data,
      providesTags: (_r, _e, id) => [{ type: "Health", id }],
    }),
    saveStudentHealth: b.mutation<StudentHealth, { studentId: number; profile: Partial<HealthProfile> }>({
      query: ({ studentId, profile }) => ({ url: `student-records/students/${studentId}/health`, method: "PUT", body: profile }),
      transformResponse: (r: Envelope<StudentHealth>) => r.data,
      // A disability on record changes the documents checklist.
      invalidatesTags: (_r, _e, a) => [{ type: "Health", id: a.studentId }, { type: "StudentDocument", id: a.studentId }],
    }),
    addHealthCheckup: b.mutation<HealthCheckup, { studentId: number } & Record<string, string | number>>({
      query: ({ studentId, ...body }) => ({ url: `student-records/students/${studentId}/checkups`, method: "POST", body }),
      transformResponse: (r: Envelope<HealthCheckup>) => r.data,
      invalidatesTags: (_r, _e, a) => [{ type: "Health", id: a.studentId }],
    }),
    deleteHealthCheckup: b.mutation<{ id: number }, { id: number; studentId: number }>({
      query: ({ id }) => ({ url: `student-records/checkups/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, a) => [{ type: "Health", id: a.studentId }],
    }),
    addVaccination: b.mutation<Vaccination, { studentId: number } & Record<string, string | number>>({
      query: ({ studentId, ...body }) => ({ url: `student-records/students/${studentId}/vaccinations`, method: "POST", body }),
      transformResponse: (r: Envelope<Vaccination>) => r.data,
      invalidatesTags: (_r, _e, a) => [{ type: "Health", id: a.studentId }],
    }),
    deleteVaccination: b.mutation<{ id: number }, { id: number; studentId: number }>({
      query: ({ id }) => ({ url: `student-records/vaccinations/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, a) => [{ type: "Health", id: a.studentId }],
    }),

    getMyRecords: b.query<MyRecords, void>({
      query: () => "student-records/me",
      transformResponse: (r: Envelope<MyRecords>) => r.data,
      providesTags: ["StudentDocument", "Health"],
    }),
  }),
});

export const {
  useGetStudentDocumentsQuery,
  useUploadStudentDocumentMutation,
  useOpenStudentDocumentMutation,
  useVerifyStudentDocumentMutation,
  useRemoveStudentDocumentMutation,
  useGetStudentHealthQuery,
  useSaveStudentHealthMutation,
  useAddHealthCheckupMutation,
  useDeleteHealthCheckupMutation,
  useAddVaccinationMutation,
  useDeleteVaccinationMutation,
  useGetMyRecordsQuery,
} = studentRecordsApi;
