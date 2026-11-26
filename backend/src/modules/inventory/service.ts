import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";

// Inventory — the school's stock, kept the standard way: every change is a numbered document.
//
//   Item master      what the school keeps: unit, reorder level, usually-returned or consumed
//   OPENING  OPN-    stock in hand when an item is first added
//   RECEIPT  GRN-    goods received (supplier, bill no., several items with qty × rate)
//   ISSUE    ISS-    given to a staff member or a department; each line is either consumed
//                    (chalk, paper) or to be returned (football, drill), with a return date
//   RETURN   RET-    received back against an issue slip: good → back in stock, damaged → not
//   ADJUST   ADJ-    stock check (counted ≠ book), damaged / lost / expired / found, or closing
//                    an issue line that won't come back (lost, consumed, handed over)
//
// InventoryItem.stock changes only together with a document, in one transaction, and never
// goes below zero. Documents are voided with a reason (effect reversed), never edited.

type Actor = { id: number; role: string };

export const UNITS = ["pcs", "box", "pack", "set", "pair", "ream", "dozen", "kg", "litre", "metre", "roll", "bottle"];
const PREFIX: Record<string, string> = { OPENING: "OPN-", RECEIPT: "GRN-", ISSUE: "ISS-", RETURN: "RET-", ADJUST: "ADJ-" };
// Stock adjustments: what each reason does to stock.
const ADJUST_OUT = ["DAMAGED", "LOST", "EXPIRED"] as const;
const ADJUST_IN = ["FOUND"] as const;
// Closing an issue line that won't come back (stock already left with the issue).
const CLOSE_REASONS = ["LOST", "DAMAGED", "CONSUMED", "HANDED_OVER"] as const;
export const REASON_LABEL: Record<string, string> = {
  COUNT: "Stock check",
  DAMAGED: "Damaged",
  LOST: "Lost",
  EXPIRED: "Expired",
  FOUND: "Found / extra",
  CONSUMED: "Used up (not coming back)",
  HANDED_OVER: "Handed over permanently",
};

const num = (d: unknown) => (d === null || d === undefined ? 0 : Number(d));
const round2 = (n: number) => Math.round(n * 100) / 100;
const text = (v: unknown, max = 200) => {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return t ? t.slice(0, max) : null;
};
const qty = (v: unknown, label = "Quantity") => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${label} must be more than 0`);
  if (n > 1_000_000) throw httpError(400, `${label} is too large`);
  return round2(n);
};
const rateOf = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw httpError(400, "Rate can't be negative");
  return round2(n);
};
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const day = (v: unknown, label = "Date", opts: { allowFuture?: boolean; optional?: boolean } = {}) => {
  if ((v === undefined || v === null || v === "") && opts.optional) return null;
  const s = typeof v === "string" && v ? v : istToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw httpError(400, `${label} isn't valid`);
  if (!opts.allowFuture && s > istToday()) throw httpError(400, `${label} can't be in the future`);
  return new Date(`${s}T00:00:00.000Z`);
};
const fmtQty = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;

// Next number for a kind (OPN-0001 …), inside the transaction; retried on a clash.
const nextDocNo = async (tx: any, kind: string) => {
  const prefix = PREFIX[kind];
  const rows = await tx.inventoryDoc.findMany({ where: { docNo: { startsWith: prefix } }, select: { docNo: true } });
  const max = rows.reduce((m: number, r: any) => Math.max(m, Number(r.docNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withRetry = async (fn: () => Promise<any>): Promise<any> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
};

// Changes stock, refusing to go below zero (checked in the UPDATE itself, so two people
// issuing the last box at once can't both succeed).
const applyChange = async (tx: any, item: { id: number; unit: string; name: string }, change: number) => {
  if (change === 0) return;
  if (change > 0) {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { stock: { increment: change } } });
    return;
  }
  const done = await tx.inventoryItem.updateMany({ where: { id: item.id, stock: { gte: -change } }, data: { stock: { decrement: -change } } });
  if (done.count === 0) {
    const now = await tx.inventoryItem.findUnique({ where: { id: item.id }, select: { stock: true } });
    throw httpError(400, `Only ${fmtQty(num(now?.stock), item.unit)} of ${item.name} in stock`);
  }
};

const loadItems = async (ids: number[]) => {
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: ids } } });
  const byId = new Map<number, (typeof items)[number]>(items.map((i) => [i.id, i]));
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) throw httpError(400, "One of the items wasn't found");
    if (!it.isActive) throw httpError(400, `${it.name} is marked "no longer used". Turn it back on first.`);
  }
  return byId;
};

