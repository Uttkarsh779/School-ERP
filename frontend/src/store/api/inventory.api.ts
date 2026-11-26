import { erpApi } from "./erpApi";

// School stock (backend /api/inventory), kept as numbered documents:
// OPN- opening stock · GRN- goods receipt · ISS- issue slip · RET- return · ADJ- adjustment.
interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type DocKind = "OPENING" | "RECEIPT" | "ISSUE" | "RETURN" | "ADJUST";
export type IssueStatus = "OUT" | "PART_RETURNED" | "OVERDUE" | "SETTLED" | "CONSUMED" | "VOID";

export const KIND_LABEL: Record<DocKind, string> = {
  OPENING: "Opening stock",
  RECEIPT: "Goods receipt",
  ISSUE: "Issue slip",
  RETURN: "Return",
  ADJUST: "Adjustment",
};
export const ISSUE_STATUS: Record<IssueStatus, { label: string; tone: "warning" | "info" | "danger" | "success" | "neutral" }> = {
  OUT: { label: "To be returned", tone: "warning" },
  PART_RETURNED: { label: "Partly returned", tone: "info" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  SETTLED: { label: "All returned / closed", tone: "success" },
  CONSUMED: { label: "Consumed (nothing to return)", tone: "neutral" },
  VOID: { label: "Void", tone: "neutral" },
};
export const ADJUST_REASONS: Array<{ value: string; label: string; help: string }> = [
  { value: "COUNT", label: "Stock check", help: "You counted the stock and it differs from the book. Enter what you counted." },
  { value: "DAMAGED", label: "Damaged", help: "Broken or unusable items in the store — taken out of stock." },
  { value: "LOST", label: "Lost / missing", help: "Items missing from the store — taken out of stock." },
  { value: "EXPIRED", label: "Expired", help: "Past use-by date — taken out of stock." },
  { value: "FOUND", label: "Found / extra", help: "Extra items found in the store — added to stock." },
];
export const CLOSE_REASONS: Array<{ value: string; label: string }> = [
  { value: "CONSUMED", label: "Used up — not coming back" },
  { value: "HANDED_OVER", label: "Handed over permanently" },
  { value: "LOST", label: "Lost by the person" },
  { value: "DAMAGED", label: "Damaged beyond use" },
];
export const UNITS = ["pcs", "box", "pack", "set", "pair", "ream", "dozen", "kg", "litre", "metre", "roll", "bottle"];

export interface InventoryCategory {
  id: number;
  name: string;
  isActive: boolean;
  _count: { items: number };
}
export interface InventoryItem {
  id: number;
  name: string;
  categoryId: number;
  category: string | null;
  unit: string;
  returnable: boolean;
  reorderLevel: number;
  stock: number;
  issuedOut: number;
  total: number;
  needsReorder: boolean;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  lastRate: number | null;
  stockValue: number | null;
}
export interface LineBalance {
  lineId: number;
  issued: number;
  returnedGood: number;
  returnedDamaged: number;
  closed: number;
  out: number;
}
export interface DocLine {
  id: number;
  itemId: number;
  item: string;
  unit: string;
  quantity: number;
  change: number;
  rate: number | null;
  amount: number | null;
  toReturn: boolean;
  condition: string | null;
  remark: string | null;
  balance?: LineBalance | null;
}
export interface InventoryDoc {
  id: number;
  docNo: string;
  kind: DocKind;
  docDate: string;
  supplier: string | null;
  billNo: string | null;
  staffId: number | null;
  staffName: string | null;
  staffCode: string | null;
  department: string | null;
  issuedTo: string | null;
  purpose: string | null;
  expectedReturnOn: string | null;
  issueNo: string | null;
  issueId: number | null;
  reason: string | null;
  reasonLabel: string | null;
  note: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  lines: DocLine[];
  status?: IssueStatus;
  outQty?: number;
  settlements?: InventoryDoc[];
}
export interface PendingReturn {
  lineId: number;
  issueId: number;
  issueNo: string;
  issuedOn: string;
  expectedReturnOn: string | null;
  holder: string;
  staffId: number | null;
  purpose: string | null;
  itemId: number;
  item: string;
  unit: string;
  remark: string | null;
  issued: number;
  out: number;
  overdue: boolean;
  daysOut: number;
}
export interface LedgerRow {
  lineId: number;
  docId: number;
  docNo: string;
  kind: DocKind;
  date: string;
  particulars: string | null;
  party: string | null;
  inQty: number;
  outQty: number;
  rate: number | null;
  balance: number;
  remark: string | null;
}
export interface IssuableStaff {
  id: number;
  name: string;
  employeeCode: string | null;
  staffCategory: string;
}

type Params = Record<string, string | number | boolean | undefined>;
const clean = (p?: Params) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== "" && v !== false).map(([k, v]) => [k, String(v)]));
const data = <T,>(r: Envelope<T>) => r.data;

