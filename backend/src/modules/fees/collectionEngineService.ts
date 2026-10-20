import { prisma } from "../../config/prisma";
import type { ChargeStatus, FeeMode, InvoiceStatus } from "../../generated/prisma/enums";
import { billMonth, computeMonthBill, loadBillingContext, type BillingContext } from "./billingService";

export interface ICollectionPeriodInfo {
  code: string;
  name: string;
  billingMonth: number;
  billingYear: number;
  startDate: Date;
  dueDate: Date;
}

export interface IStudentBillCalculation {
  studentId: number;
  studentName: string;
  admissionNo: string;
  className: string;
  isEligible: boolean;
  ineligibilityReason?: string;
  alreadyBilled: boolean;
  existingInvoiceId?: number;
  currentFeeAmount: number;
  lineItems: Array<{ headName: string; code: string; amount: number }>;
  previousDueAmount: number;
  lateFeeAmount: number;
  totalPayableAmount: number;
  dueDate: Date;
}

export interface ICollectionPeriodResult {
  collectionPeriodCode: string;
  totalEligible: number;
  alreadyBilled: number;
  newlyGenerated: number;
  duplicatesSkipped: number;
  errors: number;
  expectedAmount: number;
  details: IStudentBillCalculation[];
}

export interface ICollectionDashboardOverview {
  collectionPeriodCode: string;
  collectionPeriodName: string;
  startDate: Date;
  dueDate: Date;
  eligibleStudents: number;
  feeBillsGenerated: number;
  paidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  overdueCount: number;
  expectedCollectionAmount: number;
  collectedAmount: number;
  remainingAmount: number;
}

// 1. Helper to resolve collection period configuration
export const getCollectionPeriodInfo = (
  month: number = new Date().getMonth() + 1,
  year: number = new Date().getFullYear()
): ICollectionPeriodInfo => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[month - 1] || "August";
  const code = `${monthName.substring(0, 3).toUpperCase()}_${year}`;
  const startDate = new Date(year, month - 1, 1);
  const dueDate = new Date(year, month - 1, 10);

  return {
    code,
    name: `${monthName} ${year}`,
    billingMonth: month,
    billingYear: year,
    startDate,
    dueDate,
  };
};

// 2. Student eligibility checker
export const checkStudentEligibility = (
  student: any,
  periodInfo: ICollectionPeriodInfo
): { isEligible: boolean; reason?: string } => {
  if (student.isActive !== true) {
    return { isEligible: false, reason: "Student is not currently Active (Withdrawn / Graduated)" };
  }

  if (student.admissionDate && new Date(student.admissionDate) > new Date(periodInfo.startDate.valueOf() + 30 * 86400000)) {
    return { isEligible: false, reason: "Admission date is after this collection period" };
  }

  return { isEligible: true };
};

// 3. Exact Fee Calculation engine (used identically by preview & persistence). The bill
// itself comes from billingService, the same rules every other billing path uses.
export const calculateStudentCollectionBill = async (
  studentId: number,
  periodInfo: ICollectionPeriodInfo,
  sessionId: number,
  ctx?: BillingContext
): Promise<IStudentBillCalculation> => {
  const billing = ctx ?? (await loadBillingContext(prisma, studentId, sessionId));
  const student = billing.student;
  const bill = computeMonthBill(billing, periodInfo.billingMonth, periodInfo.billingYear);
  const className = student.classSection
    ? `${student.classSection.className} - ${student.classSection.section}`
    : "Unassigned";

  // Check if Invoice already issued for this student & collection period
  const existingInvoice = await prisma.invoice.findFirst({
    where: { studentId, sessionId, collectionPeriodCode: periodInfo.code },
  });

  // Fee heads first, then each concession as a negative line.
  const lineItems: Array<{ feeHeadId: number; headName: string; code: string; amount: number; isConcession?: boolean }> = [
    ...bill.lines.map((l) => ({ feeHeadId: l.feeHeadId, headName: l.headName, code: l.code, amount: l.baseAmount })),
    ...bill.lines.flatMap((l) =>
      l.concessions.map((c) => ({ feeHeadId: c.feeHeadId, headName: c.reason, code: c.type, amount: -c.amount, isConcession: true }))
    ),
  ];
  const currentFeeAmount = bill.total;

  // Calculate Previous Outstanding Dues separately
  const previousUnpaidCharges = await prisma.feeCharge.aggregate({
    where: {
      studentId,
      sessionId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      NOT: {
        billingMonth: periodInfo.billingMonth,
        billingYear: periodInfo.billingYear,
      },
    },
    _sum: {
      netAmount: true,
      paidAmount: true,
    },
  });

  const prevNet = Number(previousUnpaidCharges._sum.netAmount || 0);
  const prevPaid = Number(previousUnpaidCharges._sum.paidAmount || 0);
  const previousDueAmount = Math.max(0, prevNet - prevPaid);

  const lateFeeAmount = 0; // Late fee starts at 0 on day 1
  const totalPayableAmount = currentFeeAmount + previousDueAmount + lateFeeAmount;

  return {
    studentId,
    studentName: student.name,
    admissionNo: student.admissionNo,
    className,
    isEligible: bill.eligible,
    ineligibilityReason: bill.reason,
    alreadyBilled: Boolean(existingInvoice),
    existingInvoiceId: existingInvoice?.id,
    currentFeeAmount,
    lineItems,
    previousDueAmount,
    lateFeeAmount,
    totalPayableAmount,
    dueDate: bill.lines.reduce((d: Date, l) => (l.dueDate < d ? l.dueDate : d), periodInfo.dueDate),
  };
};

