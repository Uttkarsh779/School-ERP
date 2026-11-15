import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";

// Inventory: the school's own stock (stationery, furniture, sports, lab, cleaning …).
//  - Every change to stock is a movement: IN (received / bought), ISSUE (to a staff member or a
//    room/class), RETURN (back from them), ADJUST (stock count correction) or WRITE_OFF
//    (damaged, lost, expired). InventoryItem.stock is changed only together with a movement,
//    in one transaction, and can never go below zero.
//  - Returnable items (tools, sports kit, lab equipment) are tracked while someone holds them
//    ("With staff"). Consumables are simply used up.
//  - Mistakes are voided with a reason (stock reversed), never edited or deleted.

export const MOVEMENT_TYPES = ["IN", "ISSUE", "RETURN", "ADJUST", "WRITE_OFF"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const UNITS = ["pcs", "box", "pack", "set", "pair", "ream", "dozen", "kg", "litre", "metre", "roll", "bottle"];

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
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const day = (v: unknown) => {
  const s = typeof v === "string" && v ? v : istToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw httpError(400, "Date isn't valid");
  if (s > istToday()) throw httpError(400, "Date can't be in the future");
  return new Date(`${s}T00:00:00.000Z`);
};
const fmtQty = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;

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
// Items
// ---------------------------------------------------------------------------

// Quantity each holder still has, for returnable items: issued − returned (void ones ignored).
// Holder = a staff member, or the room/class typed in "Issued to".
const holderKey = (m: { staffId: number | null; issuedTo: string | null }) => (m.staffId ? `s${m.staffId}` : `t${(m.issuedTo ?? "").toLowerCase()}`);

const outstandingRows = async (itemIds?: number[]) => {
  const moves = await prisma.inventoryMovement.findMany({
    where: { isVoid: false, type: { in: ["ISSUE", "RETURN"] }, item: { returnable: true }, ...(itemIds ? { itemId: { in: itemIds } } : {}) },
    select: { itemId: true, type: true, quantity: true, staffId: true, issuedTo: true, movedOn: true, staff: { select: { user: { select: { name: true } } } } },
    orderBy: { movedOn: "asc" },
  });
  const map = new Map<string, { itemId: number; staffId: number | null; holder: string; quantity: number; since: Date }>();
  for (const m of moves) {
    const key = `${m.itemId}:${holderKey(m)}`;
    const row = map.get(key) ?? { itemId: m.itemId, staffId: m.staffId, holder: m.staff?.user.name ?? m.issuedTo ?? "—", quantity: 0, since: m.movedOn };
    if (row.quantity <= 0 && m.type === "ISSUE") row.since = m.movedOn; // a fresh issue after everything came back
    row.quantity = round2(row.quantity + (m.type === "ISSUE" ? num(m.quantity) : -num(m.quantity)));
    map.set(key, row);
  }
  return [...map.values()].filter((r) => r.quantity > 0);
};

const lastCosts = async (itemIds: number[]) => {
  if (!itemIds.length) return new Map<number, number>();
  const rows = await prisma.inventoryMovement.findMany({
    where: { itemId: { in: itemIds }, type: "IN", isVoid: false, unitCost: { not: null } },
    orderBy: [{ movedOn: "desc" }, { id: "desc" }],
    distinct: ["itemId"],
    select: { itemId: true, unitCost: true },
  });
  return new Map<number, number>(rows.map((r) => [r.itemId, num(r.unitCost)]));
};

const itemView = (i: any, withStaff: number, lastCost: number | undefined) => {
  const stock = num(i.stock);
  const minStock = num(i.minStock);
  return {
    id: i.id,
    name: i.name,
    categoryId: i.categoryId,
    category: i.category?.name ?? null,
    unit: i.unit,
    returnable: i.returnable,
    minStock,
    stock,
    withStaff,
    isLow: minStock > 0 && stock <= minStock,
    location: i.location,
    notes: i.notes,
    isActive: i.isActive,
    lastUnitCost: lastCost ?? null,
    stockValue: lastCost !== undefined ? round2(stock * lastCost) : null,
  };
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
  const [out, costs] = await Promise.all([outstandingRows(ids), lastCosts(ids)]);
  const held = new Map<number, number>();
  for (const r of out) held.set(r.itemId, round2((held.get(r.itemId) ?? 0) + r.quantity));
  const rows = items.map((i) => itemView(i, held.get(i.id) ?? 0, costs.get(i.id)));
  return q.low === "true" ? rows.filter((r) => r.isLow) : rows;
};

const itemFields = async (body: Record<string, unknown>, id: number | null) => {
  const name = text(body.name, 100);
  if (!name) throw httpError(400, "Item name is required");
  const clash = await prisma.inventoryItem.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } });
  if (clash) throw httpError(409, `"${clash.name}" is already in the list${clash.isActive ? "" : " (switched off — turn it back on instead)"}`);
  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || !(await prisma.inventoryCategory.findUnique({ where: { id: categoryId } }))) throw httpError(400, "Choose a category");
  const unit = text(body.unit, 20) ?? "pcs";
  const minStock = body.minStock === undefined || body.minStock === "" ? 0 : Number(body.minStock);
  if (!Number.isFinite(minStock) || minStock < 0) throw httpError(400, "Low-stock level can't be negative");
  return {
    name,
    categoryId,
    unit,
    returnable: body.returnable === true,
    minStock: round2(minStock),
    location: text(body.location, 100),
    notes: text(body.notes, 500),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
  };
};