// Lines from the form: [{ itemId, quantity, rate?, toReturn?, remark? }], no item twice.
const parseLines = (raw: unknown) => {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, "Add at least one item");
  if (raw.length > 50) throw httpError(400, "At most 50 items on one document");
  const seen = new Set<number>();
  return raw.map((l: any) => {
    const itemId = Number(l?.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) throw httpError(400, "Choose an item on every line");
    if (seen.has(itemId)) throw httpError(400, "The same item is on two lines — put the total on one line");
    seen.add(itemId);
    return { itemId, quantity: qty(l.quantity), rate: rateOf(l.rate), toReturn: l.toReturn === true, remark: text(l.remark, 120) };
  });
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories = () =>
  prisma.inventoryCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: { where: { isActive: true } } } } } });

export const saveCategory = async (actorId: number, id: number | null, body: { name?: unknown; isActive?: unknown }) => {
  const name = text(body.name, 60);
  if (!name) throw httpError(400, "Category name is required");
  const clash = await prisma.inventoryCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } });
  if (clash) throw httpError(409, `There's already a category called "${clash.name}"`);
  const data = { name, ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}) };
  const row = id ? await prisma.inventoryCategory.update({ where: { id }, data }) : await prisma.inventoryCategory.create({ data });
  await createAuditLog({ action: id ? "UPDATE" : "CREATE", entityType: "InventoryCategory", entityId: row.id, userId: actorId, newValues: data });
  return row;
};

// ---------------------------------------------------------------------------
// Issue lines still out (to be returned and not yet settled)
// ---------------------------------------------------------------------------

// For every "to be returned" issue line: issued, returned good/damaged, closed, still out.
const issueLineBalances = async (where: any = {}) => {
  const lines = await prisma.inventoryDocLine.findMany({
    where: { toReturn: true, doc: { kind: "ISSUE", isVoid: false, ...where } },
    include: {
      item: { select: { id: true, name: true, unit: true } },
      doc: { select: { id: true, docNo: true, docDate: true, expectedReturnOn: true, staffId: true, department: true, purpose: true, staff: { select: { user: { select: { name: true } } } } } },
      settlements: { where: { doc: { isVoid: false } }, select: { quantity: true, condition: true, doc: { select: { kind: true } } } },
    },
  });
  return lines.map((l) => {
    let good = 0;
    let damaged = 0;
    let closed = 0;
    for (const s of l.settlements) {
      if (s.doc.kind === "RETURN") {
        if (s.condition === "DAMAGED") damaged += num(s.quantity);
        else good += num(s.quantity);
      } else closed += num(s.quantity);
    }
    const out = round2(num(l.quantity) - good - damaged - closed);
    return {
      lineId: l.id,
      issueId: l.doc.id,
      issueNo: l.doc.docNo,
      issuedOn: l.doc.docDate,
      expectedReturnOn: l.doc.expectedReturnOn,
      holder: l.doc.staff?.user.name ?? l.doc.department ?? "—",
      staffId: l.doc.staffId,
      purpose: l.doc.purpose,
      itemId: l.item.id,
      item: l.item.name,
      unit: l.item.unit,
      remark: l.remark,
      issued: num(l.quantity),
      returnedGood: round2(good),
      returnedDamaged: round2(damaged),
      closed: round2(closed),
      out,
    };
  });
};

type LineBalance = Awaited<ReturnType<typeof issueLineBalances>>[number];

const isOverdue = (expected: Date | null) => !!expected && expected.toISOString().slice(0, 10) < istToday();

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const lastRates = async (itemIds: number[]) => {
  const map = new Map<number, number>();
  if (!itemIds.length) return map;
  const rows = await prisma.inventoryDocLine.findMany({
    where: { itemId: { in: itemIds }, rate: { not: null }, doc: { kind: { in: ["RECEIPT", "OPENING"] }, isVoid: false } },
    orderBy: [{ doc: { docDate: "desc" } }, { id: "desc" }],
    select: { itemId: true, rate: true },
  });
  for (const r of rows) if (!map.has(r.itemId)) map.set(r.itemId, num(r.rate));
  return map;
};

export const listItems = async (q: { q?: unknown; categoryId?: unknown; low?: unknown; includeInactive?: unknown }) => {
  const search = text(q.q, 60);
  const items = await prisma.inventoryItem.findMany({
    where: {
      ...(q.includeInactive === "true" ? {} : { isActive: true }),
      ...(Number(q.categoryId) > 0 ? { categoryId: Number(q.categoryId) } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { location: { contains: search, mode: "insensitive" } }] } : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });
  const ids = items.map((i) => i.id);
  const [balances, rates] = await Promise.all([issueLineBalances(), lastRates(ids)]);
  const out = new Map<number, number>();
  for (const b of balances) if (b.out > 0) out.set(b.itemId, round2((out.get(b.itemId) ?? 0) + b.out));
  const rows = items.map((i) => {
    const stock = num(i.stock);
    const reorderLevel = num(i.minStock);
    const rate = rates.get(i.id);
    const issuedOut = out.get(i.id) ?? 0;
    return {
      id: i.id,
      name: i.name,
      categoryId: i.categoryId,
      category: i.category?.name ?? null,
      unit: i.unit,
      returnable: i.returnable,
      reorderLevel,
      stock,
      issuedOut,
      total: round2(stock + issuedOut),
      needsReorder: reorderLevel > 0 && stock <= reorderLevel,
      location: i.location,
      notes: i.notes,
      isActive: i.isActive,
      lastRate: rate ?? null,
      stockValue: rate !== undefined ? round2(stock * rate) : null,
    };
  });
  return q.low === "true" ? rows.filter((r) => r.needsReorder) : rows;
};

