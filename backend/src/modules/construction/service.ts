import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";
import { assertSuperAdmin, httpError } from "../../utils/httpError";
import type { ExpenseFilters, ExpenseInput, ProjectInput } from "./validation";

// Building construction expenses — SUPER_ADMIN only. Every mutation runs in a
// transaction together with its ConstructionAuditLog row, so an expense can never change
// without a matching audit entry. Expenses are never deleted; they're voided (excluded
// from every total) with a reason.

type Actor = { id: number; role: Role };

const userSelect = { select: { id: true, name: true } };

const expenseInclude = {
  project: { select: { id: true, name: true } },
  createdByUser: userSelect,
  updatedByUser: userSelect,
  voidedByUser: userSelect,
};

const audit = (
  tx: any,
  data: { action: string; entityType: string; entityId: number; userId: number; oldValues?: unknown; newValues?: unknown }
) =>
  tx.constructionAuditLog.create({
    data: {
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      userId: data.userId,
      oldValues: data.oldValues === undefined ? null : JSON.stringify(data.oldValues),
      newValues: data.newValues === undefined ? null : JSON.stringify(data.newValues),
    },
  });

const isUniqueViolation = (err: unknown, field: string) => {
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
};

// Fields of a ConstructionExpense row worth snapshotting in the audit log.
const snapshot = (row: any) => ({
  projectId: row.projectId,
  title: row.title,
  category: row.category,
  expenseDate: row.expenseDate instanceof Date ? row.expenseDate.toISOString().slice(0, 10) : row.expenseDate,
  amount: row.amount?.toString(),
  vendorName: row.vendorName,
  vendorContact: row.vendorContact,
  invoiceNumber: row.invoiceNumber,
  attachmentUrl: row.attachmentUrl,
  paymentStatus: row.paymentStatus,
  paymentMode: row.paymentMode,
  notes: row.notes,
  isVoid: row.isVoid,
  voidReason: row.voidReason,
});

// ---------- Projects ----------

export const listProjects = async (actor: Actor) => {
  assertSuperAdmin(actor);
  const [projects, spent] = await Promise.all([
    prisma.constructionProject.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { _count: { select: { expenses: { where: { isVoid: false } } } } },
    }),
    prisma.constructionExpense.groupBy({ by: ["projectId"], where: { isVoid: false }, _sum: { amount: true } }),
  ]);
  const spentById = new Map<number, string>(
    spent.map((s: any) => [s.projectId, (s._sum.amount ?? 0).toString()])
  );
  return projects.map((p: any) => ({
    ...p,
    budget: p.budget?.toString() ?? null,
    totalSpent: spentById.get(p.id) ?? "0",
    expenseCount: p._count.expenses,
    _count: undefined,
  }));
};

export const createProject = async (actor: Actor, input: ProjectInput) => {
  assertSuperAdmin(actor);
  try {
    return await prisma.$transaction(async (tx: any) => {
      const project = await tx.constructionProject.create({
        data: { ...input, name: input.name!, createdByUserId: actor.id },
      });
      await audit(tx, {
        action: "CREATE",
        entityType: "ConstructionProject",
        entityId: project.id,
        userId: actor.id,
        newValues: { ...input, budget: input.budget ?? null },
      });
      return project;
    });
  } catch (err) {
    if (isUniqueViolation(err, "name")) throw httpError(409, "A project with this name already exists");
    throw err;
  }
};

export const updateProject = async (actor: Actor, id: number, input: ProjectInput) => {
  assertSuperAdmin(actor);
  try {
    return await prisma.$transaction(async (tx: any) => {
      const existing = await tx.constructionProject.findUnique({ where: { id } });
      if (!existing) throw httpError(404, "Project not found");

      const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
      const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
      if (startDate && endDate && startDate > endDate) throw httpError(400, "startDate cannot be after endDate");

      const project = await tx.constructionProject.update({ where: { id }, data: input });
      await audit(tx, {
        action: "UPDATE",
        entityType: "ConstructionProject",
        entityId: id,
        userId: actor.id,
        oldValues: { ...existing, budget: existing.budget?.toString() ?? null },
        newValues: { ...project, budget: project.budget?.toString() ?? null },
      });
      return project;
    });
  } catch (err) {
    if (isUniqueViolation(err, "name")) throw httpError(409, "A project with this name already exists");
    throw err;
  }
};

// ---------- Expenses ----------

const buildExpenseWhere = (filters: Partial<ExpenseFilters>) => {
  const where: Record<string, unknown> = {};
  if (!filters.includeVoid) where.isVoid = false;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.category) where.category = filters.category;
  if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
  if (filters.from || filters.to) {
    where.expenseDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    const contains = { contains: filters.search, mode: "insensitive" as const };
    where.OR = [{ title: contains }, { vendorName: contains }, { invoiceNumber: contains }, { notes: contains }];
  }
  return where;
};