export const previewCollectionPeriod = async (data: {
  sessionId?: number;
  billingMonth?: number;
  billingYear?: number;
  classSectionId?: number;
  studentIds?: number[];
}): Promise<ICollectionPeriodResult> => {
  const session = data.sessionId
    ? await prisma.academicSession.findUnique({ where: { id: data.sessionId } })
    : await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const activeSessionId = session?.id || 1;
  const periodInfo = getCollectionPeriodInfo(data.billingMonth, data.billingYear);

  let studentWhere: any = {};
  if (data.studentIds && data.studentIds.length > 0) {
    studentWhere.id = { in: data.studentIds };
  } else if (data.classSectionId) {
    studentWhere.classSectionId = data.classSectionId;
  }

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true },
  });

  const details: IStudentBillCalculation[] = [];
  let totalEligible = 0;
  let alreadyBilled = 0;
  let newlyGenerated = 0;
  let expectedAmount = 0;

  for (const s of students) {
    const calc = await calculateStudentCollectionBill(s.id, periodInfo, activeSessionId);
    details.push(calc);

    if (calc.isEligible) {
      totalEligible++;
      if (calc.alreadyBilled) {
        alreadyBilled++;
      } else {
        newlyGenerated++;
        expectedAmount += calc.totalPayableAmount;
      }
    }
  }

  return {
    collectionPeriodCode: periodInfo.code,
    totalEligible,
    alreadyBilled,
    newlyGenerated,
    duplicatesSkipped: 0,
    errors: 0,
    expectedAmount,
    details,
  };
};

// 5. Idempotent & Concurrency-Safe Generation Service
export const generateCollectionPeriodBills = async (data: {
  sessionId?: number;
  billingMonth?: number;
  billingYear?: number;
  classSectionId?: number;
  studentIds?: number[];
  appliedByUserId?: number;
}): Promise<ICollectionPeriodResult> => {
  const session = data.sessionId
    ? await prisma.academicSession.findUnique({ where: { id: data.sessionId } })
    : await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const activeSessionId = session?.id || 1;
  const periodInfo = getCollectionPeriodInfo(data.billingMonth, data.billingYear);

  let studentWhere: any = { isActive: true };
  if (data.studentIds && data.studentIds.length > 0) {
    studentWhere.id = { in: data.studentIds };
  } else if (data.classSectionId) {
    studentWhere.classSectionId = data.classSectionId;
  }

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: { id: true },
  });

  const details: IStudentBillCalculation[] = [];
  let totalEligible = 0;
  let alreadyBilledCount = 0;
  let newlyGeneratedCount = 0;
  let duplicatesSkippedCount = 0;
  let errorsCount = 0;
  let expectedAmount = 0;

  for (const s of students) {
    try {
      const ctx = await loadBillingContext(prisma, s.id, activeSessionId);
      const calc = await calculateStudentCollectionBill(s.id, periodInfo, activeSessionId, ctx);
      details.push(calc);

      if (!calc.isEligible) continue;
      totalEligible++;

      if (calc.alreadyBilled) {
        alreadyBilledCount++;
        continue;
      }

      // Per-head charges + the month's invoice, exactly as every other billing path creates them.
      const bill = computeMonthBill(ctx, periodInfo.billingMonth, periodInfo.billingYear);
      await prisma.$transaction((tx: any) => billMonth(tx, ctx, bill, data.appliedByUserId ?? null));
      newlyGeneratedCount++;
      expectedAmount += calc.totalPayableAmount;
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Unique constraint hit = duplicate safely prevented by database
        duplicatesSkippedCount++;
      } else {
        errorsCount++;
      }
    }
  }

  return {
    collectionPeriodCode: periodInfo.code,
    totalEligible,
    alreadyBilled: alreadyBilledCount,
    newlyGenerated: newlyGeneratedCount,
    duplicatesSkipped: duplicatesSkippedCount,
    errors: errorsCount,
    expectedAmount,
    details,
  };
};

// 6. Student-Centric Dashboard Overview
export const getCollectionDashboardOverview = async (
  month: number = new Date().getMonth() + 1,
  year: number = new Date().getFullYear(),
  sessionId?: number
): Promise<ICollectionDashboardOverview> => {
  const periodInfo = getCollectionPeriodInfo(month, year);
  const activeSession = sessionId
    ? await prisma.academicSession.findUnique({ where: { id: sessionId } })
    : await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const activeSessionId = activeSession?.id || 1;

  const eligibleStudentsCount = await prisma.student.count({
    where: { isActive: true },
  });

  const invoices = await prisma.invoice.findMany({
    where: {
      sessionId: activeSessionId,
      collectionPeriodCode: periodInfo.code,
    },
  });

  const feeBillsGenerated = invoices.length;
  let paidCount = 0;
  let partiallyPaidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let expectedCollectionAmount = 0;
  let collectedAmount = 0;

  for (const inv of invoices) {
    const tot = Number(inv.totalAmount);
    const pd = Number(inv.paidAmount);
    expectedCollectionAmount += tot;
    collectedAmount += pd;

    if (inv.status === "PAID" || pd >= tot) {
      paidCount++;
    } else if (inv.status === "PARTIALLY_PAID" || pd > 0) {
      partiallyPaidCount++;
    } else if (new Date(inv.dueDate) < new Date()) {
      overdueCount++;
    } else {
      pendingCount++;
    }
  }

  const remainingAmount = Math.max(0, expectedCollectionAmount - collectedAmount);

  return {
    collectionPeriodCode: periodInfo.code,
    collectionPeriodName: periodInfo.name,
    startDate: periodInfo.startDate,
    dueDate: periodInfo.dueDate,
    eligibleStudents: eligibleStudentsCount,
    feeBillsGenerated,
    paidCount,
    partiallyPaidCount,
    pendingCount,
    overdueCount,
    expectedCollectionAmount,
    collectedAmount,
    remainingAmount,
  };
};