export const createItem = async (actorId: number, body: Record<string, unknown>) => {
  const data = await itemFields(body, null);
  const opening = body.openingStock === undefined || body.openingStock === "" || Number(body.openingStock) === 0 ? 0 : qty(body.openingStock, "Opening stock");
  const unitCost = body.unitCost === undefined || body.unitCost === "" ? null : Number(body.unitCost);
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) throw httpError(400, "Cost per unit can't be negative");
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({ data: { ...data, stock: opening } });
    if (opening > 0) {
      await tx.inventoryMovement.create({
        data: { itemId: created.id, type: "IN", quantity: opening, change: opening, movedOn: day(undefined), unitCost, note: "Opening stock", createdByUserId: actorId },
      });
    }
    return created;
  });
  await createAuditLog({ action: "CREATE", entityType: "InventoryItem", entityId: item.id, userId: actorId, newValues: { ...data, openingStock: opening } });
  return item;
};

export const updateItem = async (actorId: number, id: number, body: Record<string, unknown>) => {
  const before = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!before) throw httpError(404, "Item not found");
  const data = await itemFields({ ...before, minStock: num(before.minStock), ...body }, id);
  if (before.returnable && data.returnable === false && (await outstandingRows([id])).length) {
    throw httpError(400, "Some of this item is still with staff. Record the returns first, then mark it as not returnable.");
  }
  const item = await prisma.inventoryItem.update({ where: { id }, data });
  await createAuditLog({ action: "UPDATE", entityType: "InventoryItem", entityId: id, userId: actorId, oldValues: { ...before, stock: num(before.stock), minStock: num(before.minStock) }, newValues: data });
  return item;
};

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

const holderOutstanding = async (tx: any, itemId: number, staffId: number | null, issuedTo: string | null) => {
  const rows = await tx.inventoryMovement.findMany({
    where: {
      itemId,
      isVoid: false,
      type: { in: ["ISSUE", "RETURN"] },
      ...(staffId ? { staffId } : { staffId: null, issuedTo: { equals: issuedTo ?? "", mode: "insensitive" } }),
    },
    select: { type: true, quantity: true },
  });
  return round2(rows.reduce((s: number, r: any) => s + (r.type === "ISSUE" ? num(r.quantity) : -num(r.quantity)), 0));
};

// Changes stock by `change`, refusing to go below zero (checked in the UPDATE itself, so two
// people issuing the last box at the same moment can't both succeed).
const applyChange = async (tx: any, item: { id: number; unit: string; name: string }, change: number) => {
  if (change >= 0) {
    await tx.inventoryItem.update({ where: { id: item.id }, data: { stock: { increment: change } } });
    return;
  }
  const done = await tx.inventoryItem.updateMany({ where: { id: item.id, stock: { gte: -change } }, data: { stock: { decrement: -change } } });
  if (done.count === 0) {
    const now = await tx.inventoryItem.findUnique({ where: { id: item.id }, select: { stock: true } });
    throw httpError(400, `Only ${fmtQty(num(now?.stock), item.unit)} of ${item.name} in stock`);
  }
};

