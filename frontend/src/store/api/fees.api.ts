import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

const feeTags = ["Fee", "Parent", "Student"] as any;

export interface FeeOverview {
  month: { year: number; month: number };
  collectedToday: number;
  paymentsToday: number;
  collectedThisMonth: number;
  paymentsThisMonth: number;
  byMode: Record<string, number>;
  billedThisMonth: number;
  collectionRate: number | null;
  outstanding: number;
  overdue: number;
  defaulterCount: number;
  pendingRefunds: number;
  stalePendingOnlinePayments: number;
  outstandingByClass: Array<{ classSection: string; outstanding: number; students: number }>;
  recentPayments: Array<{
    id: number;
    receiptNumber: string;
    amount: number;
    mode: string;
    paidAt: string;
    student: { id: number; name: string; admissionNo: string; classSection: string | null };
  }>;
}

export interface ReceiptDetails {
  receiptNumber: string | null;
  paymentNumber: string;
  paymentDate: string;
  mode: string;
  status: string;
  transactionRef: string | null;
  razorpayPaymentId: string | null;
  amountPaid: number;
  student: {
    id: number;
    name: string;
    admissionNo: string;
    rollNo: string;
    classSection: string;
    fatherName: string | null;
    contact: string | null;
  };
  settledItems: Array<{ feeHead: string; billingPeriod: string; periodLabel?: string; amountAllocated: number }>;
  sessionName?: string | null;
  receivedBy?: string | null;
  advanceAmount?: number;
  school?: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    boardName: string | null;
    affiliationNo: string | null;
    schoolCode: string | null;
  };
}

export interface RefundRecord {
  id: number;
  refundNumber: string;
  studentId: number;
  paymentId: number | null;
  amount: number;
  reason: string;
  status: "REFUND_REQUESTED" | "REFUND_APPROVED" | "REFUND_PROCESSED" | "REFUND_REJECTED";
  createdAt: string;
  processedAt: string | null;
  student?: { id: number; name: string; admissionNo: string; rollNo?: string };
  requestedByUser?: { id: number; name: string; role?: string };
  approvedByUser?: { id: number; name: string } | null;
}

export interface LateFeeRule {
  id: number;
  sessionId: number;
  gracePeriodDays: number;
  feeType: "FIXED" | "DAILY" | "SLAB";
  amount: number;
  slabsJson: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  date: string;
  description: string;
  type: "CHARGE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";
  debit: number;
  credit: number;
  balance: number;
  referenceNo?: string;
  paymentId?: number;
}

export interface StudentLedger {
  student: { id: number; name: string; admissionNo: string; rollNo: string; classSection: string };
  entries: LedgerEntry[];
  finalBalance: number;
}

// Charge as returned by the due summary (late fee + outstanding computed server-side).
export interface DueCharge {
  id: number;
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  baseAmount: number;
  discountAmount: number;
  paidAmount: number;
  calculatedLateFee: number;
  outstandingAmount: number;
  feeHead?: { name: string };
}

export interface CollectionPeriodPreview {
  collectionPeriodCode: string;
  totalEligible: number;
  alreadyBilled: number;
  newlyGenerated: number;
  expectedAmount: number;
}

export const feesApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getFeeOverview: builder.query<FeeOverview, void>({
      query: () => ({ url: "fees/overview" }),
      transformResponse: (res: ApiEnvelope<FeeOverview>) => res.data,
      providesTags: feeTags,
    }),
    getReceipt: builder.query<ReceiptDetails, number>({
      query: (paymentId) => ({ url: `payments/${paymentId}/receipt` }),
      transformResponse: (res: ApiEnvelope<ReceiptDetails>) => res.data,
      providesTags: feeTags,
    }),
    getRefunds: builder.query<RefundRecord[], { studentId?: number } | void>({
      query: (params) => ({ url: "refunds", params: params ?? undefined }),
      transformResponse: (res: ApiEnvelope<RefundRecord[]>) => res.data,
      providesTags: feeTags,
    }),
    requestRefund: builder.mutation<RefundRecord, { studentId: number; paymentId?: number; amount: number; reason: string }>({
      query: (body) => ({ url: "refunds", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<RefundRecord>) => res.data,
      invalidatesTags: feeTags,
    }),
    decideRefund: builder.mutation<RefundRecord, { id: number; approved: boolean }>({
      query: ({ id, approved }) => ({ url: `refunds/${id}/approve`, method: "PATCH", body: { approved } }),
      transformResponse: (res: ApiEnvelope<RefundRecord>) => res.data,
      invalidatesTags: feeTags,
    }),
    processRefund: builder.mutation<RefundRecord, number>({
      query: (id) => ({ url: `refunds/${id}/process`, method: "PATCH" }),
      transformResponse: (res: ApiEnvelope<RefundRecord>) => res.data,
      invalidatesTags: feeTags,
    }),
    getLateFeeRules: builder.query<LateFeeRule[], number>({
      query: (sessionId) => ({ url: "fees/late-fee-rules", params: { sessionId } }),
      transformResponse: (res: ApiEnvelope<LateFeeRule[]>) => res.data,
      providesTags: feeTags,
    }),
    createLateFeeRule: builder.mutation<
      LateFeeRule,
      { sessionId: number; gracePeriodDays: number; feeType: string; amount: number; slabsJson?: Array<{ uptoDays: number | null; amount: number }> }
    >({
      query: (body) => ({ url: "fees/late-fee-rules", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<LateFeeRule>) => res.data,
      invalidatesTags: feeTags,
    }),
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
    createRazorpayOrder: builder.mutation<
      { orderId: string; amount: number; amountInPaise: number; currency: string; keyId: string; paymentId: number; mock: boolean },
      { studentId: number; requestedAmount?: number }
    >({
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
    getStudentLedger: builder.query<StudentLedger, number>({
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
    getStudentMonthsChart: builder.query<any, { studentId: number; sessionId?: number }>({
      query: ({ studentId, sessionId }) => ({
        url: `fees/student/${studentId}/months-chart`,
        params: sessionId ? { sessionId } : undefined,
      }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      providesTags: feeTags,
    }),
    recordMultiMonthPayment: builder.mutation<any, any>({
      query: (body) => ({ url: "fees/payments/multi-month", method: "POST", body }),
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
  useGetStudentMonthsChartQuery,
  useRecordMultiMonthPaymentMutation,
  useGetFeeOverviewQuery,
  useGetReceiptQuery,
  useGetRefundsQuery,
  useRequestRefundMutation,
  useDecideRefundMutation,
  useProcessRefundMutation,
  useGetLateFeeRulesQuery,
  useCreateLateFeeRuleMutation,
} = feesApi;
