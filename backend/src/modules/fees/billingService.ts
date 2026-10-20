// The ONE place a student's monthly bill is worked out. Every path that bills a month —
// "Generate charges" for a class, the Bills tab's collection-period generation, the payment
// desk billing a month for the first time — and the payment desk's projection of unbilled
// months use it, so they all produce the same per-head charges, discounts and transport.
//
// Rules (standard school-ERP billing):
//  - A student is billed only from their admission month; inactive students are not billed.
//  - Fee structure: the class section's own structure for the session, else one shared by the
//    class's other sections, else the session-wide structure (classSectionId null).
//  - A structure item is billed in its applicableMonths (empty = every month).
//  - Joining month (admission in the billing month), per the student's fee assignment policy:
//    FULL_MONTH -> full fee; PRORATED -> monthly items prorated from the joining day;
//    NEXT_MONTH -> structure items start next month. Transport follows its own billing policy.
//  - Concessions are applied per fee head (concessionCalculationService).
//  - Each month is one bill: an Invoice per student per month, one FeeCharge per fee head.

import { prisma } from "../../config/prisma";
import { applyConcessions, loadConcessionContext, type ConcessionContext, type IAppliedConcession } from "../concessions/concessionCalculationService";
import { loadTransportContext, transportFeeForMonth } from "../transport/transportVillageService";
import { classSectionForSession } from "../sessions/enrollmentService";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const periodCodeFor = (month: number, year: number) => `${MONTH_NAMES[month - 1].substring(0, 3).toUpperCase()}_${year}`;

export interface BillLine {
  feeHeadId: number;
  feeStructureItemId: number | null;
  headName: string;
  code: string;
  baseAmount: number;
  discountAmount: number;
  netAmount: number;
  dueDate: Date;
  concessions: IAppliedConcession[];
}

export interface MonthBill {
  month: number;
  year: number;
  periodCode: string;
  eligible: boolean;
  notEnrolled?: boolean; // not on roll this month (before admission / after leaving)
  reason?: string;
  lines: BillLine[];
  baseTotal: number;
  discountTotal: number;
  total: number;
}

export interface BillingContext {
  sessionId: number;
  student: any; // Student with classSection and feeAssignments
  feeStructure: any | null; // with items.feeHead
  transportAssignments: any[];
  transportHead: { id: number; name: string; code: string };
  concessions: ConcessionContext;
}

const getOrCreateTransportHead = async (db: any) =>
  (await db.feeHead.findUnique({ where: { name: "Transport Fee" } })) ||
  db.feeHead.create({
    data: { name: "Transport Fee", code: "TRANSPORT", description: "Village-based student transportation fee", isRecurring: true, allowPartialPayment: true },
  });

// The fee structure that applies to a student's class this session.
export const findStructureForClass = async (db: any, sessionId: number, classSection: { id: number; className: string } | null) => {
  const candidateIds: number[] = [];
  if (classSection) {
    candidateIds.push(classSection.id);
    const siblings = await db.classSection.findMany({ where: { sessionId, className: classSection.className }, select: { id: true } });
    for (const s of siblings) if (!candidateIds.includes(s.id)) candidateIds.push(s.id);
  }
  const structures = await db.feeStructure.findMany({
    where: { sessionId, OR: [{ classSectionId: { in: candidateIds } }, { classSectionId: null }] },
    include: { items: { include: { feeHead: true } } },
    orderBy: [{ classSectionId: "desc" }, { id: "desc" }],
  });
  return (
    structures.find((s: any) => s.classSectionId === classSection?.id) ||
    structures.find((s: any) => s.classSectionId !== null) ||
    structures.find((s: any) => s.classSectionId === null) ||
    null
  );
};

