import {
  ConstructionExpenseCategory,
  ConstructionPaymentMode,
  ConstructionPaymentStatus,
  ConstructionProjectStatus,
} from "../../generated/prisma/enums";
import { httpError } from "../../utils/httpError";

// Pure input parsing/validation for the construction module — no DB access, so it can be
// unit tested directly. Every function throws a 400 httpError on bad input.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Up to 10 integer digits and 2 decimals — fits Decimal(12, 2). Amounts are kept as
// strings end-to-end so no floating-point rounding ever touches a stored value.
const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

const MAX_TEXT = 200;
const MAX_NOTES = 2000;

// Today's date in IST as YYYY-MM-DD, used to reject future-dated expenses.
export const todayIST = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const optionalText = (value: unknown, field: string, max = MAX_TEXT): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw httpError(400, `${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw httpError(400, `${field} must be at most ${max} characters`);
  return trimmed === "" ? null : trimmed;
};

const requiredText = (value: unknown, field: string, max = MAX_TEXT): string => {
  const text = optionalText(value, field, max);
  if (!text) throw httpError(400, `${field} is required`);
  return text;
};

export const parseAmount = (value: unknown, field = "amount"): string => {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!AMOUNT_RE.test(raw)) {
    throw httpError(400, `${field} must be a positive number with at most 2 decimal places`);
  }
  if (Number(raw) <= 0) throw httpError(400, `${field} must be greater than zero`);
  return raw;
};

export const parseDate = (value: unknown, field: string, opts: { notFuture?: boolean } = {}): Date => {
  if (typeof value !== "string" || !DATE_RE.test(value.trim())) {
    throw httpError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  const day = value.trim();
  const date = new Date(day);
  // Rejects impossible dates like 2026-02-31, which Date would silently roll over.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw httpError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  if (opts.notFuture && day > todayIST()) throw httpError(400, `${field} cannot be in the future`);
  return date;
};

const optionalDate = (value: unknown, field: string): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return parseDate(value, field);
};

const parseEnum = <T extends string>(value: unknown, allowed: Record<string, T>, field: string): T => {
  if (typeof value !== "string" || !Object.values(allowed).includes(value as T)) {
    throw httpError(400, `Invalid ${field} "${String(value)}"`);
  }
  return value as T;
};

const parseId = (value: unknown, field: string): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${field} is required`);
  return n;
};

const optionalUrl = (value: unknown, field: string) => {
  const text = optionalText(value, field, 1000);
  if (text && !/^https?:\/\//i.test(text)) throw httpError(400, `${field} must be an http(s) URL`);
  return text;
};

// ---------- Projects ----------

export interface ProjectInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  budget?: string | null;
  status?: ConstructionProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
}

export const parseProjectInput = (body: Record<string, unknown>, partial = false): ProjectInput => {
  const input: ProjectInput = {};

  if (!partial || body.name !== undefined) input.name = requiredText(body.name, "Project name");
  input.description = optionalText(body.description, "Description", MAX_NOTES);
  input.location = optionalText(body.location, "Location");

  if (body.budget !== undefined) {
    input.budget = body.budget === null || body.budget === "" ? null : parseAmount(body.budget, "budget");
  }
  if (body.status !== undefined) {
    input.status = parseEnum(body.status, ConstructionProjectStatus, "project status");
  }
  input.startDate = optionalDate(body.startDate, "startDate");
  input.endDate = optionalDate(body.endDate, "endDate");
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    throw httpError(400, "startDate cannot be after endDate");
  }

  return input;
};

// ---------- Expenses ----------

export interface ExpenseInput {
  projectId?: number;
  title?: string;
  category?: ConstructionExpenseCategory;
  expenseDate?: Date;
  amount?: string;
  vendorName?: string | null;
  vendorContact?: string | null;
  invoiceNumber?: string | null;
  attachmentUrl?: string | null;
  paymentStatus?: ConstructionPaymentStatus;
  paymentMode?: ConstructionPaymentMode | null;
  notes?: string | null;
}

