import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type AccountType = "EXPENSE" | "INCOME";
export type AccountPaymentMode = "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "OTHER";

export interface AccountCategory {
  id: number;
  name: string;
  type: AccountType;
  isActive: boolean;
  _count?: { entries: number };
}

export interface AccountEntry {
  id: number;
  voucherNo: string;
  type: AccountType;
  categoryId: number;
  category: { id: number; name: string; type: AccountType };
  entryDate: string;
  amount: string | number;
  party: string | null;
  paymentMode: AccountPaymentMode;
  referenceNo: string | null;
  billNumber: string | null;
  description: string;
  attachmentUrl: string | null;
  isVoid: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  createdByUser: { name: string } | null;
  updatedByUser: { name: string } | null;
  voidedByUser: { name: string } | null;
  createdAt: string;
}

export interface AccountEntryInput {
  type: AccountType;
  categoryId: number;
  entryDate: string;
  amount: number;
  party?: string;
  paymentMode: AccountPaymentMode;
  referenceNo?: string;
  billNumber?: string;
  description: string;
  attachmentUrl?: string | null;
  idempotencyKey?: string;
}

export interface AccountSummary {
  from: string;
  to: string;
  showsConstruction: boolean;
  months: Array<{ month: string; feeIncome: number; otherIncome: number; expense: number; construction: number; income: number; spent: number; net: number }>;
  totals: { feeIncome: number; otherIncome: number; expense: number; construction: number; income: number; spent: number; net: number };
  categories: Array<{ name: string; type: AccountType; amount: number }>;
}

export const accountsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getAccountCategories: builder.query<AccountCategory[], void>({
      query: () => "accounts/categories",
      transformResponse: (res: ApiEnvelope<AccountCategory[]>) => res.data,
      providesTags: ["Account"],
    }),
    createAccountCategory: builder.mutation<AccountCategory, { name: string; type: AccountType }>({
      query: (body) => ({ url: "accounts/categories", method: "POST", body }),
      invalidatesTags: ["Account"],
    }),
    updateAccountCategory: builder.mutation<AccountCategory, { id: number; name?: string; isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `accounts/categories/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Account"],
    }),
    getAccountEntries: builder.query<
      { entries: AccountEntry[]; totals: { expense: number; income: number; expenseCount: number; incomeCount: number } },
      { from?: string; to?: string; type?: string; categoryId?: string; q?: string; includeVoid?: boolean }
    >({
      query: ({ includeVoid, ...params }) => ({
        url: "accounts/entries",
        params: Object.fromEntries(Object.entries({ ...params, includeVoid: includeVoid ? "true" : undefined }).filter(([, v]) => v)),
      }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      providesTags: ["Account"],
    }),
    createAccountEntry: builder.mutation<AccountEntry, AccountEntryInput>({
      query: (body) => ({ url: "accounts/entries", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<AccountEntry>) => res.data,
      invalidatesTags: ["Account"],
    }),
    updateAccountEntry: builder.mutation<AccountEntry, { id: number } & AccountEntryInput>({
      query: ({ id, ...body }) => ({ url: `accounts/entries/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<AccountEntry>) => res.data,
      invalidatesTags: ["Account"],
    }),
    voidAccountEntry: builder.mutation<AccountEntry, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `accounts/entries/${id}/void`, method: "POST", body: { reason } }),
      invalidatesTags: ["Account"],
    }),
    getAccountSummary: builder.query<AccountSummary, { from?: string; to?: string }>({
      query: (params) => ({ url: "accounts/summary", params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)) }),
      transformResponse: (res: ApiEnvelope<AccountSummary>) => res.data,
      providesTags: ["Account", "Fee"],
    }),
  }),
});

export const {
  useGetAccountCategoriesQuery,
  useCreateAccountCategoryMutation,
  useUpdateAccountCategoryMutation,
  useGetAccountEntriesQuery,
  useCreateAccountEntryMutation,
  useUpdateAccountEntryMutation,
  useVoidAccountEntryMutation,
  useGetAccountSummaryQuery,
} = accountsApi;