// Loads everything needed to bill one student for any month of the session.
export const loadBillingContext = async (db: any, studentId: number, sessionId: number): Promise<BillingContext> => {
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { classSection: true, feeAssignments: true },
  });
  // A promoted student is billed for an older session by the class they were in that year.
  const sessionClass = await classSectionForSession(db, student, sessionId);
  const [feeStructure, transportAssignments, transportHead, concessions] = await Promise.all([
    findStructureForClass(db, sessionId, sessionClass),
    loadTransportContext(db, studentId),
    getOrCreateTransportHead(db),
    loadConcessionContext(db, studentId),
  ]);
  return { sessionId, student, feeStructure, transportAssignments, transportHead, concessions };
};

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Works out one month's bill. Pure — no database access.
export const computeMonthBill = (ctx: BillingContext, month: number, year: number): MonthBill => {
  const periodCode = periodCodeFor(month, year);
  const empty = (reason: string, notEnrolled = false): MonthBill => ({ month, year, periodCode, eligible: false, notEnrolled, reason, lines: [], baseTotal: 0, discountTotal: 0, total: 0 });
  const { student } = ctx;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const daysInMonth = monthEnd.getDate();

  if (!student.isActive) return empty("Student is not active (withdrawn / left)", true);
  const admission = student.admissionDate ? dayStart(new Date(student.admissionDate)) : null;
  if (admission && admission > monthEnd) return empty(`Admitted on ${admission.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, after this month`, true);
  const isJoiningMonth = !!admission && admission >= monthStart;

  const assignment = ctx.feeStructure
    ? student.feeAssignments?.find((a: any) => a.feeStructureId === ctx.feeStructure.id)
    : undefined;
  const policy = assignment?.joiningDatePolicy ?? "FULL_MONTH";

  type Draft = { feeHeadId: number; feeStructureItemId: number | null; headName: string; code: string; amount: number; dueDate: Date };
  const drafts: Draft[] = [];
  const skipStructure = isJoiningMonth && policy === "NEXT_MONTH";
  for (const item of ctx.feeStructure?.items ?? []) {
    if (skipStructure) break;
    if (item.applicableMonths.length > 0 && !item.applicableMonths.includes(month)) continue;
    let amount = Number(item.amount);
    if (isJoiningMonth && policy === "PRORATED" && item.frequency === "MONTHLY") {
      const activeDays = daysInMonth - admission!.getDate() + 1;
      amount = Math.round((amount / daysInMonth) * activeDays);
    }
    drafts.push({
      feeHeadId: item.feeHeadId,
      feeStructureItemId: item.id,
      headName: item.feeHead?.name ?? "Fee",
      code: item.feeHead?.code ?? "FEE",
      amount,
      dueDate: new Date(year, month - 1, Math.min(item.dueDateDay ?? 10, daysInMonth)),
    });
  }

  const transport = transportFeeForMonth(ctx.transportAssignments, year, month);
  if (transport > 0) {
    drafts.push({
      feeHeadId: ctx.transportHead.id,
      feeStructureItemId: null,
      headName: ctx.transportHead.name,
      code: ctx.transportHead.code,
      amount: transport,
      dueDate: new Date(year, month - 1, 10),
    });
  }

  if (drafts.length === 0) {
    return empty(ctx.feeStructure ? "No fee is configured for this month" : "No fee structure is set up for this class");
  }

  const concessions = applyConcessions(
    ctx.concessions,
    month,
    year,
    drafts.map((d) => ({ feeHeadId: d.feeHeadId, headName: d.headName, code: d.code, amount: d.amount }))
  );
  const lines: BillLine[] = drafts.map((d) => {
    const mine = concessions.filter((c) => c.feeHeadId === d.feeHeadId);
    const discount = Math.min(d.amount, mine.reduce((s, c) => s + c.amount, 0));
    return {
      feeHeadId: d.feeHeadId,
      feeStructureItemId: d.feeStructureItemId,
      headName: d.headName,
      code: d.code,
      baseAmount: d.amount,
      discountAmount: discount,
      netAmount: Math.max(0, d.amount - discount),
      dueDate: d.dueDate,
      concessions: mine,
    };
  });
  return {
    month,
    year,
    periodCode,
    eligible: true,
    lines,
    baseTotal: lines.reduce((s, l) => s + l.baseAmount, 0),
    discountTotal: lines.reduce((s, l) => s + l.discountAmount, 0),
    total: lines.reduce((s, l) => s + l.netAmount, 0),
  };
};