export const recordMovement = async (actorId: number, body: Record<string, unknown>) => {
  const type = String(body.type ?? "") as MovementType;
  if (!MOVEMENT_TYPES.includes(type)) throw httpError(400, "Choose what happened: received, issued, returned, stock count or write-off");
  const itemId = Number(body.itemId);
  const item = Number.isInteger(itemId) ? await prisma.inventoryItem.findUnique({ where: { id: itemId } }) : null;
  if (!item) throw httpError(404, "Item not found");
  if (!item.isActive) throw httpError(400, `${item.name} is switched off. Turn it back on to record stock.`);

  const movedOn = day(body.movedOn);
  const note = text(body.note, 300);
  const staffId = Number(body.staffId) > 0 ? Number(body.staffId) : null;
  const issuedTo = staffId ? null : text(body.issuedTo, 100);
  if (staffId && !(await prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } }))) throw httpError(400, "Staff member not found");

  let quantity: number;
  let change: number;
  const extra: Record<string, unknown> = {};
  switch (type) {
    case "IN": {
      quantity = qty(body.quantity);
      change = quantity;
      const unitCost = body.unitCost === undefined || body.unitCost === "" || body.unitCost === null ? null : Number(body.unitCost);
      if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) throw httpError(400, "Cost per unit can't be negative");
      Object.assign(extra, { supplier: text(body.supplier, 100), billNo: text(body.billNo, 40), unitCost });
      break;
    }
    case "ISSUE":
      quantity = qty(body.quantity);
      change = -quantity;
      if (!staffId && !issuedTo) throw httpError(400, "Issued to whom? Pick a staff member or type a room / class");
      Object.assign(extra, { staffId, issuedTo });
      break;
    case "RETURN":
      quantity = qty(body.quantity);
      change = quantity;
      if (!item.returnable) throw httpError(400, `${item.name} isn't a returnable item. Use a stock count to put unused stock back.`);
      if (!staffId && !issuedTo) throw httpError(400, "Returned by whom?");
      Object.assign(extra, { staffId, issuedTo });
      break;
    case "WRITE_OFF":
      quantity = qty(body.quantity);
      change = -quantity;
      if (!note) throw httpError(400, "Say why it's written off (damaged, lost, expired …)");
      break;
    case "ADJUST": {
      const counted = Number(body.countedStock);
      if (body.countedStock === "" || body.countedStock === undefined || !Number.isFinite(counted) || counted < 0) throw httpError(400, "Enter the quantity you counted");
      if (!note) throw httpError(400, "Add a note for the stock count (e.g. Annual stock check)");
      change = round2(counted - num(item.stock));
      if (change === 0) throw httpError(400, `The count matches the stock already (${fmtQty(counted, item.unit)})`);
      quantity = Math.abs(change);
      break;
    }
  }

  const movement = await prisma.$transaction(async (tx) => {
    if (type === "RETURN") {
      const holding = await holderOutstanding(tx, item.id, staffId, issuedTo);
      if (holding < quantity) throw httpError(400, holding > 0 ? `They have only ${fmtQty(holding, item.unit)} of ${item.name}` : `No ${item.name} is recorded as issued to them`);
    }
    await applyChange(tx, item, change);
    return tx.inventoryMovement.create({ data: { itemId: item.id, type, quantity, change, movedOn, note, createdByUserId: actorId, ...extra } });
  });
  await createAuditLog({ action: `STOCK_${type}`, entityType: "InventoryMovement", entityId: movement.id, userId: actorId, newValues: { itemId: item.id, quantity, change, staffId, issuedTo } });
  return movement;
};

export const voidMovement = async (actorId: number, id: number, reason: unknown) => {
  const why = text(reason, 300);
  if (!why || why.length < 3) throw httpError(400, "Say why this entry is being voided");
  const m = await prisma.inventoryMovement.findUnique({ where: { id }, include: { item: true } });
  if (!m) throw httpError(404, "Entry not found");
  if (m.isVoid) throw httpError(400, "This entry is already void");
  const reverse = -num(m.change);
  await prisma.$transaction(async (tx) => {
    // Voiding an issue whose items already came back would leave a negative balance with them.
    if (m.type === "ISSUE" && m.item.returnable) {
      const holding = await holderOutstanding(tx, m.itemId, m.staffId, m.issuedTo);
      if (holding < num(m.quantity)) throw httpError(400, "Some of this issue has already been returned. Void the return first.");
    }
    try {
      await applyChange(tx, m.item, reverse);
    } catch (e: any) {
      if (e?.statusCode === 400) throw httpError(400, `Can't void: ${m.item.name} has since been issued or used, so the stock would go below zero. Record a stock count instead.`);
      throw e;
    }
    await tx.inventoryMovement.update({ where: { id }, data: { isVoid: true, voidReason: why, voidedAt: new Date(), voidedByUserId: actorId } });
  });
  await createAuditLog({ action: "VOID", entityType: "InventoryMovement", entityId: id, userId: actorId, oldValues: { type: m.type, quantity: num(m.quantity), itemId: m.itemId }, newValues: { voidReason: why } });
  return { id };
};