const itemFields = async (body: Record<string, unknown>, id: number | null) => {
  const name = text(body.name, 100);
  if (!name) throw httpError(400, "Item name is required");
  const clash = await prisma.inventoryItem.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } });
  if (clash) throw httpError(409, `"${clash.name}" is already in the list${clash.isActive ? "" : " (marked no longer used — turn it back on instead)"}`);
  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || !(await prisma.inventoryCategory.findUnique({ where: { id: categoryId } }))) throw httpError(400, "Choose a category");
  const reorder = body.reorderLevel === undefined || body.reorderLevel === "" || body.reorderLevel === null ? 0 : Number(body.reorderLevel);
  if (!Number.isFinite(reorder) || reorder < 0) throw httpError(400, "Reorder level can't be negative");
  return {
    name,
    categoryId,
    unit: text(body.unit, 20) ?? "pcs",
    returnable: body.returnable === true,
    minStock: round2(reorder),
    location: text(body.location, 100),
    notes: text(body.notes, 500),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
  };
};

export const createItem = async (actor: Actor, body: Record<string, unknown>) => {
  const data = await itemFields(body, null);
  const opening = body.openingStock === undefined || body.openingStock === "" || Number(body.openingStock) === 0 ? 0 : qty(body.openingStock, "Opening stock");
  const rate = rateOf(body.rate);
  const item = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({ data: { ...data, stock: opening } });
      if (opening > 0) {
        await tx.inventoryDoc.create({
          data: {
            docNo: await nextDocNo(tx, "OPENING"),
            kind: "OPENING",
            docDate: day(undefined),
            note: "Opening stock",
            createdByUserId: actor.id,
            lines: { create: [{ itemId: created.id, quantity: opening, change: opening, rate }] },
          },
        });
      }
      return created;
    })
  );
  await createAuditLog({ action: "CREATE", entityType: "InventoryItem", entityId: item.id, userId: actor.id, newValues: { ...data, openingStock: opening } });
  return item;
};

export const updateItem = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const before = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!before) throw httpError(404, "Item not found");
  const data = await itemFields({ ...before, reorderLevel: num(before.minStock), ...body }, id);
  const item = await prisma.inventoryItem.update({ where: { id }, data });
  await createAuditLog({ action: "UPDATE", entityType: "InventoryItem", entityId: id, userId: actor.id, oldValues: { ...before, stock: num(before.stock), minStock: num(before.minStock) }, newValues: data });
  return item;
};

// Stock ledger: every in and out of one item with the document, and the running balance.
export const itemLedger = async (itemId: number, q: { from?: unknown; to?: unknown }) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { category: { select: { name: true } } } });
  if (!item) throw httpError(404, "Item not found");
  const from = typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? new Date(`${q.from}T00:00:00.000Z`) : null;
  const to = typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? new Date(`${q.to}T00:00:00.000Z`) : null;
  const lines = await prisma.inventoryDocLine.findMany({
    where: { itemId, doc: { isVoid: false, ...(to ? { docDate: { lte: to } } : {}) } },
    include: { doc: { select: { id: true, docNo: true, kind: true, docDate: true, supplier: true, department: true, reason: true, note: true, staff: { select: { user: { select: { name: true } } } } } } },
    orderBy: [{ doc: { docDate: "asc" } }, { docId: "asc" }, { id: "asc" }],
  });
  let balance = 0;
  let opening = 0;
  const rows: any[] = [];
  for (const l of lines) {
    const ch = num(l.change);
    if (from && l.doc.docDate < from) {
      opening = round2(opening + ch);
      balance = opening;
      continue;
    }
    balance = round2(balance + ch);
    rows.push({
      lineId: l.id,
      docId: l.doc.id,
      docNo: l.doc.docNo,
      kind: l.doc.kind,
      date: l.doc.docDate,
      particulars:
        l.doc.kind === "ADJUST"
          ? `${REASON_LABEL[l.doc.reason ?? ""] ?? "Adjustment"}${l.issueLineId ? " (issued item closed — no stock change)" : ""}`
          : l.doc.kind === "RETURN" && l.condition === "DAMAGED"
            ? "Returned damaged (not back in stock)"
            : null,
      party: l.doc.supplier ?? l.doc.staff?.user.name ?? l.doc.department ?? null,
      inQty: ch > 0 ? ch : 0,
      outQty: ch < 0 ? -ch : 0,
      rate: l.rate === null ? null : num(l.rate),
      balance,
      remark: l.remark ?? l.doc.note,
    });
  }
  return { item: { id: item.id, name: item.name, unit: item.unit, category: item.category?.name ?? null, stock: num(item.stock) }, opening: from ? opening : null, rows };
};

