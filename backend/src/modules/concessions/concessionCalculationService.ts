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
// All concessions are assigned per student by the office on the Concessions screen —
// there is no automatic sibling/staff-child detection (the Families module was removed).
export interface ConcessionContext {
  studentConcessions: any[]; // ACTIVE StudentConcession rows (with concessionScheme and staff)
}

export const loadConcessionContext = async (db: any, studentId: number): Promise<ConcessionContext> => ({
  studentConcessions: await db.studentConcession.findMany({
    where: { studentId, status: "ACTIVE" },
    include: { concessionScheme: true, staff: true },
  }),
});

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

  // ORDER 2: ALL OTHER CONCESSIONS (sibling, staff child, transport, special, ...), each one
  // assigned to the student by hand. A STAFF_CHILD concession only applies while the linked
  // staff member is employed (Staff.isActive) — not User.isActive, which is login access that
  // drivers/guards/cleaning staff never have.
  for (const conc of active.filter((c) => c.type !== AdjustmentType.SCHOLARSHIP)) {
    if (conc.type === AdjustmentType.STAFF_CHILD && conc.staff && !conc.staff.isActive) continue;
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
