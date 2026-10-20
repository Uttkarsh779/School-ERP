// The ONE place late fees are calculated. Every screen that shows dues (student fees page,
// payment desk, ledger, defaulters, Razorpay order amount) and every payment path uses
// this, so all of them always agree.
//
// Rule: the session's latest LateFeeRule. With no rule configured, no late fee is charged.
//   overdueDays <= gracePeriodDays      -> 0
//   FIXED  -> amount, once
//   DAILY  -> amount x (overdueDays - gracePeriodDays)
//   SLAB   -> slabsJson = [{ "uptoDays": 10, "amount": 100 }, { "uptoDays": null, "amount": 500 }]
//             (first slab whose uptoDays >= overdueDays; uptoDays null = no upper limit)
// The fine is charged ONCE per student per billing month (one monthly bill = one fine), not
// once per fee head: it sits on a single "carrier" charge of that month — the open charge
// already holding a saved fine, else the lowest-id open charge. Fines already collected on
// that month's settled charges and late-fee waivers anywhere in the month are subtracted,
// and a late fee is never reduced below what was already saved onto a charge.

export type LateFeeRuleLike = {
  gracePeriodDays: number;
  feeType: "FIXED" | "DAILY" | "SLAB";
  amount: unknown;
  slabsJson?: string | null;
};

export type ChargeLike = {
  id: number;
  dueDate: Date;
  status: string;
  baseAmount: unknown;
  discountAmount: unknown;
  lateFeeAmount: unknown;
  paidAmount: unknown;
  sessionId: number;
};

const DAY_MS = 86_400_000;
const OPEN = new Set(["UNPAID", "PARTIALLY_PAID"]);

export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export type Slab = { uptoDays: number | null; amount: number };

// Validates/normalises slabs from a request body. Throws a readable error for bad input.
export const parseSlabs = (raw: unknown): Slab[] => {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(value) || value.length === 0) throw new Error("SLAB rules need at least one slab");
  const slabs = value.map((s: any) => {
    const amount = Number(s?.amount);
    const upto = s?.uptoDays === null || s?.uptoDays === undefined || s?.uptoDays === "" ? null : Number(s.uptoDays);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Each slab needs an amount of 0 or more");
    if (upto !== null && (!Number.isInteger(upto) || upto <= 0)) throw new Error("Slab 'uptoDays' must be a whole number above 0");
    return { uptoDays: upto, amount };
  });
  return slabs.sort((a, b) => (a.uptoDays ?? Infinity) - (b.uptoDays ?? Infinity));
};

// Late fee a charge has accrued by `asOf` under `rule` (before waivers).
export const accruedLateFee = (dueDate: Date, rule: LateFeeRuleLike | null, asOf = new Date()): number => {
  if (!rule) return 0;
  const overdueDays = Math.floor((asOf.getTime() - new Date(dueDate).getTime()) / DAY_MS);
  if (overdueDays <= rule.gracePeriodDays) return 0;
  const amount = num(rule.amount);
  if (rule.feeType === "FIXED") return amount;
  if (rule.feeType === "DAILY") return amount * (overdueDays - rule.gracePeriodDays);
  try {
    const slabs = parseSlabs(rule.slabsJson ?? "[]");
    const slab = slabs.find((s) => s.uptoDays === null || overdueDays <= s.uptoDays) ?? slabs[slabs.length - 1];
    return slab ? slab.amount : 0;
  } catch {
    return 0; // malformed slabs: charge nothing rather than guess
  }
};

// Effective late fee for one charge right now.
export const effectiveLateFee = (charge: ChargeLike, rule: LateFeeRuleLike | null, waived: number, asOf = new Date()) => {
  const stored = num(charge.lateFeeAmount);
  if (!OPEN.has(charge.status)) return stored; // settled charges keep what they were billed
  return Math.max(stored, Math.max(0, accruedLateFee(charge.dueDate, rule, asOf) - waived));
};

export const outstandingOf = (charge: ChargeLike, lateFee: number) =>
  Math.max(0, num(charge.baseAmount) - num(charge.discountAmount) + lateFee - num(charge.paidAmount));

// Latest rule per session id.
export const loadRules = async (db: any, sessionIds: number[]) => {
  const ids = [...new Set(sessionIds)];
  if (ids.length === 0) return new Map<number, LateFeeRuleLike>();
  const rules = await db.lateFeeRule.findMany({ where: { sessionId: { in: ids } }, orderBy: { createdAt: "desc" } });
  const bySession = new Map<number, LateFeeRuleLike>();
  for (const r of rules) if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, r);
  return bySession;
};