// partial=true is for PATCH: only fields present in the body are validated/returned, but
// any field that IS present must still be valid (e.g. you can't PATCH title to "").
export const parseExpenseInput = (body: Record<string, unknown>, partial = false): ExpenseInput => {
  const input: ExpenseInput = {};
  const has = (key: string) => !partial || body[key] !== undefined;

  if (has("projectId")) input.projectId = parseId(body.projectId, "Project");
  if (has("title")) input.title = requiredText(body.title, "Title");
  if (has("category")) input.category = parseEnum(body.category, ConstructionExpenseCategory, "category");
  if (has("expenseDate")) input.expenseDate = parseDate(body.expenseDate, "Expense date", { notFuture: true });
  if (has("amount")) input.amount = parseAmount(body.amount);

  input.vendorName = optionalText(body.vendorName, "Vendor name");
  input.vendorContact = optionalText(body.vendorContact, "Vendor contact", 50);
  input.invoiceNumber = optionalText(body.invoiceNumber, "Invoice / receipt number", 100);
  input.attachmentUrl = optionalUrl(body.attachmentUrl, "Attachment");
  input.notes = optionalText(body.notes, "Notes", MAX_NOTES);

  if (body.paymentStatus !== undefined) {
    input.paymentStatus = parseEnum(body.paymentStatus, ConstructionPaymentStatus, "payment status");
  }
  if (body.paymentMode !== undefined) {
    input.paymentMode =
      body.paymentMode === null || body.paymentMode === ""
        ? null
        : parseEnum(body.paymentMode, ConstructionPaymentMode, "payment mode");
  }

  // Drop undefined keys so a PATCH doesn't overwrite untouched columns.
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as ExpenseInput;
};

export const parseVoidReason = (body: Record<string, unknown>): string => {
  const reason = optionalText(body.reason, "Reason", 500);
  if (!reason || reason.length < 5) throw httpError(400, "A reason of at least 5 characters is required to void an expense");
  return reason;
};

export const parseIdempotencyKey = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(value)) {
    throw httpError(400, "Invalid idempotency key");
  }
  return value;
};

// ---------- List filters ----------

export interface ExpenseFilters {
  projectId?: number;
  category?: ConstructionExpenseCategory;
  paymentStatus?: ConstructionPaymentStatus;
  from?: Date;
  to?: Date;
  search?: string;
  includeVoid: boolean;
  sortBy: "expenseDate" | "amount" | "createdAt" | "title";
  sortOrder: "asc" | "desc";
}

export const parseExpenseFilters = (query: Record<string, unknown>): ExpenseFilters => {
  const str = (key: string) => {
    const v = query[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };

  const filters: ExpenseFilters = {
    includeVoid: str("includeVoid") === "true",
    sortBy: "expenseDate",
    sortOrder: "desc",
  };

  const projectId = str("projectId");
  if (projectId) filters.projectId = parseId(projectId, "projectId");

  const category = str("category");
  if (category) filters.category = parseEnum(category, ConstructionExpenseCategory, "category");

  const paymentStatus = str("paymentStatus");
  if (paymentStatus) filters.paymentStatus = parseEnum(paymentStatus, ConstructionPaymentStatus, "payment status");

  const from = str("from");
  const to = str("to");
  if (from) filters.from = parseDate(from, "from");
  if (to) filters.to = parseDate(to, "to");
  if (filters.from && filters.to && filters.from > filters.to) {
    throw httpError(400, "from date cannot be after to date");
  }

  filters.search = str("search");

  const sortBy = str("sortBy");
  if (sortBy) {
    if (!["expenseDate", "amount", "createdAt", "title"].includes(sortBy)) {
      throw httpError(400, `Invalid sortBy "${sortBy}"`);
    }
    filters.sortBy = sortBy as ExpenseFilters["sortBy"];
  }
  const sortOrder = str("sortOrder");
  if (sortOrder) {
    if (sortOrder !== "asc" && sortOrder !== "desc") throw httpError(400, `Invalid sortOrder "${sortOrder}"`);
    filters.sortOrder = sortOrder;
  }

  return filters;
};