export const inventoryApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    getInventoryCategories: b.query<InventoryCategory[], void>({ query: () => "inventory/categories", transformResponse: data<InventoryCategory[]>, providesTags: ["Inventory"] }),
    saveInventoryCategory: b.mutation<InventoryCategory, { id?: number; name: string; isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: id ? `inventory/categories/${id}` : "inventory/categories", method: id ? "PUT" : "POST", body }),
      invalidatesTags: ["Inventory"],
    }),
    getInventoryItems: b.query<InventoryItem[], Params | void>({
      query: (p) => ({ url: "inventory/items", params: clean(p ?? undefined) }),
      transformResponse: data<InventoryItem[]>,
      providesTags: ["Inventory"],
    }),
    saveInventoryItem: b.mutation<unknown, { id?: number } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: id ? `inventory/items/${id}` : "inventory/items", method: id ? "PUT" : "POST", body }),
      invalidatesTags: ["Inventory"],
    }),
    getItemLedger: b.query<{ item: { id: number; name: string; unit: string; category: string | null; stock: number }; opening: number | null; rows: LedgerRow[] }, { id: number; from?: string; to?: string }>({
      query: ({ id, ...p }) => ({ url: `inventory/items/${id}/ledger`, params: clean(p) }),
      transformResponse: data<{ item: { id: number; name: string; unit: string; category: string | null; stock: number }; opening: number | null; rows: LedgerRow[] }>,
      providesTags: ["Inventory"],
    }),
    getInventoryDocs: b.query<InventoryDoc[], Params>({
      query: (p) => ({ url: "inventory/docs", params: clean(p) }),
      transformResponse: data<InventoryDoc[]>,
      providesTags: ["Inventory"],
    }),
    getInventoryDoc: b.query<InventoryDoc, number>({ query: (id) => `inventory/docs/${id}`, transformResponse: data<InventoryDoc>, providesTags: ["Inventory"] }),
    createReceipt: b.mutation<InventoryDoc, Record<string, unknown>>({ query: (body) => ({ url: "inventory/receipts", method: "POST", body }), transformResponse: data<InventoryDoc>, invalidatesTags: ["Inventory"] }),
    createIssue: b.mutation<InventoryDoc, Record<string, unknown>>({ query: (body) => ({ url: "inventory/issues", method: "POST", body }), transformResponse: data<InventoryDoc>, invalidatesTags: ["Inventory"] }),
    receiveBack: b.mutation<InventoryDoc, { issueId: number } & Record<string, unknown>>({
      query: ({ issueId, ...body }) => ({ url: `inventory/issues/${issueId}/return`, method: "POST", body }),
      transformResponse: data<InventoryDoc>,
      invalidatesTags: ["Inventory"],
    }),
    closeIssueLine: b.mutation<InventoryDoc, { issueId: number } & Record<string, unknown>>({
      query: ({ issueId, ...body }) => ({ url: `inventory/issues/${issueId}/close-line`, method: "POST", body }),
      transformResponse: data<InventoryDoc>,
      invalidatesTags: ["Inventory"],
    }),
    createAdjustment: b.mutation<InventoryDoc, Record<string, unknown>>({ query: (body) => ({ url: "inventory/adjustments", method: "POST", body }), transformResponse: data<InventoryDoc>, invalidatesTags: ["Inventory"] }),
    voidInventoryDoc: b.mutation<InventoryDoc, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `inventory/docs/${id}/void`, method: "POST", body: { reason } }),
      invalidatesTags: ["Inventory"],
    }),
    getPendingReturns: b.query<PendingReturn[], Params | void>({
      query: (p) => ({ url: "inventory/pending-returns", params: clean(p ?? undefined) }),
      transformResponse: data<PendingReturn[]>,
      providesTags: ["Inventory"],
    }),
    getIssuableStaff: b.query<IssuableStaff[], void>({ query: () => "inventory/staff", transformResponse: data<IssuableStaff[]> }),
    getSuppliers: b.query<string[], void>({ query: () => "inventory/suppliers", transformResponse: data<string[]>, providesTags: ["Inventory"] }),
  }),
});

export const {
  useGetInventoryCategoriesQuery,
  useSaveInventoryCategoryMutation,
  useGetInventoryItemsQuery,
  useSaveInventoryItemMutation,
  useGetItemLedgerQuery,
  useGetInventoryDocsQuery,
  useGetInventoryDocQuery,
  useCreateReceiptMutation,
  useCreateIssueMutation,
  useReceiveBackMutation,
  useCloseIssueLineMutation,
  useCreateAdjustmentMutation,
  useVoidInventoryDocMutation,
  useGetPendingReturnsQuery,
  useGetIssuableStaffQuery,
  useGetSuppliersQuery,
} = inventoryApi;