// Total LATE_FEE_WAIVER amount per charge id.
export const loadLateFeeWaivers = async (db: any, chargeIds: number[]) => {
  const map = new Map<number, number>();
  if (chargeIds.length === 0) return map;
  const rows = await db.feeAdjustment.groupBy({
    by: ["feeChargeId"],
    where: { feeChargeId: { in: chargeIds }, type: "LATE_FEE_WAIVER" },
    _sum: { amount: true },
  });
  for (const r of rows) if (r.feeChargeId) map.set(r.feeChargeId, num(r._sum.amount));
  return map;
};

type MonthChargeLike = ChargeLike & { studentId?: number; billingYear?: number; billingMonth?: number };

const monthKey = (c: MonthChargeLike) => `${c.studentId}:${c.sessionId}:${c.billingYear}:${c.billingMonth}`;

// Attaches { lateFee, outstanding } to each charge using the rules above. All charges of the
// same student-month are loaded (even ones the caller didn't pass), so the month's fine
// lands on the same carrier whichever subset of charges a screen asks about.
export const withLateFees = async <T extends ChargeLike>(db: any, charges: T[], asOf = new Date()) => {
  const monthCharges = charges as unknown as MonthChargeLike[];
  const groupable = monthCharges.filter((c) => c.studentId !== undefined && c.billingMonth !== undefined && c.billingYear !== undefined);
  const siblings: MonthChargeLike[] = groupable.length
    ? await db.feeCharge.findMany({
        where: {
          studentId: { in: [...new Set(groupable.map((c) => c.studentId))] },
          sessionId: { in: [...new Set(groupable.map((c) => c.sessionId))] },
          status: { notIn: ["CANCELLED", "VOID"] },
        },
        select: { id: true, studentId: true, sessionId: true, billingYear: true, billingMonth: true, dueDate: true, status: true, lateFeeAmount: true },
      })
    : [];
  const wanted = new Set(groupable.map(monthKey));
  const groups = new Map<string, MonthChargeLike[]>();
  for (const c of siblings) {
    const key = monthKey(c);
    if (!wanted.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const [rules, waivers] = await Promise.all([
    loadRules(db, charges.map((c) => c.sessionId)),
    loadLateFeeWaivers(db, [...new Set([...charges.map((c) => c.id), ...siblings.map((c) => c.id)])]),
  ]);

  // Late fee per charge id for every grouped month.
  const feeById = new Map<number, number>();
  for (const group of groups.values()) {
    const open = group.filter((c) => OPEN.has(c.status)).sort((a, b) => a.id - b.id);
    for (const c of group) feeById.set(c.id, num(c.lateFeeAmount));
    if (open.length === 0) continue;
    const carrier = open.find((c) => num(c.lateFeeAmount) > 0) ?? open[0];
    const alreadyCharged = group.filter((c) => c.id !== carrier.id).reduce((s, c) => s + num(c.lateFeeAmount), 0);
    const waived = group.reduce((s, c) => s + (waivers.get(c.id) ?? 0), 0);
    const accrued = accruedLateFee(carrier.dueDate, rules.get(carrier.sessionId) ?? null, asOf);
    feeById.set(carrier.id, Math.max(num(carrier.lateFeeAmount), accrued - alreadyCharged - waived, 0));
  }

  return charges.map((c) => {
    const lateFee = feeById.has(c.id)
      ? feeById.get(c.id)!
      : effectiveLateFee(c, rules.get(c.sessionId) ?? null, waivers.get(c.id) ?? 0, asOf);
    return { charge: c, lateFee, outstanding: outstandingOf(c, lateFee) };
  });
};

// Saves accrued late fees onto a student's open charges (inside a payment transaction) so
// the amount paid, the receipt and every later screen use the same late fee.
export const persistAccruedLateFees = async (tx: any, studentId: number, chargeIds?: number[]) => {
  const open = await tx.feeCharge.findMany({
    where: { studentId, status: { in: ["UNPAID", "PARTIALLY_PAID"] }, ...(chargeIds ? { id: { in: chargeIds } } : {}) },
  });
  const computed = await withLateFees(tx, open);
  for (const { charge, lateFee } of computed) {
    if (lateFee !== num(charge.lateFeeAmount)) {
      await tx.feeCharge.update({
        where: { id: charge.id },
        data: {
          lateFeeAmount: lateFee,
          netAmount: Math.max(0, num(charge.baseAmount) - num(charge.discountAmount) + lateFee),
        },
      });
    }
  }
};

// Unique, human-readable receipt number derived from the payment's own id — no counting
// or random numbers, so two simultaneous payments can never collide.
export const receiptNumberFor = (paymentId: number, at = new Date()) =>
  `REC-${at.getFullYear()}-${String(paymentId).padStart(6, "0")}`;