// Creates the month's charges (one per fee head, skipping heads already billed) with their
// concession adjustments, then creates/updates the month's Invoice. Run inside a transaction.
// appliedByUserId is who billed it; scheduled runs (no user) record the super admin.
export const billMonth = async (tx: any, ctx: BillingContext, bill: MonthBill, appliedByUserId?: number | null) => {
  if (!bill.eligible) return { created: [] as any[], invoice: null };
  const { student, sessionId } = ctx;
  const billedBy =
    appliedByUserId ?? (await tx.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
  const existing = await tx.feeCharge.findMany({
    where: { studentId: student.id, sessionId, billingYear: bill.year, billingMonth: bill.month },
  });
  const created: any[] = [];
  for (const line of bill.lines) {
    if (existing.some((c: any) => c.feeHeadId === line.feeHeadId)) continue;
    const charge = await tx.feeCharge.create({
      data: {
        studentId: student.id,
        feeHeadId: line.feeHeadId,
        feeStructureItemId: line.feeStructureItemId,
        sessionId,
        billingMonth: bill.month,
        billingYear: bill.year,
        dueDate: line.dueDate,
        baseAmount: line.baseAmount,
        discountAmount: line.discountAmount,
        lateFeeAmount: 0,
        netAmount: line.netAmount,
        paidAmount: 0,
        status: line.netAmount > 0 ? "UNPAID" : "PAID",
      },
    });
    for (const c of line.concessions) {
      await tx.feeAdjustment.create({
        data: {
          studentId: student.id,
          feeChargeId: charge.id,
          studentConcessionId: c.studentConcessionId ?? null,
          type: c.type,
          calculationType: "FIXED_AMOUNT", // the rule is resolved to an amount at billing time
          value: c.amount,
          amount: c.amount,
          reason: c.reason,
          appliedByUserId: billedBy,
        },
      });
    }
    created.push(charge);
  }
  const invoice = await syncMonthInvoice(tx, student, sessionId, bill.month, bill.year);
  return { created, invoice };
};

// Keeps the month's Invoice (fee bill) in step with its charges: creates it if missing, adds
// any charge not on it yet, and refreshes the totals and status.
export const syncMonthInvoice = async (tx: any, student: { id: number; admissionNo: string }, sessionId: number, month: number, year: number) => {
  const charges = await tx.feeCharge.findMany({
    where: { studentId: student.id, sessionId, billingYear: year, billingMonth: month, status: { notIn: ["CANCELLED", "VOID"] } },
    include: { feeHead: true },
  });
  if (charges.length === 0) return null;
  const periodCode = periodCodeFor(month, year);
  const sum = (f: (c: any) => number) => charges.reduce((s: number, c: any) => s + f(c), 0);
  const totals = {
    totalBaseAmount: sum((c) => Number(c.baseAmount)),
    totalDiscountAmount: sum((c) => Number(c.discountAmount)),
    totalLateFeeAmount: sum((c) => Number(c.lateFeeAmount)),
    totalAmount: sum((c) => Number(c.netAmount)),
    paidAmount: sum((c) => Number(c.paidAmount)),
  };
  const status = totals.paidAmount >= totals.totalAmount ? "PAID" : totals.paidAmount > 0 ? "PARTIALLY_PAID" : "ISSUED";
  const dueDate = charges.reduce((d: Date, c: any) => (c.dueDate < d ? c.dueDate : d), charges[0].dueDate);

  let invoice = await tx.invoice.findUnique({
    where: { studentId_collectionPeriodCode_sessionId: { studentId: student.id, collectionPeriodCode: periodCode, sessionId } },
    include: { items: true },
  });
  if (!invoice) {
    invoice = await tx.invoice.create({
      data: {
        invoiceNumber: `INV-${year}-${String(month).padStart(2, "0")}-${student.admissionNo}`,
        studentId: student.id,
        sessionId,
        collectionPeriodCode: periodCode,
        issueDate: new Date(),
        dueDate,
        ...totals,
        status,
        notes: `${MONTH_NAMES[month - 1]} ${year} fee bill`,
      },
      include: { items: true },
    });
  } else {
    invoice = await tx.invoice.update({ where: { id: invoice.id }, data: { ...totals, status, dueDate }, include: { items: true } });
  }
  const onInvoice = new Set(invoice.items.map((i: any) => i.feeChargeId));
  for (const c of charges) {
    if (onInvoice.has(c.id)) continue;
    await tx.invoiceItem.create({
      data: { invoiceId: invoice.id, feeChargeId: c.id, amount: c.baseAmount, description: `${c.feeHead.name} - ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}` },
    });
  }
  return invoice;
};

// Convenience for a single student-month outside an existing transaction.
export const billStudentMonth = async (studentId: number, sessionId: number, month: number, year: number, appliedByUserId: number) => {
  const ctx = await loadBillingContext(prisma, studentId, sessionId);
  const bill = computeMonthBill(ctx, month, year);
  if (!bill.eligible) return { bill, created: [], invoice: null };
  const result = await prisma.$transaction((tx: any) => billMonth(tx, ctx, bill, appliedByUserId));
  return { bill, ...result };
};