// Returns every matching expense plus totals for exactly that set. Totals never include
// voided rows, even when includeVoid is on (voided rows are shown for audit only).
export const listExpenses = async (actor: Actor, filters: ExpenseFilters) => {
  assertSuperAdmin(actor);
  const where = buildExpenseWhere(filters);
  const totalsWhere = buildExpenseWhere({ ...filters, includeVoid: false });

  const [rows, totals] = await Promise.all([
    prisma.constructionExpense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ [filters.sortBy]: filters.sortOrder }, { id: "desc" }],
    }),
    prisma.constructionExpense.aggregate({ where: totalsWhere, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  return {
    rows,
    totals: { count: totals._count._all, amount: (totals._sum.amount ?? 0).toString() },
  };
};

export const getExpense = async (actor: Actor, id: number) => {
  assertSuperAdmin(actor);
  const expense = await prisma.constructionExpense.findUnique({ where: { id }, include: expenseInclude });
  if (!expense) throw httpError(404, "Expense not found");

  const history = await prisma.constructionAuditLog.findMany({
    where: { entityType: "ConstructionExpense", entityId: id },
    orderBy: { timestamp: "asc" },
    include: { user: userSelect },
  });
  return { ...expense, history };
};

const assertProjectExists = async (tx: any, projectId: number) => {
  const project = await tx.constructionProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw httpError(400, "Selected project does not exist");
};

// Creating with an idempotencyKey that was already used returns the original expense
// (replayed: true) instead of inserting a second copy — covers double-clicks and retries.
export const createExpense = async (actor: Actor, input: ExpenseInput, idempotencyKey?: string) => {
  assertSuperAdmin(actor);

  if (idempotencyKey) {
    const existing = await prisma.constructionExpense.findUnique({
      where: { idempotencyKey },
      include: expenseInclude,
    });
    if (existing) return { expense: existing, replayed: true };
  }

  try {
    const expense = await prisma.$transaction(async (tx: any) => {
      await assertProjectExists(tx, input.projectId!);
      const created = await tx.constructionExpense.create({
        data: {
          ...input,
          projectId: input.projectId!,
          title: input.title!,
          category: input.category!,
          expenseDate: input.expenseDate!,
          amount: input.amount!,
          idempotencyKey: idempotencyKey ?? null,
          createdByUserId: actor.id,
        },
        include: expenseInclude,
      });
      await audit(tx, {
        action: "CREATE",
        entityType: "ConstructionExpense",
        entityId: created.id,
        userId: actor.id,
        newValues: snapshot(created),
      });
      return created;
    });
    return { expense, replayed: false };
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err, "idempotencyKey")) {
      const existing = await prisma.constructionExpense.findUnique({
        where: { idempotencyKey },
        include: expenseInclude,
      });
      if (existing) return { expense: existing, replayed: true };
    }
    throw err;
  }
};

export const updateExpense = async (actor: Actor, id: number, input: ExpenseInput) => {
  assertSuperAdmin(actor);
  if (Object.keys(input).length === 0) throw httpError(400, "No changes supplied");

  return prisma.$transaction(async (tx: any) => {
    const existing = await tx.constructionExpense.findUnique({ where: { id } });
    if (!existing) throw httpError(404, "Expense not found");
    if (existing.isVoid) throw httpError(409, "A voided expense cannot be edited");
    if (input.projectId) await assertProjectExists(tx, input.projectId);

    // Guard on isVoid=false in the write itself so a concurrent void can't be overwritten.
    const { count } = await tx.constructionExpense.updateMany({
      where: { id, isVoid: false },
      data: { ...input, updatedByUserId: actor.id },
    });
    if (count === 0) throw httpError(409, "A voided expense cannot be edited");

    const updated = await tx.constructionExpense.findUnique({ where: { id }, include: expenseInclude });
    await audit(tx, {
      action: "UPDATE",
      entityType: "ConstructionExpense",
      entityId: id,
      userId: actor.id,
      oldValues: snapshot(existing),
      newValues: snapshot(updated),
    });
    return updated;
  });
};

export const voidExpense = async (actor: Actor, id: number, reason: string) => {
  assertSuperAdmin(actor);

  return prisma.$transaction(async (tx: any) => {
    const existing = await tx.constructionExpense.findUnique({ where: { id } });
    if (!existing) throw httpError(404, "Expense not found");

    const { count } = await tx.constructionExpense.updateMany({
      where: { id, isVoid: false },
      data: { isVoid: true, voidReason: reason, voidedAt: new Date(), voidedByUserId: actor.id },
    });
    if (count === 0) throw httpError(409, "This expense has already been voided");

    const voided = await tx.constructionExpense.findUnique({ where: { id }, include: expenseInclude });
    await audit(tx, {
      action: "VOID",
      entityType: "ConstructionExpense",
      entityId: id,
      userId: actor.id,
      oldValues: snapshot(existing),
      newValues: snapshot(voided),
    });
    return voided;
  });
};

// ---------- Summary (report header + dashboard) ----------

// Start of the current month and next month as UTC-midnight Dates, which is how the
// @db.Date expenseDate column compares. Month boundaries follow IST.
export const currentMonthRange = (now = new Date()) => {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
};

export const getConstructionSummary = async (actor: Actor) => {
  assertSuperAdmin(actor);
  const { start, end } = currentMonthRange();
  const active = { isVoid: false };

  const [overall, thisMonth, byCategory, recent, projects] = await Promise.all([
    prisma.constructionExpense.aggregate({ where: active, _sum: { amount: true }, _count: { _all: true } }),
    prisma.constructionExpense.aggregate({
      where: { ...active, expenseDate: { gte: start, lt: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.constructionExpense.groupBy({
      by: ["category"],
      where: active,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.constructionExpense.findMany({
      where: active,
      orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
      take: 5,
      include: { project: { select: { id: true, name: true } } },
    }),
    listProjects(actor),
  ]);

  return {
    totalAmount: (overall._sum.amount ?? 0).toString(),
    entryCount: overall._count._all,
    currentMonthAmount: (thisMonth._sum.amount ?? 0).toString(),
    currentMonthCount: thisMonth._count._all,
    byCategory: byCategory
      .map((c: any) => ({ category: c.category, amount: (c._sum.amount ?? 0).toString(), count: c._count._all }))
      .sort((a: any, b: any) => Number(b.amount) - Number(a.amount)),
    recent: recent.map((r: any) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      expenseDate: r.expenseDate,
      amount: r.amount.toString(),
      project: r.project,
    })),
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      budget: p.budget,
      totalSpent: p.totalSpent,
    })),
  };
};
