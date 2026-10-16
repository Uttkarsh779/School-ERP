import { prisma } from "../../config/prisma";
import { ChargeStatus, InvoiceStatus } from "../../generated/prisma/enums";
import { calculateTransportFeeForPeriod } from "../transport/transportVillageService";

export const generateInvoiceNumber = async (): Promise<string> => {
  const count = await prisma.invoice.count();
  const year = new Date().getFullYear();
  return `INV-${year}-${(count + 1).toString().padStart(6, "0")}`;
};

export const createInvoiceForCharges = async (data: {
  studentId: number;
  sessionId: number;
  chargeIds: number[];
  notes?: string;
}) => {
  const { studentId, sessionId, chargeIds, notes } = data;

  const charges = await prisma.feeCharge.findMany({
    where: {
      id: { in: chargeIds },
      studentId,
    },
    include: {
      feeHead: true,
    },
  });

  if (charges.length === 0) {
    throw new Error("No valid fee charges selected for invoice generation");
  }

  let totalBaseAmount = 0;
  let totalDiscountAmount = 0;
  let totalLateFeeAmount = 0;
  let totalAmount = 0;
  let maxDueDate = new Date();

  const itemsData = charges.map((charge: any) => {
    const base = Number(charge.baseAmount);
    const disc = Number(charge.discountAmount);
    const late = Number(charge.lateFeeAmount);
    const paid = Number(charge.paidAmount);
    const net = base - disc + late;
    const remaining = Math.max(0, net - paid);

    totalBaseAmount += base;
    totalDiscountAmount += disc;
    totalLateFeeAmount += late;
    totalAmount += remaining;

    if (charge.dueDate > maxDueDate) {
      maxDueDate = charge.dueDate;
    }

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthStr = monthNames[charge.billingMonth - 1] || charge.billingMonth;
    const description = `${charge.feeHead.name} - ${monthStr} ${charge.billingYear}`;

    return {
      feeChargeId: charge.id,
      amount: remaining,
      description,
    };
  });

  const invoiceNumber = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      studentId,
      sessionId,
      dueDate: maxDueDate,
      totalBaseAmount,
      totalDiscountAmount,
      totalLateFeeAmount,
      totalAmount,
      paidAmount: 0,
      status: InvoiceStatus.ISSUED,
      notes,
      items: {
        create: itemsData,
      },
    },
    include: {
      items: {
        include: {
          feeCharge: {
            include: {
              feeHead: true,
            },
          },
        },
      },
      student: true,
    },
  });
};

export const listInvoices = async (filters: {
  studentId?: number;
  sessionId?: number;
  status?: InvoiceStatus;
}) => {
  return prisma.invoice.findMany({
    where: {
      studentId: filters.studentId ?? undefined,
      sessionId: filters.sessionId ?? undefined,
      status: filters.status ?? undefined,
    },
    include: {
      student: {
        include: {
          classSection: true,
        },
      },
      items: {
        include: {
          feeCharge: {
            include: {
              feeHead: true,
            },
          },
        },
      },
      dueDateLogs: {
        include: { changedByUser: true },
        orderBy: { timestamp: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getInvoiceById = async (id: number) => {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          classSection: true,
        },
      },
      items: {
        include: {
          feeCharge: {
            include: {
              feeHead: true,
            },
          },
        },
      },
      dueDateLogs: {
        include: { changedByUser: true },
        orderBy: { timestamp: "desc" },
      },
    },
  });
};

export const extendInvoiceDueDate = async (data: {
  invoiceId: number;
  newDueDate: Date;
  changedByUserId: number;
  reason?: string;
}) => {
  const { invoiceId, newDueDate, changedByUserId, reason } = data;

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });

  const oldDueDate = invoice.dueDate;
  const updatedDueDate = new Date(newDueDate);

  // Execute in transaction: update Invoice due date + record DueDateAuditLog
  return prisma.$transaction(async (tx: any) => {
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: { dueDate: updatedDueDate },
      include: { items: true },
    });

    await tx.dueDateAuditLog.create({
      data: {
        invoiceId,
        oldDueDate,
        newDueDate: updatedDueDate,
        changedByUserId,
        reason: reason ?? "Admin due date extension",
      },
    });

    // Check if status should update from OVERDUE to ISSUED if new due date is in the future
    const now = new Date();
    if (now <= updatedDueDate && updatedInvoice.status === InvoiceStatus.OVERDUE) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.ISSUED },
      });
    }

    return updatedInvoice;
  });
};

export const previewInvoiceForStudent = async (data: {
  studentId: number;
  sessionId: number;
  billingMonth: number;
  billingYear: number;
}) => {
  const { studentId, sessionId, billingMonth, billingYear } = data;

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      classSection: true,
      feeAdjustments: true,
      feeCharges: {
        where: {
          status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] },
        },
        include: { feeHead: true },
      },
    },
  });

  // Base structures
  const structures = await prisma.feeStructure.findMany({
    where: {
      sessionId,
      OR: [{ classSectionId: student.classSectionId }, { classSectionId: null }],
    },
    include: {
      items: { include: { feeHead: true } },
    },
  });

  const currentChargesItems: Array<{ feeHead: string; amount: number }> = [];
  let currentChargesTotal = 0;

  for (const s of structures) {
    for (const item of s.items) {
      if (item.applicableMonths.includes(billingMonth)) {
        const amt = Number(item.amount);
        currentChargesItems.push({ feeHead: item.feeHead.name, amount: amt });
        currentChargesTotal += amt;
      }
    }
  }

  // Transport
  const transportFee = await calculateTransportFeeForPeriod(studentId, billingYear, billingMonth);
  if (transportFee > 0) {
    currentChargesItems.push({ feeHead: "Transport Fee", amount: transportFee });
    currentChargesTotal += transportFee;
  }

  // Discounts
  const discountsTotal = student.feeAdjustments.reduce((sum: number, a: any) => sum + Number(a.amount), 0);

  // Arrears (Previous dues from earlier billing periods)
  const previousOutstanding = student.feeCharges
    .filter((c: any) => c.billingYear < billingYear || (c.billingYear === billingYear && c.billingMonth < billingMonth))
    .reduce((sum: number, c: any) => sum + (Number(c.netAmount) - Number(c.paidAmount)), 0);

  // Late fees
  const lateFees = 0;
  const netCurrent = Math.max(0, currentChargesTotal - discountsTotal);
  const totalPayable = netCurrent + previousOutstanding + lateFees;

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const monthStr = monthNames[billingMonth - 1] || billingMonth;

  return {
    isPreview: true,
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      classSection: `${student.classSection.className} - ${student.classSection.section}`,
    },
    billingPeriod: `${monthStr} ${billingYear}`,
    currentCharges: {
      items: currentChargesItems,
      subtotal: currentChargesTotal,
      discounts: discountsTotal,
      netCurrent,
    },
    previousOutstanding,
    lateFees,
    totalPayable,
    dueDate: `10-${monthStr}-${billingYear}`,
  };
};