// ---------------------------------------------------------------------------
// Documents: list and view
// ---------------------------------------------------------------------------

const docInclude = {
  staff: { select: { id: true, employeeCode: true, user: { select: { name: true } } } },
  createdBy: { select: { name: true } },
  issue: { select: { id: true, docNo: true } },
  lines: { include: { item: { select: { id: true, name: true, unit: true } } }, orderBy: { id: "asc" as const } },
};

const docView = (d: any) => ({
  id: d.id,
  docNo: d.docNo,
  kind: d.kind,
  docDate: d.docDate,
  supplier: d.supplier,
  billNo: d.billNo,
  staffId: d.staffId,
  staffName: d.staff?.user.name ?? null,
  staffCode: d.staff?.employeeCode ?? null,
  department: d.department,
  issuedTo: d.staff?.user.name ?? d.department ?? null,
  purpose: d.purpose,
  expectedReturnOn: d.expectedReturnOn,
  issueNo: d.issue?.docNo ?? null,
  issueId: d.issue?.id ?? null,
  reason: d.reason,
  reasonLabel: d.reason ? REASON_LABEL[d.reason] ?? d.reason : null,
  note: d.note,
  isVoid: d.isVoid,
  voidReason: d.voidReason,
  createdBy: d.createdBy?.name ?? null,
  createdAt: d.createdAt,
  lines: d.lines.map((l: any) => ({
    id: l.id,
    itemId: l.itemId,
    item: l.item.name,
    unit: l.item.unit,
    quantity: num(l.quantity),
    change: num(l.change),
    rate: l.rate === null ? null : num(l.rate),
    amount: l.rate === null ? null : round2(num(l.rate) * num(l.quantity)),
    toReturn: l.toReturn,
    condition: l.condition,
    remark: l.remark,
  })),
});

// Issue status from its "to be returned" lines.
const issueStatus = (lines: Array<{ issued: number; out: number }>, expected: Date | null) => {
  if (!lines.length) return "CONSUMED";
  const out = lines.reduce((s, l) => s + l.out, 0);
  const issued = lines.reduce((s, l) => s + l.issued, 0);
  if (out <= 0) return "SETTLED";
  if (isOverdue(expected)) return "OVERDUE";
  return out < issued ? "PART_RETURNED" : "OUT";
};

export const listDocs = async (q: { kind?: unknown; from?: unknown; to?: unknown; status?: unknown; staffId?: unknown; q?: unknown; includeVoid?: unknown }) => {
  const kind = typeof q.kind === "string" && PREFIX[q.kind] ? q.kind : null;
  const where: any = {};
  if (kind) where.kind = kind;
  if (q.includeVoid !== "true") where.isVoid = false;
  const range: any = {};
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) range.gte = new Date(`${q.from}T00:00:00.000Z`);
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) range.lte = new Date(`${q.to}T00:00:00.000Z`);
  if (Object.keys(range).length) where.docDate = range;
  if (Number(q.staffId) > 0) where.staffId = Number(q.staffId);
  const search = text(q.q, 60);
  if (search) {
    where.OR = [
      { docNo: { contains: search, mode: "insensitive" } },
      { supplier: { contains: search, mode: "insensitive" } },
      { billNo: { contains: search, mode: "insensitive" } },
      { department: { contains: search, mode: "insensitive" } },
      { staff: { user: { name: { contains: search, mode: "insensitive" } } } },
      { lines: { some: { item: { name: { contains: search, mode: "insensitive" } } } } },
    ];
  }
  const docs = await prisma.inventoryDoc.findMany({ where, include: docInclude, orderBy: [{ docDate: "desc" }, { id: "desc" }], take: 300 });
  const views = docs.map(docView);
  if (kind !== "ISSUE") return views;

  const balances = await issueLineBalances({ id: { in: docs.map((d) => d.id) } });
  const byIssue = new Map<number, typeof balances>();
  for (const b of balances) byIssue.set(b.issueId, [...(byIssue.get(b.issueId) ?? []), b]);
  const withStatus = views.map((v) => {
    const lines = byIssue.get(v.id) ?? [];
    return { ...v, status: v.isVoid ? "VOID" : issueStatus(lines, v.expectedReturnOn), outQty: round2(lines.reduce((s, l) => s + l.out, 0)) };
  });
  const status = typeof q.status === "string" ? q.status : "";
  if (status === "PENDING") return withStatus.filter((d) => ["OUT", "PART_RETURNED", "OVERDUE"].includes(d.status));
  if (status) return withStatus.filter((d) => d.status === status);
  return withStatus;
};

