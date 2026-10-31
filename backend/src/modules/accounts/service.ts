import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";

// Accounts: the school's income & expense book.
//  - Every entry is a voucher with its own number (EXP/2026-27/0001, INC/2026-27/0001) per
//    academic session, a category, payment mode and an optional bill photo/PDF.
//  - Wrong entries are voided with a reason, never deleted; edits and voids are written to
//    the audit log (entityType "AccountEntry").
//  - The summary adds fee collection (from fee payments, less refunds) as income, so the
//    office doesn't enter fees twice. Construction spending is shown to the Super Admin.

export const ENTRY_TYPES = ["EXPENSE", "INCOME"] as const;
export const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"] as const;
type EntryType = (typeof ENTRY_TYPES)[number];
type Actor = { id: number; role: string };

const IST = 5.5 * 3600_000;
const num = (v: unknown) => Number(v ?? 0);
const isoDate = (v: unknown, label: string) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw httpError(400, `${label} must be a date`);
  return new Date(`${v}T00:00:00.000Z`);
};
const text = (v: unknown, label: string, max: number, required = false) => {
  const s = typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim();
  if (required && !s) throw httpError(400, `${label} is required`);
  if (s.length > max) throw httpError(400, `${label} is too long (max ${max})`);
  return s || null;
};
const typeOf = (v: unknown): EntryType => {
  if (!ENTRY_TYPES.includes(v as EntryType)) throw httpError(400, "type must be EXPENSE or INCOME");
  return v as EntryType;
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories = () =>
  prisma.accountCategory.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], include: { _count: { select: { entries: true } } } });

export const createCategory = async (body: any) => {
  const type = typeOf(body?.type);
  const name = text(body?.name, "Name", 60, true)!;
  try {
    return await prisma.accountCategory.create({ data: { type, name } });
  } catch (err: any) {
    if (err?.code === "P2002") throw httpError(409, `"${name}" already exists`);
    throw err;
  }
};

export const updateCategory = async (id: number, body: any) => {
  const data: any = {};
  if (body?.name !== undefined) data.name = text(body.name, "Name", 60, true);
  if (body?.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") throw httpError(400, "isActive must be true or false");
    data.isActive = body.isActive;
  }
  try {
    return await prisma.accountCategory.update({ where: { id }, data });
  } catch (err: any) {
    if (err?.code === "P2002") throw httpError(409, "A category with that name already exists");
    if (err?.code === "P2025") throw httpError(404, "Category not found");
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const parseEntry = async (body: any) => {
  const type = typeOf(body?.type);
  const categoryId = Number(body?.categoryId);
  const category = Number.isInteger(categoryId) ? await prisma.accountCategory.findUnique({ where: { id: categoryId } }) : null;
  if (!category) throw httpError(400, "Choose a category");
  if (category.type !== type) throw httpError(400, `"${category.name}" is not an ${type === "EXPENSE" ? "expense" : "income"} category`);
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e10 || Math.round(amount * 100) !== amount * 100) {
    throw httpError(400, "Amount must be more than zero, with at most 2 decimals");
  }
  const paymentMode = String(body?.paymentMode ?? "");
  if (!PAYMENT_MODES.includes(paymentMode as any)) throw httpError(400, "Choose how it was paid");
  const entryDate = isoDate(body?.entryDate, "Date");
  if (entryDate.getTime() > Date.now() + IST + 86_400_000) throw httpError(400, "Date can't be in the future");
  const attachmentUrl = text(body?.attachmentUrl, "Attachment", 1000);
  if (attachmentUrl && !/^https?:\/\//.test(attachmentUrl)) throw httpError(400, "Attachment must be an uploaded file link");
  return {
    type,
    categoryId,
    amount,
    paymentMode,
    entryDate,
    party: text(body?.party, type === "EXPENSE" ? "Paid to" : "Received from", 120),
    referenceNo: text(body?.referenceNo, "Reference no.", 60),
    billNumber: text(body?.billNumber, "Bill no.", 60),
    description: text(body?.description, "Description", 500, true)!,
    attachmentUrl,
  };
};

const sessionNameFor = async (date: Date) =>
  (await prisma.academicSession.findFirst({ where: { startDate: { lte: date }, endDate: { gte: date } }, select: { name: true } }))?.name ??
  (await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { name: true } }))?.name ??
  String(date.getUTCFullYear());

