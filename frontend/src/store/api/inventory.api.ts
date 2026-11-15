import { erpApi } from "./erpApi";

// School stock (backend /api/inventory). The Excel stock register is exports "inventory".
interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type MovementType = "IN" | "ISSUE" | "RETURN" | "ADJUST" | "WRITE_OFF";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  IN: "Received",
  ISSUE: "Issued",
  RETURN: "Returned",
  ADJUST: "Stock count",
  WRITE_OFF: "Written off",
};
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
  minStock: number;
  stock: number;
  withStaff: number;
  isLow: boolean;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  lastUnitCost: number | null;
  stockValue: number | null;
}
export interface InventoryMovement {
  id: number;
  itemId: number;
  item: string;
  unit: string;
  type: MovementType;
  quantity: number;
  change: number;
  movedOn: string;
  supplier: string | null;
  billNo: string | null;
  unitCost: number | null;
  staffId: number | null;
  holder: string | null;
  note: string | null;
  isVoid: boolean;
  voidReason: string | null;
  createdBy: string;
  createdAt: string;
}
export interface HeldItem {
  itemId: number;
  item: string;
  unit: string;
  staffId: number | null;
  issuedTo: string | null;
  holder: string;
  quantity: number;
  since: string;
}
export interface IssuableStaff {
  id: number;
  name: string;
  employeeCode: string | null;
  staffCategory: string;
}

type Params = Record<string, string | number | boolean | undefined>;
const clean = (p?: Params) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== "" && v !== false).map(([k, v]) => [k, String(v)]));

export const inventoryApi = erpApi.injectEndpoints({
  endpoints: (b) => ({
    getInventoryCategories: b.query<InventoryCategory[], void>({
      query: () => "inventory/categories",
      transformResponse: (r: Envelope<InventoryCategory[]>) => r.data,
      providesTags: ["Inventory"],
    }),
    saveInventoryCategory: b.mutation<InventoryCategory, { id?: number; name: string; isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: id ? `inventory/categories/${id}` : "inventory/categories", method: id ? "PUT" : "POST", body }),
      invalidatesTags: ["Inventory"],
    }),
    getInventoryItems: b.query<InventoryItem[], Params | void>({
      query: (p) => ({ url: "inventory/items", params: clean(p ?? undefined) }),
      transformResponse: (r: Envelope<InventoryItem[]>) => r.data,
      providesTags: ["Inventory"],
    }),
    saveInventoryItem: b.mutation<unknown, { id?: number } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: id ? `inventory/items/${id}` : "inventory/items", method: id ? "PUT" : "POST", body }),
      invalidatesTags: ["Inventory"],
    }),
    getInventoryMovements: b.query<InventoryMovement[], Params | void>({
      query: (p) => ({ url: "inventory/movements", params: clean(p ?? undefined) }),
      transformResponse: (r: Envelope<InventoryMovement[]>) => r.data,
      providesTags: ["Inventory"],
    }),
    recordInventoryMovement: b.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "inventory/movements", method: "POST", body }),
      invalidatesTags: ["Inventory"],
    }),
    voidInventoryMovement: b.mutation<unknown, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `inventory/movements/${id}/void`, method: "POST", body: { reason } }),
      invalidatesTags: ["Inventory"],
    }),
    getItemsWithStaff: b.query<HeldItem[], void>({
      query: () => "inventory/with-staff",
      transformResponse: (r: Envelope<HeldItem[]>) => r.data,
      providesTags: ["Inventory"],
    }),
    getIssuableStaff: b.query<IssuableStaff[], void>({
      query: () => "inventory/staff",
      transformResponse: (r: Envelope<IssuableStaff[]>) => r.data,
    }),
  }),
});

export const {
  useGetInventoryCategoriesQuery,
  useSaveInventoryCategoryMutation,
  useGetInventoryItemsQuery,
  useSaveInventoryItemMutation,
  useGetInventoryMovementsQuery,
  useRecordInventoryMovementMutation,
  useVoidInventoryMovementMutation,
  useGetItemsWithStaffQuery,
  useGetIssuableStaffQuery,
} = inventoryApi;