export const getDoc = async (id: number) => {
  const d = await prisma.inventoryDoc.findUnique({ where: { id }, include: docInclude });
  if (!d) throw httpError(404, "Document not found");
  const view: any = docView(d);
  if (d.kind === "ISSUE") {
    const balances = await issueLineBalances({ id });
    const byLine = new Map<number, LineBalance>(balances.map((b) => [b.lineId, b]));
    view.lines = view.lines.map((l: any) => ({ ...l, balance: byLine.get(l.id) ?? null }));
    view.status = d.isVoid ? "VOID" : issueStatus(balances, d.expectedReturnOn);
    // Returns and closings made against this slip.
    const settlements = await prisma.inventoryDoc.findMany({ where: { issueId: id }, include: docInclude, orderBy: { id: "asc" } });
    view.settlements = settlements.map(docView);
  }
  return view;
};

// ---------------------------------------------------------------------------
// Creating documents
// ---------------------------------------------------------------------------

export const createReceipt = async (actor: Actor, body: Record<string, unknown>) => {
  const lines = parseLines(body.lines);
  const items = await loadItems(lines.map((l) => l.itemId));
  const supplier = text(body.supplier, 100);
  if (!supplier) throw httpError(400, "Who supplied it? (supplier / donor name)");
  const doc = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      for (const l of lines) await applyChange(tx, items.get(l.itemId)!, l.quantity);
      return tx.inventoryDoc.create({
        data: {
          docNo: await nextDocNo(tx, "RECEIPT"),
          kind: "RECEIPT",
          docDate: day(body.docDate),
          supplier,
          billNo: text(body.billNo, 40),
          note: text(body.note, 300),
          createdByUserId: actor.id,
          lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, change: l.quantity, rate: l.rate, remark: l.remark })) },
        },
      });
    })
  );
  await createAuditLog({ action: "STOCK_RECEIPT", entityType: "InventoryDoc", entityId: doc.id, userId: actor.id, newValues: { docNo: doc.docNo, lines } });
  return getDoc(doc.id);
};

export const createIssue = async (actor: Actor, body: Record<string, unknown>) => {
  const lines = parseLines(body.lines);
  const items = await loadItems(lines.map((l) => l.itemId));
  const staffId = Number(body.staffId) > 0 ? Number(body.staffId) : null;
  const department = staffId ? null : text(body.department, 100);
  if (!staffId && !department) throw httpError(400, "Issued to whom? Choose a staff member, or type a department / room");
  if (staffId && !(await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } }))) throw httpError(400, "Staff member not found");
  const docDate = day(body.docDate)!;
  const anyReturn = lines.some((l) => l.toReturn);
  const expectedReturnOn = anyReturn ? day(body.expectedReturnOn, "Return date", { allowFuture: true, optional: true }) : null;
  if (expectedReturnOn && expectedReturnOn < docDate) throw httpError(400, "The return date is before the issue date");
  const doc = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      for (const l of lines) await applyChange(tx, items.get(l.itemId)!, -l.quantity);
      return tx.inventoryDoc.create({
        data: {
          docNo: await nextDocNo(tx, "ISSUE"),
          kind: "ISSUE",
          docDate,
          staffId,
          department,
          purpose: text(body.purpose, 200),
          expectedReturnOn,
          note: text(body.note, 300),
          createdByUserId: actor.id,
          lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, change: -l.quantity, toReturn: l.toReturn, remark: l.remark })) },
        },
      });
    })
  );
  await createAuditLog({ action: "STOCK_ISSUE", entityType: "InventoryDoc", entityId: doc.id, userId: actor.id, newValues: { docNo: doc.docNo, staffId, department, lines } });
  return getDoc(doc.id);
};

const openBalances = async (issueId: number) => {
  const issue = await prisma.inventoryDoc.findUnique({ where: { id: issueId } });
  if (!issue || issue.kind !== "ISSUE") throw httpError(404, "Issue slip not found");
  if (issue.isVoid) throw httpError(400, "This issue slip is void");
  return { issue, balances: new Map<number, LineBalance>((await issueLineBalances({ id: issueId })).map((b) => [b.lineId, b])) };
};

// Same balances, read inside a transaction (so two people can't settle the same item twice).
const outstandingTx = async (tx: any, issueId: number) => {
  const lines = await tx.inventoryDocLine.findMany({
    where: { toReturn: true, docId: issueId },
    include: { settlements: { where: { doc: { isVoid: false } }, select: { quantity: true } } },
  });
  return new Map<number, number>(lines.map((l: any) => [l.id, round2(num(l.quantity) - l.settlements.reduce((s: number, x: any) => s + num(x.quantity), 0))]));
};