export const listMovements = async (q: { itemId?: unknown; from?: unknown; to?: unknown; type?: unknown; includeVoid?: unknown }) => {
  const where: any = {};
  if (Number(q.itemId) > 0) where.itemId = Number(q.itemId);
  if (typeof q.type === "string" && MOVEMENT_TYPES.includes(q.type as MovementType)) where.type = q.type;
  if (q.includeVoid !== "true") where.isVoid = false;
  const range: any = {};
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) range.gte = new Date(`${q.from}T00:00:00.000Z`);
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) range.lte = new Date(`${q.to}T00:00:00.000Z`);
  if (Object.keys(range).length) where.movedOn = range;
  const rows = await prisma.inventoryMovement.findMany({
    where,
    orderBy: [{ movedOn: "desc" }, { id: "desc" }],
    take: 500,
    include: {
      item: { select: { name: true, unit: true } },
      staff: { select: { user: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    itemId: m.itemId,
    item: m.item.name,
    unit: m.item.unit,
    type: m.type,
    quantity: num(m.quantity),
    change: num(m.change),
    movedOn: m.movedOn,
    supplier: m.supplier,
    billNo: m.billNo,
    unitCost: m.unitCost === null ? null : num(m.unitCost),
    staffId: m.staffId,
    holder: m.staff?.user.name ?? m.issuedTo,
    note: m.note,
    isVoid: m.isVoid,
    voidReason: m.voidReason,
    createdBy: m.createdBy.name,
    createdAt: m.createdAt,
  }));
};

// Returnable items currently with someone, oldest first.
export const listWithStaff = async () => {
  const rows = await outstandingRows();
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.itemId))] } }, select: { id: true, name: true, unit: true } });
  const byId = new Map<number, { name: string; unit: string }>(items.map((i) => [i.id, i]));
  return rows
    .map((r) => ({ ...r, item: byId.get(r.itemId)?.name ?? "", unit: byId.get(r.itemId)?.unit ?? "", issuedTo: r.staffId ? null : r.holder }))
    .sort((a, b) => a.since.getTime() - b.since.getTime());
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

// ---------------------------------------------------------------------------
// Excel: stock register (current stock, entries in the date range, items with staff)
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = { IN: "Received", ISSUE: "Issued", RETURN: "Returned", ADJUST: "Stock count", WRITE_OFF: "Written off" };

export const stockRegisterSheets = async (from: unknown, to: unknown) => {
  const [items, moves, held] = await Promise.all([listItems({ includeInactive: "false" }), listMovements({ from, to, includeVoid: "true" }), listWithStaff()]);
  const range = [from, to].filter((v) => typeof v === "string" && v).join(" to ");
  return [
    {
      name: "Stock",
      columns: [
        { header: "Item", key: "name", width: 32 },
        { header: "Category", key: "category", width: 20 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "In stock", key: "stock", type: "number" as const, width: 10 },
        { header: "With staff", key: "withStaff", type: "number" as const, width: 10 },
        { header: "Low-stock level", key: "minStock", type: "number" as const, width: 14 },
        { header: "Low?", key: "isLow", width: 7 },
        { header: "Returnable", key: "returnable", width: 11 },
        { header: "Location", key: "location", width: 20 },
        { header: "Last cost / unit", key: "lastUnitCost", type: "money" as const, width: 14 },
        { header: "Stock value", key: "stockValue", type: "money" as const, width: 14 },
      ],
      rows: items,
    },
    {
      name: "Entries",
      note: range ? `Entries ${range}` : undefined,
      columns: [
        { header: "Date", key: "movedOn", type: "date" as const, width: 12 },
        { header: "Item", key: "item", width: 28 },
        { header: "What", key: "what", width: 13 },
        { header: "Qty", key: "quantity", type: "number" as const, width: 8 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "Stock change", key: "change", type: "number" as const, width: 12 },
        { header: "To / from", key: "holder", width: 22 },
        { header: "Supplier", key: "supplier", width: 20 },
        { header: "Bill no.", key: "billNo", width: 12 },
        { header: "Cost / unit", key: "unitCost", type: "money" as const, width: 11 },
        { header: "Note", key: "note", width: 30 },
        { header: "Entered by", key: "createdBy", width: 18 },
        { header: "Void", key: "voided", width: 30 },
      ],
      rows: moves.map((m) => ({ ...m, what: TYPE_LABEL[m.type] ?? m.type, voided: m.isVoid ? `Void: ${m.voidReason ?? ""}` : "" })),
    },
    {
      name: "With staff",
      columns: [
        { header: "Item", key: "item", width: 28 },
        { header: "With", key: "holder", width: 24 },
        { header: "Qty", key: "quantity", type: "number" as const, width: 8 },
        { header: "Unit", key: "unit", width: 8 },
        { header: "Since", key: "since", type: "date" as const, width: 12 },
      ],
      rows: held,
    },
  ];
};
