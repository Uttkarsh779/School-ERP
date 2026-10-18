import type {
  ConstructionExpenseCategory,
  ConstructionPaymentMode,
  ConstructionPaymentStatus,
  ConstructionProjectStatus,
} from "../../../../store/api/construction.api";

export const CATEGORY_LABEL: Record<ConstructionExpenseCategory, string> = {
  MATERIALS: "Materials",
  LABOUR: "Labour",
  CONTRACTOR: "Contractor Payment",
  TRANSPORT: "Transportation",
  EQUIPMENT: "Equipment",
  PERMITS_FEES: "Permits & Fees",
  UTILITIES: "Utilities",
  MISCELLANEOUS: "Miscellaneous",
};

export const PAYMENT_STATUS_LABEL: Record<ConstructionPaymentStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  UNPAID: "Unpaid",
};

export const PAYMENT_STATUS_TONE: Record<ConstructionPaymentStatus, "success" | "warning" | "danger"> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  UNPAID: "danger",
};

export const PAYMENT_MODE_LABEL: Record<ConstructionPaymentMode, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const PROJECT_STATUS_LABEL: Record<ConstructionProjectStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

export const PROJECT_STATUS_TONE: Record<ConstructionProjectStatus, "neutral" | "info" | "warning" | "success"> = {
  PLANNED: "neutral",
  IN_PROGRESS: "info",
  ON_HOLD: "warning",
  COMPLETED: "success",
};

export const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

// Amounts come from the API as decimal strings; Number() is only used for display.
export const formatINR = (amount: string | number | null | undefined) =>
  `₹${Number(amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// expenseDate is a date-only column serialised as UTC midnight — format in UTC so it never
// shifts a day in the viewer's timezone.
export const formatDay = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