// Receive back against an issue slip: [{ lineId, good, damaged }].
export const receiveBack = async (actor: Actor, issueId: number, body: Record<string, unknown>) => {
  const raw = Array.isArray(body.lines) ? body.lines : [];
  const docDate = day(body.docDate)!;
  const { issue, balances } = await openBalances(issueId);
  if (docDate < issue.docDate) throw httpError(400, "The return date is before the issue date");
  const lines: Array<{ lineId: number; itemId: number; quantity: number; condition: "GOOD" | "DAMAGED" }> = [];
  for (const r of raw as any[]) {
    const b = balances.get(Number(r?.lineId));
    if (!b) throw httpError(400, "That item isn't on this issue slip as 'to be returned'");
    const good = r.good === "" || r.good === undefined || r.good === null ? 0 : Number(r.good);
    const damaged = r.damaged === "" || r.damaged === undefined || r.damaged === null ? 0 : Number(r.damaged);
    if (!Number.isFinite(good) || !Number.isFinite(damaged) || good < 0 || damaged < 0) throw httpError(400, "Quantities can't be negative");
    if (good + damaged === 0) continue;
    if (round2(good + damaged) > b.out) throw httpError(400, `Only ${fmtQty(b.out, b.unit)} of ${b.item} is still out on this slip`);
    if (good > 0) lines.push({ lineId: b.lineId, itemId: b.itemId, quantity: round2(good), condition: "GOOD" });
    if (damaged > 0) lines.push({ lineId: b.lineId, itemId: b.itemId, quantity: round2(damaged), condition: "DAMAGED" });
  }
  if (!lines.length) throw httpError(400, "Enter how many came back");
  const found = await prisma.inventoryItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
  const items = new Map<number, (typeof found)[number]>(found.map((i) => [i.id, i]));
  const doc = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const fresh = await outstandingTx(tx, issueId);
      const wanted = new Map<number, number>();
      for (const l of lines) wanted.set(l.lineId, round2((wanted.get(l.lineId) ?? 0) + l.quantity));
      for (const [lineId, q] of wanted) if ((fresh.get(lineId) ?? 0) < q) throw httpError(409, "Someone just recorded a return on this slip. Reload and try again.");
      for (const l of lines) if (l.condition === "GOOD") await applyChange(tx, items.get(l.itemId)!, l.quantity);
      return tx.inventoryDoc.create({
        data: {
          docNo: await nextDocNo(tx, "RETURN"),
          kind: "RETURN",
          docDate,
          issueId,
          staffId: issue.staffId,
          department: issue.department,
          note: text(body.note, 300),
          createdByUserId: actor.id,
          lines: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, change: l.condition === "GOOD" ? l.quantity : 0, issueLineId: l.lineId, condition: l.condition })) },
        },
      });
    })
  );
  await createAuditLog({ action: "STOCK_RETURN", entityType: "InventoryDoc", entityId: doc.id, userId: actor.id, newValues: { docNo: doc.docNo, issueId, lines } });
  return getDoc(issueId);
};

// An issued item that won't come back: lost, damaged beyond use, used up, handed over.
// Stock already left with the issue, so this changes nothing in stock — it closes the line.
export const closeIssueLine = async (actor: Actor, issueId: number, body: Record<string, unknown>) => {
  const { issue, balances } = await openBalances(issueId);
  const b = balances.get(Number(body.lineId));
  if (!b) throw httpError(400, "That item isn't on this issue slip as 'to be returned'");
  if (b.out <= 0) throw httpError(400, "Nothing is still out for this item");
  const reason = String(body.reason ?? "");
  if (!CLOSE_REASONS.includes(reason as any)) throw httpError(400, "Choose why it isn't coming back");
  const quantity = body.quantity === undefined || body.quantity === "" || body.quantity === null ? b.out : qty(body.quantity);
  if (quantity > b.out) throw httpError(400, `Only ${fmtQty(b.out, b.unit)} of ${b.item} is still out on this slip`);
  const note = text(body.note, 300);
  if ((reason === "LOST" || reason === "DAMAGED") && !note) throw httpError(400, "Add a short note (what happened)");
  const doc = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const fresh = await outstandingTx(tx, issueId);
      if ((fresh.get(b.lineId) ?? 0) < quantity) throw httpError(409, "Someone just recorded a return on this slip. Reload and try again.");
      return tx.inventoryDoc.create({
        data: {
          docNo: await nextDocNo(tx, "ADJUST"),
          kind: "ADJUST",
          docDate: day(body.docDate),
          reason,
          issueId,
          staffId: issue.staffId,
          department: issue.department,
          note,
          createdByUserId: actor.id,
          lines: { create: [{ itemId: b.itemId, quantity, change: 0, issueLineId: b.lineId }] },
        },
      });
    })
  );
  await createAuditLog({ action: "STOCK_ISSUE_CLOSED", entityType: "InventoryDoc", entityId: doc.id, userId: actor.id, newValues: { docNo: doc.docNo, issueId, lineId: b.lineId, quantity, reason } });
  return getDoc(issueId);
};

