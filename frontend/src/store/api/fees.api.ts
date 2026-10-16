import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const feeTags = ["Fee", "Parent", "Student"] as any;

export const feesApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getFeeHeads: builder.query<IFeeHead[], void>({
      query: () => ({ url: "fees/heads" }),
      transformResponse: (res: ApiEnvelope<IFeeHead[]>) => res.data,
      providesTags: feeTags,
    }),
    createFeeHead: builder.mutation<IFeeHead, Partial<IFeeHead>>({
      query: (body) => ({ url: "fees/heads", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IFeeHead>) => res.data,
      invalidatesTags: feeTags,
    }),
    updateFeeHead: builder.mutation<IFeeHead, { id: number; body: Partial<IFeeHead> }>({
      query: ({ id, body }) => ({ url: `fees/heads/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<IFeeHead>) => res.data,
      invalidatesTags: feeTags,
    }),
    deleteFeeHead: builder.mutation<any, number>({
      query: (id) => ({ url: `fees/heads/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    getFeeStructures: builder.query<IFeeStructure[], { classSectionId?: number; sessionId?: number } | void>({
      query: (params) => ({ url: "fee-structures", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IFeeStructure[]>) => res.data,
      providesTags: feeTags,
    }),
    getFeeStructureById: builder.query<IFeeStructure, number>({
      query: (id) => ({ url: `fee-structures/${id}` }),
      transformResponse: (res: ApiEnvelope<IFeeStructure>) => res.data,
      providesTags: feeTags,
    }),
    createFeeStructure: builder.mutation<IFeeStructure, any>({
      query: (body) => ({ url: "fee-structures", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IFeeStructure>) => res.data,
      invalidatesTags: feeTags,
    }),
    updateFeeStructure: builder.mutation<IFeeStructure, { id: number; body: any }>({
      query: ({ id, body }) => ({ url: `fee-structures/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<IFeeStructure>) => res.data,
      invalidatesTags: feeTags,
    }),
    deleteFeeStructure: builder.mutation<any, number>({
      query: (id) => ({ url: `fee-structures/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    bulkPreviewFeeStructures: builder.mutation<any, { feeStructureIds: number[]; feeHeadId: number; newAmount: number; effectiveFrom: string }>({
      query: (body) => ({ url: "fees/structures/bulk-preview", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
    }),
    bulkUpdateFeeStructures: builder.mutation<any, { feeStructureIds: number[]; feeHeadId: number; newAmount: number; effectiveFrom: string }>({
      query: (body) => ({ url: "fees/structures/bulk-update", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    generateFeeCharges: builder.mutation<any, { sessionId: number; classSectionId: number; billingMonth: number; billingYear: number }>({
      query: (body) => ({ url: "fees/charges/generate", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    getStudentDueSummary: builder.query<IDueSummary, number>({
      query: (studentId) => ({ url: `fees/student/${studentId}/due-summary` }),
      transformResponse: (res: ApiEnvelope<IDueSummary>) => res.data,
      providesTags: feeTags,
    }),
    createRazorpayOrder: builder.mutation<{ orderId: string; amount: number; keyId: string }, { studentId: number; requestedAmount?: number }>({
      query: (body) => ({ url: "payments/razorpay/order", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
    }),
    verifyRazorpayPayment: builder.mutation<any, { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string; studentId: number }>({
      query: (body) => ({ url: "payments/razorpay/verify", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    createManualPayment: builder.mutation<IPayment, { studentId: number; amount: number; mode: string; transactionRef?: string }>({
      query: (body) => ({ url: "payments/manual", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IPayment>) => res.data,
      invalidatesTags: feeTags,
    }),
    recordFamilyPayment: builder.mutation<any, { parentGuardianId: number; totalAmount: number; mode: string; transactionRef?: string; notes?: string; allocations: Array<{ studentId: number; amount: number; feeBillId?: number }> }>({
      query: (body) => ({ url: "fees/family-payment", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    getStudentLedger: builder.query<any, number>({
      query: (studentId) => ({ url: `fees/ledger/${studentId}` }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      providesTags: feeTags,
    }),
    getInvoices: builder.query<IInvoice[], { studentId?: number; sessionId?: number } | void>({
      query: (params) => ({ url: "fees/invoices", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<IInvoice[]>) => res.data,
      providesTags: feeTags,
    }),
    getFeeDefaulters: builder.query<any[], { classSectionId?: number } | void>({
      query: (params) => ({ url: "fee-payments/defaulters", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<any[]>) => res.data,
      providesTags: feeTags,
    }),
    getCollectionReport: builder.query<any, { startDate?: string; endDate?: string } | void>({
      query: (params) => ({ url: "fees/reports/collection", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      providesTags: feeTags,
    }),
    getAuditLogs: builder.query<any[], void>({
      query: () => ({ url: "fees/audit-logs" }),
      transformResponse: (res: ApiEnvelope<any[]>) => res.data,
      providesTags: feeTags,
    }),
    getFeePayments: builder.query<IFeePayment[], { studentId?: number }>({
      query: (params) => ({ url: "fee-payments", params }),
      transformResponse: (res: ApiEnvelope<IFeePayment[]>) => res.data,
      providesTags: feeTags,
    }),
    approveFeePayment: builder.mutation<IFeePayment, number>({
      query: (id) => ({ url: `fee-payments/${id}/approve`, method: "PATCH" }),
      transformResponse: (res: ApiEnvelope<IFeePayment>) => res.data,
      invalidatesTags: feeTags,
    }),
    getCollectionPeriodOverview: builder.query<any, { month?: number; year?: number; sessionId?: number } | void>({
      query: (params) => ({ url: "fees/collection-period/overview", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      providesTags: feeTags,
    }),
    previewCollectionPeriod: builder.mutation<any, { sessionId?: number; billingMonth?: number; billingYear?: number; classSectionId?: number; studentIds?: number[] }>({
      query: (body) => ({ url: "fees/collection-period/preview", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
    }),
    generateCollectionPeriodBills: builder.mutation<any, { sessionId?: number; billingMonth?: number; billingYear?: number; classSectionId?: number; studentIds?: number[] }>({
      query: (body) => ({ url: "fees/collection-period/generate", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    waiveLateFee: builder.mutation<any, { feeChargeIds: number[]; waiverAmountPerCharge?: number | "FULL"; reason: string }>({
      query: (body) => ({ url: "fees/adjustments/waive-late-fee", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
    extendDueDate: builder.mutation<any, { invoiceId: number; newDueDate: string; reason?: string }>({
      query: ({ invoiceId, ...body }) => ({ url: `fees/invoices/${invoiceId}/extend-due-date`, method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: feeTags,
    }),
  }),
});

export const {
  useGetFeeHeadsQuery,
  useCreateFeeHeadMutation,
  useUpdateFeeHeadMutation,
  useDeleteFeeHeadMutation,
  useGetFeeStructuresQuery,
  useGetFeeStructureByIdQuery,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  useBulkPreviewFeeStructuresMutation,
  useBulkUpdateFeeStructuresMutation,
  useGenerateFeeChargesMutation,
  useGetStudentDueSummaryQuery,
  useCreateRazorpayOrderMutation,
  useVerifyRazorpayPaymentMutation,
  useCreateManualPaymentMutation,
  useRecordFamilyPaymentMutation,
  useGetStudentLedgerQuery,
  useGetInvoicesQuery,
  useGetFeeDefaultersQuery,
  useGetCollectionReportQuery,
  useGetAuditLogsQuery,
  useGetFeePaymentsQuery,
  useApproveFeePaymentMutation,
  useGetCollectionPeriodOverviewQuery,
  usePreviewCollectionPeriodMutation,
  useGenerateCollectionPeriodBillsMutation,
  useWaiveLateFeeMutation,
  useExtendDueDateMutation,
} = feesApi;
