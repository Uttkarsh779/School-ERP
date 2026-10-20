import { prisma } from "../../config/prisma";
import { AdjustmentType, CalculationType } from "../../generated/prisma/enums";

export interface IAppliedConcession {
  type: AdjustmentType;
  concessionSchemeId?: number;
  studentConcessionId?: number;
  staffId?: number;
  feeHeadId: number;
  amount: number;
  reason: string;
}

type LineItem = { feeHeadId: number; headName: string; code: string; amount: number };

// Everything the concession rules need for one student, loaded once so a whole session
// can be billed/projected month by month without going back to the database.
export interface ConcessionContext {
  studentConcessions: any[]; // ACTIVE StudentConcession rows (with concessionScheme)
  siblingScheme: any | null;
  staffScheme: any | null;
  siblingOrder: number | null; // from the primary parent link
  staffMember: any | null; // Staff record of the primary parent, if the parent is staff
}

export const loadConcessionContext = async (db: any, studentId: number): Promise<ConcessionContext> => {
  const [student, studentConcessions, schemes] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      include: { parents: { where: { isPrimary: true }, include: { parent: true } } },
    }),
    db.studentConcession.findMany({ where: { studentId, status: "ACTIVE" }, include: { concessionScheme: true } }),
    db.concessionScheme.findMany({
      where: { isActive: true, type: { in: [AdjustmentType.SIBLING_DISCOUNT, AdjustmentType.STAFF_CHILD] } },
      orderBy: { id: "asc" },
    }),
  ]);
  const parentLink = student?.parents?.[0];
  const staffMember = parentLink?.parent?.userId
    ? await db.staff.findUnique({ where: { userId: parentLink.parent.userId } })
    : null;
  return {
    studentConcessions,
    siblingScheme: schemes.find((s: any) => s.type === AdjustmentType.SIBLING_DISCOUNT) ?? null,
    staffScheme: schemes.find((s: any) => s.type === AdjustmentType.STAFF_CHILD) ?? null,
    siblingOrder: parentLink?.siblingOrder ?? null,
    staffMember,
  };
};

const activeOn = (row: { startsFrom?: Date | null; endsOn?: Date | null }, date: Date) =>
  (!row.startsFrom || new Date(row.startsFrom) <= date) && (!row.endsOn || new Date(row.endsOn) >= date);

const parseConfig = (raw: string | null | undefined): Record<string, any> => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

// Applies concessions to one month's line items, in a fixed order: scholarships, sibling
// discount, staff-child discount, then other student concessions (transport, special...).
// Each discount is limited to what is still left on that head, so a fee never goes negative.
// A concession/scheme with no fee heads selected applies to ALL heads on the bill (as the
// concessions screen tells the admin).
export const applyConcessions = (
  ctx: ConcessionContext,
  billingMonth: number,
  billingYear: number,
  lineItems: LineItem[]
): IAppliedConcession[] => {
  const applied: IAppliedConcession[] = [];
  const billingDate = new Date(billingYear, billingMonth - 1, 1);
  const remaining: Record<number, number> = {};
  for (const item of lineItems) remaining[item.feeHeadId] = (remaining[item.feeHeadId] ?? 0) + item.amount;
  const baseOf = (headId: number) => lineItems.filter((i) => i.feeHeadId === headId).reduce((s, i) => s + i.amount, 0);
  const headsFor = (applicableHeads: number[] | null | undefined) =>
    applicableHeads && applicableHeads.length > 0 ? applicableHeads : [...new Set(lineItems.map((i) => i.feeHeadId))];

  const apply = (
    heads: number[],
    value: number,
    isPct: boolean,
    make: (headId: number, amount: number) => IAppliedConcession
  ) => {
    for (const headId of heads) {
      if (!(remaining[headId] > 0)) continue;
      const wanted = isPct ? (baseOf(headId) * value) / 100 : value;
      const amount = Math.min(wanted, remaining[headId]);
      if (amount > 0) {
        remaining[headId] -= amount;
        applied.push(make(headId, amount));
      }
    }
  };

  const active = ctx.studentConcessions.filter((c) => activeOn(c, billingDate));

  // ORDER 1: SCHOLARSHIPS
  for (const conc of active.filter((c) => c.type === AdjustmentType.SCHOLARSHIP)) {
    apply(headsFor(conc.applicableHeads), Number(conc.value), conc.calculationType === CalculationType.PERCENTAGE, (feeHeadId, amount) => ({
      type: AdjustmentType.SCHOLARSHIP,
      studentConcessionId: conc.id,
      concessionSchemeId: conc.concessionSchemeId || undefined,
      feeHeadId,
      amount,
      reason: conc.reason || conc.concessionScheme?.name || "Scholarship",
    }));
  }

  // ORDER 2: SIBLING DISCOUNT (global scheme, by the child's sibling order)
  const sibling = ctx.siblingScheme;
  if (sibling && activeOn(sibling, billingDate) && ctx.siblingOrder && ctx.siblingOrder > 1) {
    const cfg = parseConfig(sibling.configJson)[String(ctx.siblingOrder)];
    if (cfg) {
      const isPct = (cfg.calculationType || sibling.calculationType) === CalculationType.PERCENTAGE;
      apply(headsFor(sibling.applicableHeads), Number(cfg.value || sibling.value), isPct, (feeHeadId, amount) => ({
        type: AdjustmentType.SIBLING_DISCOUNT,
        concessionSchemeId: sibling.id,
        feeHeadId,
        amount,
        reason: sibling.name,
      }));
    }
  }

  // ORDER 3: STAFF CHILD DISCOUNT (global scheme, by the parent's staff category) — only
  // while the parent is employed (Staff.isActive). Not User.isActive: that is login access,
  // which drivers/guards/cleaning staff never have.
  const staffScheme = ctx.staffScheme;
  const staff = ctx.staffMember;
  if (staffScheme && activeOn(staffScheme, billingDate) && staff && staff.isActive) {
    const cfg = parseConfig(staffScheme.configJson)[staff.staffCategory];
    if (cfg) {
      apply(headsFor(staffScheme.applicableHeads), Number(cfg.value), cfg.calculationType === CalculationType.PERCENTAGE, (feeHeadId, amount) => ({
        type: AdjustmentType.STAFF_CHILD,
        concessionSchemeId: staffScheme.id,
        staffId: staff.id,
        feeHeadId,
        amount,
        reason: `Staff Child Concession (${staff.staffCategory})`,
      }));
    }
  }

  // ORDER 4: OTHER STUDENT CONCESSIONS (transport, special, ...)
  for (const conc of active.filter((c) => c.type !== AdjustmentType.SCHOLARSHIP)) {
    apply(headsFor(conc.applicableHeads), Number(conc.value), conc.calculationType === CalculationType.PERCENTAGE, (feeHeadId, amount) => ({
      type: conc.type,
      studentConcessionId: conc.id,
      concessionSchemeId: conc.concessionSchemeId || undefined,
      feeHeadId,
      amount,
      reason: conc.reason || conc.concessionScheme?.name || "Custom Concession",
    }));
  }

  return applied;
};

export const calculateConcessionsForStudent = async (
  studentId: number,
  billingMonth: number,
  billingYear: number,
  lineItems: LineItem[]
): Promise<IAppliedConcession[]> =>
  applyConcessions(await loadConcessionContext(prisma, studentId), billingMonth, billingYear, lineItems);
