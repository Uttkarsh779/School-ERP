import { prisma } from "../../config/prisma";
import { withLateFees } from "./lateFeeService";
import { ChargeStatus, PaymentStatus } from "../../generated/prisma/enums";

export const getStudentLedger = async (studentId: number) => {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { classSection: true },
  });

  // Fetch all charges (Debit), with late fees from the configured rule (lateFeeService)
  const charges = await prisma.feeCharge.findMany({
    where: { studentId },
    include: { feeHead: true },
    orderBy: { createdAt: "asc" },
  });
  const lateFees = new Map(
    (await withLateFees(prisma, charges as any[])).map((r: any) => [r.charge.id, r.lateFee])
  );

  // Fetch all payments (Credit)
  const payments = await prisma.payment.findMany({
    where: { studentId, status: PaymentStatus.SUCCESS },
    include: { allocations: { include: { feeCharge: { include: { feeHead: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  // Fetch all adjustments / discounts (Credit)
  const adjustments = await prisma.feeAdjustment.findMany({
    where: { studentId },
    orderBy: { createdAt: "asc" },
  });

  // Fetch all refunds (Debit)
  const refunds = await prisma.refund.findMany({
    where: { studentId, status: "REFUND_PROCESSED" },
    orderBy: { createdAt: "asc" },
  });

  // Combine into single chronological timeline
  type LedgerEntry = {
    date: Date;
    description: string;
    type: "CHARGE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";
    debit: number;
    credit: number;
    balance: number;
    referenceNo?: string;
  };

  const timeline: Array<Omit<LedgerEntry, "balance">> = [];

  charges.forEach((c: any) => {
    timeline.push({
      date: c.createdAt,
      description: `${c.feeHead.name} (${c.billingMonth}/${c.billingYear})`,
      type: "CHARGE",
      // Number() on each Decimal: `decimal + decimal` concatenates strings in JS.
      debit: Number(c.baseAmount) + (lateFees.get(c.id) ?? Number(c.lateFeeAmount)),
      credit: 0,
    });
    // Discounts stored directly on the charge (concessions applied at billing).
    if (Number(c.discountAmount) > 0) {
      timeline.push({
        date: c.createdAt,
        description: `Discount on ${c.feeHead.name} (${c.billingMonth}/${c.billingYear})`,
        type: "ADJUSTMENT",
        debit: 0,
        credit: Number(c.discountAmount),
      });
    }
  });

  payments.forEach((p: any) => {
    timeline.push({
      date: p.paidAt || p.createdAt,
      description: `Payment Received (${p.mode}) - Receipt: ${p.receiptNumber || p.paymentNumber}`,
      type: "PAYMENT",
      debit: 0,
      credit: Number(p.amount),
      referenceNo: p.receiptNumber || p.razorpayPaymentId || undefined,
      paymentId: p.id,
    } as any);
  });

  // Adjustments tied to a charge are already reflected in that charge's discount (or late
  // fee) above; only charge-less adjustments are separate credits here.
  adjustments
    .filter((a: any) => !a.feeChargeId)
    .forEach((a: any) => {
      timeline.push({
        date: a.createdAt,
        description: `Discount/Adjustment: ${a.type} (${a.reason})`,
        type: "ADJUSTMENT",
        debit: 0,
        credit: Number(a.amount),
      });
    });

  refunds.forEach((r: any) => {
    timeline.push({
      date: r.processedAt || r.createdAt,
      description: `Refund Processed: ${r.reason}`,
      type: "REFUND",
      debit: Number(r.amount),
      credit: 0,
      referenceNo: r.refundNumber,
    });
  });

  // Sort chronologically by date
  timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Compute running balance
  let runningBalance = 0;
  const ledgerEntries: LedgerEntry[] = timeline.map((entry) => {
    runningBalance += entry.debit - entry.credit;
    return {
      ...entry,
      balance: runningBalance,
    };
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      classSection: `${student.classSection.className} - ${student.classSection.section}`,
    },
    entries: ledgerEntries,
    finalBalance: runningBalance,
  };
};

export const getCollectionReport = async (startDate?: Date, endDate?: Date) => {
  const payments = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.SUCCESS,
      paidAt: {
        gte: startDate ?? undefined,
        lte: endDate ?? undefined,
      },
    },
    include: {
      student: { include: { classSection: true } },
    },
    orderBy: { paidAt: "desc" },
  });

  const totalCollected = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const byMode = payments.reduce((acc: Record<string, number>, p: any) => {
    acc[p.mode] = (acc[p.mode] || 0) + Number(p.amount);
    return acc;
  }, {} as Record<string, number>);

  return {
    totalCollected,
    totalCount: payments.length,
    byMode,
    payments,
  };
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A defaulter has at least one charge PAST its due date that isn't fully paid.
export const getDefaultersReport = async (classSectionId?: number) => {
  const now = new Date();
  const overdue = { status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] }, dueDate: { lt: now } };
  const studentsWithDues = await prisma.student.findMany({
    where: {
      classSectionId: classSectionId ?? undefined,
      isActive: true,
      feeCharges: { some: overdue },
    },
    include: {
      classSection: true,
      feeCharges: {
        where: overdue,
        include: { feeHead: true },
      },
    },
  });

  // Outstanding incl. late fees, computed by lateFeeService (Decimal-safe).
  const allCharges = studentsWithDues.flatMap((s: any) => s.feeCharges);
  const outstandingById = new Map(
    (await withLateFees(prisma, allCharges as any[])).map((r: any) => [r.charge.id, r.outstanding])
  );

  return studentsWithDues.map((s: any) => {
    const totalDue = s.feeCharges.reduce((sum: number, c: any) => sum + (outstandingById.get(c.id) ?? 0), 0);
    const oldestDue = s.feeCharges.reduce(
      (min: Date | null, c: any) => (!min || c.dueDate < min ? c.dueDate : min),
      null as Date | null
    );

    return {
      studentId: s.id,
      studentName: s.name,
      admissionNo: s.admissionNo,
      rollNo: s.rollNo,
      classSectionId: s.classSectionId,
      classSection: `${s.classSection.className} - ${s.classSection.section}`,
      contactNumber: s.contactNumber || s.fatherContact || s.motherContact,
      fatherName: s.fatherName ?? null,
      // Months with overdue fees, oldest first (e.g. ["Apr 2026", "May 2026"]) — for the printed list.
      overdueMonths: [...new Set(
        [...s.feeCharges]
          .sort((a: any, b: any) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth)
          .map((c: any) => `${MONTH_SHORT[c.billingMonth - 1]} ${c.billingYear}`)
      )],
      overdueChargesCount: s.feeCharges.length,
      totalDue,
      oldestDueDate: oldestDue,
      daysOverdue: oldestDue ? Math.floor((now.getTime() - new Date(oldestDue).getTime()) / 86_400_000) : 0,
    };
  });
};

export const createAuditLog = async (data: {
  action: string;
  entityType: string;
  entityId: number;
  userId: number;
  oldValues?: any;
  newValues?: any;
}) => {
  return prisma.feeAuditLog.create({
    data: {
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      userId: data.userId,
      oldValues: data.oldValues ? JSON.stringify(data.oldValues) : null,
      newValues: data.newValues ? JSON.stringify(data.newValues) : null,
    },
  });
};

export const getAuditLogs = async () => {
  return prisma.feeAuditLog.findMany({
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
};
