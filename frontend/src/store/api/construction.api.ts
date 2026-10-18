import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

// SUPER_ADMIN only — the backend returns 403 for every other role. Money values arrive
// as decimal strings (Prisma Decimal) and are only converted to numbers for display.

export type ConstructionProjectStatus = "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
export type ConstructionExpenseCategory =
  | "MATERIALS"
  | "LABOUR"
  | "CONTRACTOR"
  | "TRANSPORT"
  | "EQUIPMENT"
  | "PERMITS_FEES"
  | "UTILITIES"
  | "MISCELLANEOUS";
export type ConstructionPaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID";
export type ConstructionPaymentMode = "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "OTHER";

interface UserRef {
  id: number;
  name: string;
}

export interface ConstructionProject {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  budget: string | null;
  status: ConstructionProjectStatus;
  startDate: string | null;
  endDate: string | null;
  totalSpent: string;
  expenseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionExpense {
  id: number;
  projectId: number;
  project: { id: number; name: string };
  title: string;
  category: ConstructionExpenseCategory;
  expenseDate: string;
  amount: string;
  vendorName: string | null;
  vendorContact: string | null;
  invoiceNumber: string | null;
  attachmentUrl: string | null;
  paymentStatus: ConstructionPaymentStatus;
  paymentMode: ConstructionPaymentMode | null;
  notes: string | null;
  isVoid: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  voidedByUser: UserRef | null;
  createdByUser: UserRef;
  updatedByUser: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionAuditEntry {
  id: number;
  action: string;
  timestamp: string;
  user: UserRef;
  oldValues: string | null;
  newValues: string | null;
}

export interface ConstructionExpenseFilters {
  projectId?: string;
  category?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  search?: string;
  includeVoid?: boolean;
  sortBy?: "expenseDate" | "amount" | "createdAt" | "title";
  sortOrder?: "asc" | "desc";
}

export interface ExpenseInput {
  projectId: number;
  title: string;
  category: ConstructionExpenseCategory;
  expenseDate: string;
  amount: string;
  vendorName?: string | null;
  vendorContact?: string | null;
  invoiceNumber?: string | null;
  attachmentUrl?: string | null;
  paymentStatus: ConstructionPaymentStatus;
  paymentMode?: ConstructionPaymentMode | null;
  notes?: string | null;
}

export interface ProjectInput {
  name: string;
  description?: string | null;
  location?: string | null;
  budget?: string | null;
  status?: ConstructionProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ConstructionSummary {
  totalAmount: string;
  entryCount: number;
  currentMonthAmount: string;
  currentMonthCount: number;
  byCategory: Array<{ category: ConstructionExpenseCategory; amount: string; count: number }>;
  recent: Array<{
    id: number;
    title: string;
    category: ConstructionExpenseCategory;
    expenseDate: string;
    amount: string;
    project: { id: number; name: string };
  }>;
  projects: Array<{ id: number; name: string; status: ConstructionProjectStatus; budget: string | null; totalSpent: string }>;
}

const toParams = (filters: ConstructionExpenseFilters) =>
  Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "" && v !== false)
      .map(([k, v]) => [k, String(v)])
  );

export const constructionApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getConstructionSummary: builder.query<ConstructionSummary, void>({
      query: () => "construction/summary",
      transformResponse: (res: ApiEnvelope<ConstructionSummary>) => res.data,
      providesTags: ["Construction"],
    }),
    getConstructionProjects: builder.query<ConstructionProject[], void>({
      query: () => "construction/projects",
      transformResponse: (res: ApiEnvelope<ConstructionProject[]>) => res.data,
      providesTags: ["Construction"],
    }),
    createConstructionProject: builder.mutation<ConstructionProject, ProjectInput>({
      query: (body) => ({ url: "construction/projects", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<ConstructionProject>) => res.data,
      invalidatesTags: ["Construction"],
    }),
    updateConstructionProject: builder.mutation<ConstructionProject, { id: number } & Partial<ProjectInput>>({
      query: ({ id, ...body }) => ({ url: `construction/projects/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<ConstructionProject>) => res.data,
      invalidatesTags: ["Construction"],
    }),
    getConstructionExpenses: builder.query<
      { rows: ConstructionExpense[]; totals: { count: number; amount: string } },
      ConstructionExpenseFilters
    >({
      query: (filters) => ({ url: "construction/expenses", params: toParams(filters) }),
      transformResponse: (res: ApiEnvelope<{ rows: ConstructionExpense[]; totals: { count: number; amount: string } }>) =>
        res.data,
      providesTags: ["Construction"],
    }),
    getConstructionExpense: builder.query<ConstructionExpense & { history: ConstructionAuditEntry[] }, number>({
      query: (id) => `construction/expenses/${id}`,
      transformResponse: (res: ApiEnvelope<ConstructionExpense & { history: ConstructionAuditEntry[] }>) => res.data,
      providesTags: ["Construction"],
    }),
    // idempotencyKey is generated once per opened form — a double submit or a retry
    // after a network blip returns the already-created expense instead of a duplicate.
    createConstructionExpense: builder.mutation<ConstructionExpense, { input: ExpenseInput; idempotencyKey: string }>({
      query: ({ input, idempotencyKey }) => ({
        url: "construction/expenses",
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
      transformResponse: (res: ApiEnvelope<ConstructionExpense>) => res.data,
      invalidatesTags: ["Construction"],
    }),
    updateConstructionExpense: builder.mutation<ConstructionExpense, { id: number; input: Partial<ExpenseInput> }>({
      query: ({ id, input }) => ({ url: `construction/expenses/${id}`, method: "PATCH", body: input }),
      transformResponse: (res: ApiEnvelope<ConstructionExpense>) => res.data,
      invalidatesTags: ["Construction"],
    }),
    voidConstructionExpense: builder.mutation<ConstructionExpense, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `construction/expenses/${id}/void`, method: "POST", body: { reason } }),
      transformResponse: (res: ApiEnvelope<ConstructionExpense>) => res.data,
      invalidatesTags: ["Construction"],
    }),
  }),
});

export const {
  useGetConstructionSummaryQuery,
  useGetConstructionProjectsQuery,
  useCreateConstructionProjectMutation,
  useUpdateConstructionProjectMutation,
  useGetConstructionExpensesQuery,
  useGetConstructionExpenseQuery,
  useCreateConstructionExpenseMutation,
  useUpdateConstructionExpenseMutation,
  useVoidConstructionExpenseMutation,
} = constructionApi;