// Stock check (counted quantity) or damaged / lost / expired / found, for one or more items.
export const createAdjustment = async (actor: Actor, body: Record<string, unknown>) => {
  const reason = String(body.reason ?? "");
  const isCount = reason === "COUNT";
  if (!isCount && ![...ADJUST_OUT, ...ADJUST_IN].includes(reason as any)) throw httpError(400, "Choose the reason: stock check, damaged, lost, expired or found");
  const note = text(body.note, 300);
  if (!note) throw httpError(400, "Add a note (e.g. Annual stock check, broken in lab)");
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (!raw.length) throw httpError(400, "Add at least one item");
  const ids = raw.map((l: any) => Number(l?.itemId));
  if (ids.some((i) => !Number.isInteger(i) || i <= 0)) throw httpError(400, "Choose an item on every line");
  if (new Set(ids).size !== ids.length) throw httpError(400, "The same item is on two lines");
  const items = await loadItems(ids);
  const lines = (raw as any[]).map((l) => {
    const item = items.get(Number(l.itemId))!;
    if (isCount) {
      const counted = Number(l.counted);
      if (l.counted === "" || l.counted === undefined || l.counted === null || !Number.isFinite(counted) || counted < 0) throw httpError(400, `Enter the counted quantity for ${item.name}`);
      const change = round2(counted - num(item.stock));
      return { itemId: item.id, quantity: Math.abs(change), change, remark: `Counted ${fmtQty(counted, item.unit)}, book showed ${fmtQty(num(item.stock), item.unit)}` };
    }
    const q = qty(l.quantity);
    return { itemId: item.id, quantity: q, change: ADJUST_IN.includes(reason as any) ? q : -q, remark: text(l.remark, 120) };
  });
  const effective = lines.filter((l) => l.change !== 0);
  if (!effective.length) throw httpError(400, "The counted stock matches the book for every item — nothing to adjust");
  const doc = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      for (const l of effective) await applyChange(tx, items.get(l.itemId)!, l.change);
      return tx.inventoryDoc.create({
        data: {
          docNo: await nextDocNo(tx, "ADJUST"),
          kind: "ADJUST",
          docDate: day(body.docDate),
          reason,
          note,
          createdByUserId: actor.id,
          lines: { create: effective.map((l) => ({ itemId: l.itemId, quantity: l.quantity, change: l.change, remark: l.remark })) },
        },
      });
    })
  );
  await createAuditLog({ action: "STOCK_ADJUST", entityType: "InventoryDoc", entityId: doc.id, userId: actor.id, newValues: { docNo: doc.docNo, reason, lines: effective } });
  return getDoc(doc.id);
};