const nextVoucherNo = async (tx: any, type: EntryType, sessionName: string) => {
  const prefix = `${type === "EXPENSE" ? "EXP" : "INC"}/${sessionName}/`;
  const rows = await tx.accountEntry.findMany({ where: { voucherNo: { startsWith: prefix } }, select: { voucherNo: true } });
  const max = rows.reduce((m: number, r: any) => Math.max(m, Number(r.voucherNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

const entryInclude = {
  category: { select: { id: true, name: true, type: true } },
  createdByUser: { select: { name: true } },
  updatedByUser: { select: { name: true } },
  voidedByUser: { select: { name: true } },
};

export const createEntry = async (actor: Actor, body: any) => {
  const data = await parseEntry(body);
  const idempotencyKey = text(body?.idempotencyKey, "idempotencyKey", 80);
  if (idempotencyKey) {
    const existing = await prisma.accountEntry.findUnique({ where: { idempotencyKey }, include: entryInclude });
    if (existing) return existing;
  }
  const sessionName = await sessionNameFor(data.entryDate);
  // Two entries saved at once can pick the same number; the unique index rejects one, which retries.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) =>
        tx.accountEntry.create({
          data: { ...data, voucherNo: await nextVoucherNo(tx, data.type, sessionName), idempotencyKey, createdByUserId: actor.id },
          include: entryInclude,
        })
      );
    } catch (err: any) {
      const target = String(err?.meta?.target ?? "");
      if (err?.code === "P2002" && target.includes("idempotencyKey") && idempotencyKey) {
        return prisma.accountEntry.findUniqueOrThrow({ where: { idempotencyKey }, include: entryInclude });
      }
      if (err?.code === "P2002" && attempt < 3) continue;
      throw err;
    }
  }
};

const snapshot = (e: any) => ({
  type: e.type,
  categoryId: e.categoryId,
  amount: num(e.amount),
  entryDate: e.entryDate,
  party: e.party,
  paymentMode: e.paymentMode,
  referenceNo: e.referenceNo,
  billNumber: e.billNumber,
  description: e.description,
  attachmentUrl: e.attachmentUrl,
});

export const updateEntry = async (actor: Actor, id: number, body: any) => {
  const before = await prisma.accountEntry.findUnique({ where: { id } });
  if (!before) throw httpError(404, "Entry not found");
  if (before.isVoid) throw httpError(409, "A voided entry can't be edited");
  const data = await parseEntry({ ...body, type: before.type }); // type (and voucher series) can't change
  const after = await prisma.accountEntry.update({ where: { id }, data: { ...data, updatedByUserId: actor.id }, include: entryInclude });
  await createAuditLog({ action: "UPDATE", entityType: "AccountEntry", entityId: id, userId: actor.id, oldValues: snapshot(before), newValues: snapshot(after) });
  return after;
};

export const voidEntry = async (actor: Actor, id: number, reason: unknown) => {
  const why = text(reason, "Reason", 300, true)!;
  if (why.length < 3) throw httpError(400, "Please give a reason");
  const entry = await prisma.accountEntry.findUnique({ where: { id } });
  if (!entry) throw httpError(404, "Entry not found");
  if (entry.isVoid) throw httpError(409, "Already voided");
  const after = await prisma.accountEntry.update({
    where: { id },
    data: { isVoid: true, voidReason: why, voidedAt: new Date(), voidedByUserId: actor.id },
    include: entryInclude,
  });
  await createAuditLog({ action: "VOID", entityType: "AccountEntry", entityId: id, userId: actor.id, oldValues: snapshot(entry), newValues: { voidReason: why } });
  return after;
};

export const listEntries = async (q: any) => {
  const from = q?.from ? isoDate(q.from, "From") : undefined;
  const to = q?.to ? isoDate(q.to, "To") : undefined;
  const search = typeof q?.q === "string" ? q.q.trim() : "";
  const where: any = {
    ...(q?.type ? { type: typeOf(q.type) } : {}),
    ...(q?.categoryId ? { categoryId: Number(q.categoryId) } : {}),
    ...(q?.includeVoid === "true" ? {} : { isVoid: false }),
    ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { voucherNo: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { party: { contains: search, mode: "insensitive" } },
            { billNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [entries, totals] = await Promise.all([
    prisma.accountEntry.findMany({ where, include: entryInclude, orderBy: [{ entryDate: "desc" }, { id: "desc" }], take: 1000 }),
    prisma.accountEntry.groupBy({ by: ["type"], where: { ...where, isVoid: false }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const t = (type: string) => totals.find((r: any) => r.type === type);
  return {
    entries,
    totals: {
      expense: num(t("EXPENSE")?._sum.amount),
      income: num(t("INCOME")?._sum.amount),
      expenseCount: t("EXPENSE")?._count._all ?? 0,
      incomeCount: t("INCOME")?._count._all ?? 0,
    },
  };
};

// ---------------------------------------------------------------------------
// Summary: month by month, fee income + other income vs expenses
// ---------------------------------------------------------------------------

const monthKeyIst = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 7);
const monthKeyDate = (d: Date) => d.toISOString().slice(0, 7); // @db.Date columns

export const getSummary = async (actor: Actor, q: any) => {
  const current = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
  // Session dates are saved as midnight in India; take their India calendar date.
  const istDay = (d: Date) => new Date(`${new Date(d.getTime() + IST).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const from = q?.from ? isoDate(q.from, "From") : current ? istDay(current.startDate) : new Date(Date.UTC(new Date().getUTCFullYear(), 3, 1));
  const to = q?.to ? isoDate(q.to, "To") : current ? istDay(current.endDate) : new Date(Date.UTC(from.getUTCFullYear() + 1, 2, 31));
  const toEnd = new Date(to.getTime() + 86_400_000 - 1);
  // Payment timestamps are compared in India time.
  const fromTs = new Date(from.getTime() - IST);
  const toTs = new Date(toEnd.getTime() - IST);

  const [entries, payments, refunds, construction] = await Promise.all([
    prisma.accountEntry.findMany({
      where: { isVoid: false, entryDate: { gte: from, lte: to } },
      select: { type: true, amount: true, entryDate: true, category: { select: { id: true, name: true } } },
    }),
    prisma.payment.findMany({ where: { status: "SUCCESS", paidAt: { gte: fromTs, lte: toTs } }, select: { amount: true, paidAt: true } }),
    prisma.refund.findMany({ where: { status: "REFUND_PROCESSED", processedAt: { gte: fromTs, lte: toTs } }, select: { amount: true, processedAt: true } }),
    actor.role === "SUPER_ADMIN"
      ? prisma.constructionExpense.findMany({ where: { isVoid: false, expenseDate: { gte: from, lte: to } }, select: { amount: true, expenseDate: true } })
      : Promise.resolve([]),
  ]);

  // Every month in the range, in order.
  const months: string[] = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push(d.toISOString().slice(0, 7));
  }
  const row = () => ({ feeIncome: 0, otherIncome: 0, expense: 0, construction: 0 });
  const byMonth = new Map(months.map((m) => [m, row()]));
  const add = (key: string, field: keyof ReturnType<typeof row>, amount: number) => {
    const r = byMonth.get(key);
    if (r) r[field] += amount;
  };
  for (const p of payments as any[]) add(monthKeyIst(p.paidAt), "feeIncome", num(p.amount));
  for (const r of refunds as any[]) add(monthKeyIst(r.processedAt), "feeIncome", -num(r.amount));
  for (const e of entries as any[]) add(monthKeyDate(e.entryDate), e.type === "INCOME" ? "otherIncome" : "expense", num(e.amount));
  for (const c of construction as any[]) add(monthKeyDate(c.expenseDate), "construction", num(c.amount));

  const categories = new Map<string, { name: string; type: string; amount: number }>();
  for (const e of entries as any[]) {
    const key = `${e.type}:${e.category.id}`;
    const c = categories.get(key) ?? { name: e.category.name, type: e.type, amount: 0 };
    c.amount += num(e.amount);
    categories.set(key, c);
  }

  const monthRows = months.map((m) => {
    const r = byMonth.get(m)!;
    const income = r.feeIncome + r.otherIncome;
    const spent = r.expense + r.construction;
    return { month: m, ...r, income, spent, net: income - spent };
  });
  const sum = (f: (r: (typeof monthRows)[number]) => number) => monthRows.reduce((s, r) => s + f(r), 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    showsConstruction: actor.role === "SUPER_ADMIN",
    months: monthRows,
    totals: {
      feeIncome: sum((r) => r.feeIncome),
      otherIncome: sum((r) => r.otherIncome),
      expense: sum((r) => r.expense),
      construction: sum((r) => r.construction),
      income: sum((r) => r.income),
      spent: sum((r) => r.spent),
      net: sum((r) => r.net),
    },
    categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
  };
};
