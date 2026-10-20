import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// ---- New session setup (rollover) ----
export interface SessionCounts {
  classes: number;
  subjects: number;
  allocations: number;
  slots: number;
  feeStructures: number;
  lateFeeRules: number;
  students: number;
}
export interface RolloverOverview {
  from: IAcademicSession;
  to: IAcademicSession;
  fromCounts: SessionCounts;
  toCounts: SessionCounts;
  examsInFrom: number;
}
export interface CopySetupBody {
  fromSessionId: number;
  toSessionId: number;
  classTeachers: boolean;
  subjects: boolean;
  teacherAllocations: boolean;
  timetable: boolean;
  feeStructures: boolean;
  lateFeeRule: boolean;
  feeIncreasePercent: number;
  roundFeesTo: number;
}
export interface CopySetupResult {
  classesCreated: number;
  classesExisting: number;
  classTeachers: number;
  subjects: number;
  allocations: number;
  timetableSlots: number;
  timetableSkipped: number;
  feeStructures: number;
  feeStructuresSkipped: number;
  lateFeeRule: boolean;
}
export type PromotionAction = "PROMOTE" | "DETAIN" | "PASSED_OUT" | "LEFT";
export interface PromotionPlanClass {
  id: number;
  className: string;
  section: string;
  students: Array<{ id: number; name: string; admissionNo: string; rollNo: string }>;
  suggestedPromoteToId: number | null;
  suggestedDetainToId: number | null;
  isFinalClass: boolean;
  defaultAction: PromotionAction;
}
export interface PromotionPlan {
  from: IAcademicSession;
  to: IAcademicSession;
  toClasses: Array<{ id: number; className: string; section: string; students: number }>;
  processed: Partial<Record<"PROMOTED" | "DETAINED" | "PASSED_OUT" | "LEFT", number>>;
  classes: PromotionPlanClass[];
}
export interface PromoteBody {
  fromSessionId: number;
  toSessionId: number;
  rollNumbering: "ALPHABETICAL" | "KEEP";
  decisions: Array<{ studentId: number; action: PromotionAction; toClassSectionId?: number | null; remarks?: string }>;
}
export interface PromoteResult {
  promoted: number;
  detained: number;
  passedOut: number;
  left: number;
  skipped: number;
}

export const sessionsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getSessions: builder.query<IAcademicSession[], void>({
      query: () => "sessions",
      transformResponse: (res: ApiEnvelope<IAcademicSession[]>) => res.data,
      providesTags: ["Session"],
    }),
    createSession: builder.mutation<IAcademicSession, { name: string; startDate: string; endDate: string }>({
      query: (body) => ({ url: "sessions", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IAcademicSession>) => res.data,
      invalidatesTags: ["Session"],
    }),
    setCurrentSession: builder.mutation<void, number>({
      query: (id) => ({ url: `sessions/${id}/set-current`, method: "PUT" }),
      // Class lists, fees and dashboards all follow the current session.
      invalidatesTags: ["Session", "ClassSection"],
    }),
    getRolloverOverview: builder.query<RolloverOverview, { from: number; to: number }>({
      query: (params) => ({ url: "sessions/rollover/overview", params }),
      transformResponse: (res: ApiEnvelope<RolloverOverview>) => res.data,
      providesTags: ["Session"],
    }),
    copySessionSetup: builder.mutation<CopySetupResult, CopySetupBody>({
      query: (body) => ({ url: "sessions/rollover/copy-setup", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<CopySetupResult>) => res.data,
      invalidatesTags: ["Session", "ClassSection"],
    }),
    getPromotionPlan: builder.query<PromotionPlan, { from: number; to: number }>({
      query: (params) => ({ url: "sessions/rollover/plan", params }),
      transformResponse: (res: ApiEnvelope<PromotionPlan>) => res.data,
      providesTags: ["Session"],
    }),
    promoteStudents: builder.mutation<PromoteResult, PromoteBody>({
      query: (body) => ({ url: "sessions/rollover/promote", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<PromoteResult>) => res.data,
      invalidatesTags: ["Student", "ClassSection", "Session"],
    }),
  }),
});

export const {
  useGetSessionsQuery,
  useCreateSessionMutation,
  useSetCurrentSessionMutation,
  useGetRolloverOverviewQuery,
  useCopySessionSetupMutation,
  useGetPromotionPlanQuery,
  usePromoteStudentsMutation,
} = sessionsApi;
