import { prisma } from "../../config/prisma";
import { ChargeStatus, PaymentStatus } from "../../generated/prisma/enums";

export const getStudentLedger = async (studentId: number) => {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { classSection: true },
  });

  // Fetch all charges (Debit)
  const charges = await prisma.feeCharge.findMany({
    where: { studentId },
    include: { feeHead: true },
    orderBy: { createdAt: "asc" },
  });

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
      debit: c.baseAmount + c.lateFeeAmount,
      credit: 0,
    });
  });

  payments.forEach((p: any) => {
    timeline.push({
      date: p.paidAt || p.createdAt,
      description: `Payment Received (${p.mode}) - Receipt: ${p.receiptNumber || p.paymentNumber}`,
      type: "PAYMENT",
      debit: 0,
      credit: p.amount,
      referenceNo: p.receiptNumber || p.razorpayPaymentId || undefined,
    });
  });

  adjustments.forEach((a: any) => {
    timeline.push({
      date: a.createdAt,
      description: `Discount/Adjustment: ${a.type} (${a.reason})`,
      type: "ADJUSTMENT",
      debit: 0,
      credit: a.amount,
    });
  });

  refunds.forEach((r: any) => {
    timeline.push({
      date: r.processedAt || r.createdAt,
      description: `Refund Processed: ${r.reason}`,
      type: "REFUND",
      debit: r.amount,
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

export const getDefaultersReport = async (classSectionId?: number) => {
  const studentsWithDues = await prisma.student.findMany({
    where: {
      classSectionId: classSectionId ?? undefined,
      isActive: true,
      feeCharges: {
        some: { status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] } },
      },
    },
    include: {
      classSection: true,
      feeCharges: {
        where: { status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] } },
        include: { feeHead: true },
      },
    },
  });

  return studentsWithDues.map((s: any) => {
    const totalDue = s.feeCharges.reduce((sum: number, c: any) => {
      const net = c.baseAmount - c.discountAmount + c.lateFeeAmount;
      return sum + (net - c.paidAmount);
    }, 0);

    return {
      studentId: s.id,
      studentName: s.name,
      admissionNo: s.admissionNo,
      rollNo: s.rollNo,
      classSectionId: s.classSectionId,
      classSection: `${s.classSection.className} - ${s.classSection.section}`,
      contactNumber: s.contactNumber || s.fatherContact || s.motherContact,
      overdueChargesCount: s.feeCharges.length,
      totalDue,
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
    include: { user: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
};