// Void: reverse a document's effect. Refused if stock would go below zero, or (for an issue)
// once anything has been returned or closed against it — void those first.
export const voidDoc = async (actor: Actor, id: number, reason: unknown) => {
  const why = text(reason, 300);
  if (!why || why.length < 3) throw httpError(400, "Say why this document is being voided");
  const d = await prisma.inventoryDoc.findUnique({ where: { id }, include: { lines: { include: { item: true } } } });
  if (!d) throw httpError(404, "Document not found");
  if (d.isVoid) throw httpError(400, "Already void");
  await prisma.$transaction(async (tx) => {
    if (d.kind === "ISSUE") {
      const settled = await tx.inventoryDoc.count({ where: { issueId: id, isVoid: false } });
      if (settled) throw httpError(400, "Items on this slip have been returned or closed. Void those documents first.");
    }
    for (const l of d.lines) {
      try {
        await applyChange(tx, l.item, -num(l.change));
      } catch (e: any) {
        if (e?.statusCode === 400) throw httpError(400, `Can't void ${d.docNo}: ${l.item.name} has since been issued or used, so stock would go below zero. Do a stock check instead.`);
        throw e;
      }
    }
    await tx.inventoryDoc.update({ where: { id }, data: { isVoid: true, voidReason: why, voidedAt: new Date(), voidedByUserId: actor.id } });
  });
  await createAuditLog({ action: "VOID", entityType: "InventoryDoc", entityId: id, userId: actor.id, oldValues: { docNo: d.docNo }, newValues: { voidReason: why } });
  return getDoc(id);
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// Everything still out on issue slips, overdue first, then oldest.
export const pendingReturns = async (q: { staffId?: unknown } = {}) => {
  const rows = (await issueLineBalances(Number(q.staffId) > 0 ? { staffId: Number(q.staffId) } : {})).filter((r) => r.out > 0);
  return rows
    .map((r) => ({ ...r, overdue: isOverdue(r.expectedReturnOn), daysOut: Math.max(0, Math.floor((Date.now() - r.issuedOn.getTime()) / 86400_000)) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.issuedOn.getTime() - b.issuedOn.getTime());
};

// Staff to issue to (the Accountant can't open the Staff page, so the list comes from here).
export const listIssuableStaff = async () => {
  const staff = await prisma.staff.findMany({
    where: { isActive: true }, // employed (drivers and guards have no login but still get items)
    select: { id: true, employeeCode: true, staffCategory: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return staff.map((s) => ({ id: s.id, name: s.user.name, employeeCode: s.employeeCode, staffCategory: s.staffCategory }));
};

// Suppliers typed before (for the receipt form's suggestions).
export const listSuppliers = async () => {
  const rows = await prisma.inventoryDoc.findMany({ where: { kind: "RECEIPT", supplier: { not: null } }, distinct: ["supplier"], select: { supplier: true }, orderBy: { supplier: "asc" }, take: 200 });
  return rows.map((r) => r.supplier!);
};

const KIND_LABEL: Record<string, string> = { OPENING: "Opening stock", RECEIPT: "Goods receipt", ISSUE: "Issue", RETURN: "Return", ADJUST: "Adjustment" };

// Excel: stock register, every document line in the range, pending returns.
export const stockRegisterSheets = async (from: unknown, to: unknown) => {
  const [items, docs, pending] = await Promise.all([listItems({}), listDocs({ from, to, includeVoid: "true" }), pendingReturns()]);
  const range = [from, to].filter((v) => typeof v === "string" && v).join(" to ");
  return [
    {
      name: "Stock register",
      columns: [
        { header: "Item", key: "name", width: 32 },
        { header: "Category", key: "category", width: 20 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "In store", key: "stock", type: "number" as const, width: 10 },
        { header: "Issued out (to return)", key: "issuedOut", type: "number" as const, width: 14 },
        { header: "Total owned", key: "total", type: "number" as const, width: 11 },
        { header: "Reorder level", key: "reorderLevel", type: "number" as const, width: 12 },
        { header: "Reorder?", key: "needsReorder", width: 9 },
        { header: "Location", key: "location", width: 20 },
        { header: "Last rate", key: "lastRate", type: "money" as const, width: 11 },
        { header: "Value in store", key: "stockValue", type: "money" as const, width: 13 },
      ],
      rows: items,
    },
    {
      name: "Documents",
      note: range ? `Documents ${range}` : undefined,
      columns: [
        { header: "Date", key: "docDate", type: "date" as const, width: 12 },
        { header: "Document no.", key: "docNo", width: 12 },
        { header: "Type", key: "kindLabel", width: 14 },
        { header: "Item", key: "item", width: 28 },
        { header: "Qty", key: "quantity", type: "number" as const, width: 8 },
        { header: "Unit", key: "unit", width: 7 },
        { header: "Stock effect", key: "change", type: "number" as const, width: 11 },
        { header: "Supplier / issued to", key: "party", width: 24 },
        { header: "Bill no.", key: "billNo", width: 12 },
        { header: "Rate", key: "rate", type: "money" as const, width: 10 },
        { header: "Reason / note", key: "noteText", width: 30 },
        { header: "Entered by", key: "createdBy", width: 18 },
        { header: "Void", key: "voided", width: 26 },
      ],
      rows: docs.flatMap((d: any) =>
        d.lines.map((l: any) => ({
          ...l,
          docDate: d.docDate,
          docNo: d.docNo,
          kindLabel: KIND_LABEL[d.kind] ?? d.kind,
          party: d.supplier ?? d.issuedTo,
          billNo: d.billNo,
          noteText: [d.reasonLabel, l.condition === "DAMAGED" ? "returned damaged" : null, l.remark, d.note].filter(Boolean).join(" · "),
          createdBy: d.createdBy,
          voided: d.isVoid ? `Void: ${d.voidReason ?? ""}` : "",
        }))
      ),
    },
    {
      name: "Pending returns",
      columns: [
        { header: "Issue no.", key: "issueNo", width: 11 },
        { header: "Issued on", key: "issuedOn", type: "date" as const, width: 12 },
        { header: "Due back", key: "expectedReturnOn", type: "date" as const, width: 12 },
        { header: "Overdue", key: "overdue", width: 8 },
        { header: "With", key: "holder", width: 24 },
        { header: "Item", key: "item", width: 28 },
        { header: "Still out", key: "out", type: "number" as const, width: 9 },
        { header: "Unit", key: "unit", width: 7 },
        { header: "Remark", key: "remark", width: 22 },
      ],
      rows: pending,
    },
  ];
};
