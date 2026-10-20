import { prisma } from "../../config/prisma";
import { persistAccruedLateFees, receiptNumberFor, withLateFees } from "./lateFeeService";
import {
  AdvanceStatus,
  ChargeStatus,
  FeeMode,
  InvoiceStatus,
  PaymentStatus,
  TransportAssignmentStatus,
} from "../../generated/prisma/enums";
import { billMonth, computeMonthBill, loadBillingContext } from "./billingService";
import { classSectionForSession } from "../sessions/enrollmentService";

export interface IHeadWaiverInput {
  chargeId?: number;
  feeHeadId?: number;
  headName?: string;
  waiverAmount: number;
  reason: string;
}

export interface ISelectedMonthInput {
  month: number;
  year: number;
  headWaivers?: IHeadWaiverInput[];
}

export interface ILumpSumDiscountInput {
  type: "FIXED_AMOUNT" | "PERCENTAGE";
  value: number;
  reason: string;
}

export interface IMultiMonthPaymentInput {
  studentId: number;
  sessionId?: number;
  selectedMonths: ISelectedMonthInput[];
  lumpSumDiscount?: ILumpSumDiscountInput;
  waiveLateFines?: boolean;
  paymentAmount: number;
  paymentMode: FeeMode;
  transactionRef?: string;
  notes?: string;
}

// Helper to get month name
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const getQuarterName = (month: number): string => {
  if (month >= 4 && month <= 6) return "Q1 (Apr-Jun)";
  if (month >= 7 && month <= 9) return "Q2 (Jul-Sep)";
  if (month >= 10 && month <= 12) return "Q3 (Oct-Dec)";
  return "Q4 (Jan-Mar)";
};

// Unpaid billed fees in sessions other than `sessionId`, grouped by session (incl. late fees).
export const getOtherSessionDues = async (studentId: number, session: { id: number; startDate: Date }) => {
  const sessionId = session.id;
  const charges = await prisma.feeCharge.findMany({
    where: { studentId, sessionId: { not: sessionId }, status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] } },
    include: { session: { select: { id: true, name: true, startDate: true } } },
    orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
  });
  if (charges.length === 0) return [];
  const computed = await withLateFees(prisma, charges as any[]);
  const bySession = new Map<number, { sessionId: number; sessionName: string; startDate: Date; outstanding: number; months: string[] }>();
  for (const { charge, outstanding } of computed as any[]) {
    if (outstanding <= 0) continue;
    const row = bySession.get(charge.sessionId) ?? { sessionId: charge.sessionId, sessionName: charge.session.name, startDate: charge.session.startDate, outstanding: 0, months: [] as string[] };
    row.outstanding = Math.round((row.outstanding + outstanding) * 100) / 100;
    const label = `${MONTH_NAMES[charge.billingMonth - 1].substring(0, 3)} ${charge.billingYear}`;
    if (!row.months.includes(label)) row.months.push(label);
    bySession.set(charge.sessionId, row);
  }
  return [...bySession.values()]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map(({ startDate, ...r }) => ({ ...r, isPrevious: new Date(startDate) < new Date(session.startDate) }));
};

/**
 * 1. Build 12-month visual academic calendar matrix for student
 */
export const getStudentMonthsChart = async (studentId: number, sessionId?: number) => {
  const session = sessionId
    ? await prisma.academicSession.findUnique({ where: { id: sessionId } })
    : await prisma.academicSession.findFirst({ where: { isCurrent: true } }) ||
      await prisma.academicSession.findFirst({ orderBy: { id: "desc" } });

  if (!session) {
    throw new Error("Academic session not found");
  }

  const activeSessionId = session.id;

  // Derive start year from session (e.g. "2026-27" -> 2026)
  let startYear = new Date(session.startDate).getFullYear();
  if (!startYear || isNaN(startYear)) {
    const match = session.name.match(/\d{4}/);
    startYear = match ? parseInt(match[0], 10) : new Date().getFullYear();
  }

  // 12 Academic Months in sequence: April to March
  const academicMonthConfigs = [
    { month: 4, year: startYear },
    { month: 5, year: startYear },
    { month: 6, year: startYear },
    { month: 7, year: startYear },
    { month: 8, year: startYear },
    { month: 9, year: startYear },
    { month: 10, year: startYear },
    { month: 11, year: startYear },
    { month: 12, year: startYear },
    { month: 1, year: startYear + 1 },
    { month: 2, year: startYear + 1 },
    { month: 3, year: startYear + 1 },
  ];

  // Fetch Student with class and active transport
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      classSection: true,
      transportAssignments: {
        where: { status: TransportAssignmentStatus.ACTIVE },
        include: { village: true },
      },
      advances: {
        where: { status: AdvanceStatus.AVAILABLE },
      },
    },
  });

  // Billing rules (structure, transport, concessions, admission month) — the same ones used
  // when the month is actually billed, so the projection matches the real bill.
  const billing = await loadBillingContext(prisma, studentId, activeSessionId);
  const feeStructure = billing.feeStructure;

  // Fee heads configured for this class (+ transport while the student uses the bus).
  const classFeeHeads: Array<{ feeHeadId: number; headName: string; headCode: string; amount: number }> = [];
  for (const item of feeStructure?.items ?? []) {
    if (!classFeeHeads.some((h) => h.feeHeadId === item.feeHeadId)) {
      classFeeHeads.push({
        feeHeadId: item.feeHeadId,
        headName: item.feeHead?.name || "Fee Head",
        headCode: item.feeHead?.code || "FEE",
        amount: Number(item.amount),
      });
    }
  }
  const activeTransport = student.transportAssignments?.[0];
  if (activeTransport?.village) {
    classFeeHeads.push({
      feeHeadId: billing.transportHead.id,
      headName: `Transport (${activeTransport.village.name})`,
      headCode: "TRANSPORT",
      amount: Number(activeTransport.village.monthlyFee || 0),
    });
  }

  // Fetch all existing FeeCharge records for this student in this session
  const existingCharges = await prisma.feeCharge.findMany({
    where: {
      studentId,
      sessionId: activeSessionId,
    },
    include: {
      feeHead: true,
      adjustments: true,
    },
    orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
  });

  // Fetch existing Invoices
  const existingInvoices = await prisma.invoice.findMany({
    where: {
      studentId,
      sessionId: activeSessionId,
    },
  });

  const now = new Date();

  // Late fees from the session's configured rule — same calculation as every other screen.
  const lateFeeById = new Map(
    (await withLateFees(prisma, existingCharges as any[], now)).map((r: any) => [r.charge.id, r.lateFee])
  );

  // With no fee structure for the class there is nothing to project — never invent amounts.
  const feeStructureMissing = classFeeHeads.length === 0;

  // Build month-by-month representation
  const monthsData = academicMonthConfigs.map((cfg) => {
    const { month, year } = cfg;
    const monthName = MONTH_NAMES[month - 1];
    const periodCode = `${monthName.substring(0, 3).toUpperCase()}_${year}`;
    const dueDate = new Date(year, month - 1, 10);
    const quarter = getQuarterName(month);

    // Find charges for this month & year
    const monthCharges = existingCharges.filter(
      (c) => c.billingMonth === month && c.billingYear === year
    );

    // Find invoice for this month
    const monthInvoice = existingInvoices.find(
      (inv) => inv.collectionPeriodCode === periodCode
    );

    if (monthCharges.length > 0) {
      let baseTotal = 0;
      let discountTotal = 0;
      let lateFeeTotal = 0;
      let paidTotal = 0;
      let netTotal = 0;
      let balanceTotal = 0;

      const heads = monthCharges.map((c) => {
        const base = Number(c.baseAmount);
        const disc = Number(c.discountAmount);
        const late = lateFeeById.get(c.id) ?? Number(c.lateFeeAmount);

        const net = Math.max(0, base - disc + late);
        const paid = Number(c.paidAmount);
        const bal = Math.max(0, net - paid);

        baseTotal += base;
        discountTotal += disc;
        lateFeeTotal += late;
        paidTotal += paid;
        netTotal += net;
        balanceTotal += bal;

        return {
          chargeId: c.id,
          feeHeadId: c.feeHeadId,
          headName: c.feeHead?.name || "Fee",
          headCode: c.feeHead?.code || "FEE",
          baseAmount: base,
          discountAmount: disc,
          lateFeeAmount: late,
          paidAmount: paid,
          netAmount: net,
          balanceDue: bal,
          status: c.status,
          isProjected: false,
        };
      });

      let status = "DUE";
      if (balanceTotal <= 0 && netTotal > 0) {
        status = "PAID";
      } else if (paidTotal > 0 && balanceTotal > 0) {
        status = "PARTIALLY_PAID";
      } else if (now > dueDate && balanceTotal > 0) {
        status = "OVERDUE";
      } else if (monthInvoice && monthInvoice.status === "PAID") {
        status = "PAID";
      }

      return {
        month,
        year,
        monthName,
        periodCode,
        quarter,
        dueDate,
        isBilled: true,
        status,
        baseAmount: baseTotal,
        discountAmount: discountTotal,
        lateFeeAmount: lateFeeTotal,
        paidAmount: paidTotal,
        netAmount: netTotal,
        balanceDue: balanceTotal,
        heads,
      };
    } else {
      // Not billed yet: project it with the billing rules (incl. concessions).
      const bill = computeMonthBill(billing, month, year);
      if (bill.notEnrolled) {
        return {
          month,
          year,
          monthName,
          periodCode,
          quarter,
          dueDate,
          isBilled: false,
          status: "NOT_APPLICABLE",
          statusReason: bill.reason,
          baseAmount: 0,
          discountAmount: 0,
          lateFeeAmount: 0,
          paidAmount: 0,
          netAmount: 0,
          balanceDue: 0,
          heads: [],
        };
      }
      const projectedHeads = bill.lines.map((l) => ({
        chargeId: null,
        feeHeadId: l.feeHeadId,
        headName: l.headName,
        headCode: l.code,
        baseAmount: l.baseAmount,
        discountAmount: l.discountAmount,
        lateFeeAmount: 0,
        paidAmount: 0,
        netAmount: l.netAmount,
        balanceDue: l.netAmount,
        status: "UNBILLED",
        isProjected: true,
      }));

      return {
        month,
        year,
        monthName,
        periodCode,
        quarter,
        dueDate,
        isBilled: false,
        status: "UNBILLED",
        baseAmount: bill.baseTotal,
        discountAmount: bill.discountTotal,
        lateFeeAmount: 0,
        paidAmount: 0,
        netAmount: bill.total,
        balanceDue: bill.total,
        heads: projectedHeads,
      };
    }
  });

  // Calculate annual summary statistics
  const totalAnnualProjected = monthsData.reduce((acc, m) => acc + m.baseAmount, 0);
  const totalPaidSoFar = monthsData.reduce((acc, m) => acc + m.paidAmount, 0);
  const totalOverdue = monthsData
    .filter((m) => m.status === "OVERDUE")
    .reduce((acc, m) => acc + m.balanceDue, 0);
  const totalCurrentDue = monthsData
    .filter((m) => m.status === "DUE" || m.status === "PARTIALLY_PAID")
    .reduce((acc, m) => acc + m.balanceDue, 0);
  const totalUpcoming = monthsData
    .filter((m) => m.status === "UNBILLED")
    .reduce((acc, m) => acc + m.balanceDue, 0);

  const totalAdvanceAvailable = student.advances.reduce(
    (acc, a) => acc + Number(a.remainingAmount),
    0
  );

  // The class the student was in for this session (differs from today's class once promoted).
  const sessionClass = billing.student.classSection?.sessionId === activeSessionId
    ? billing.student.classSection
    : await classSectionForSession(prisma, student, activeSessionId);
  const otherSessionDues = await getOtherSessionDues(studentId, session);

  return {
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      classSectionId: student.classSectionId,
      classSection: sessionClass
        ? `${sessionClass.className} - ${sessionClass.section}`
        : "Unassigned",
      fatherName: student.fatherName || "Parent",
      contact: student.fatherContact || student.contactNumber || "",
    },
    session: {
      id: session.id,
      name: session.name,
      startYear,
      isCurrent: session.isCurrent,
    },
    months: monthsData,
    // Unpaid fees from other sessions (previous-year dues carried forward), so every fee
    // screen can show and collect them alongside this session.
    otherSessionDues,
    feeStructureMissing,
    classFeeHeads: classFeeHeads.map((h) => ({
      feeHeadId: h.feeHeadId,
      headName: h.headName,
      headCode: h.headCode,
      amount: h.amount,
    })),
    totals: {
      totalAnnualProjected,
      totalPaidSoFar,
      totalOverdue,
      totalCurrentDue,
      totalUpcoming,
      totalOutstanding: totalOverdue + totalCurrentDue,
      totalAdvanceAvailable,
    },
  };
};

/**
 * 2. Record Multi-Month Payment with Dual-Level Fee Waiver/Discount
 */
export const recordMultiMonthPayment = async (
  input: IMultiMonthPaymentInput,
  adminUserId: number
) => {
  const {
    studentId,
    sessionId,
    selectedMonths,
    lumpSumDiscount,
    waiveLateFines,
    paymentAmount,
    paymentMode,
    transactionRef,
    notes,
  } = input;

  if (!selectedMonths || selectedMonths.length === 0) {
    throw new Error("Please select at least one month for payment.");
  }

  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const session = sessionId
    ? await prisma.academicSession.findUnique({ where: { id: sessionId } })
    : await prisma.academicSession.findFirst({ where: { isCurrent: true } }) ||
      await prisma.academicSession.findFirst({ orderBy: { id: "desc" } });

  if (!session) {
    throw new Error("Academic session not found.");
  }

  const activeSessionId = session.id;

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        classSection: true,
        transportAssignments: {
          where: { status: TransportAssignmentStatus.ACTIVE },
          include: { village: true },
        },
      },
    });

    // Billing rules for any month that has to be billed now (advance payment).
    const billing = await loadBillingContext(tx, studentId, activeSessionId);

    const processedChargeIds: number[] = [];
    const clearedMonthsList: string[] = [];
    const discountsAppliedSummary: Array<{
      type: string;
      reason: string;
      amount: number;
      targetMonth?: string;
    }> = [];

    // STEP A: Ensure all selected months have FeeCharge & Invoice records
    for (const sm of selectedMonths) {
      const monthName = MONTH_NAMES[sm.month - 1];
      const periodCode = `${monthName.substring(0, 3).toUpperCase()}_${sm.year}`;
      const dueDate = new Date(sm.year, sm.month - 1, 10);
      clearedMonthsList.push(`${monthName} ${sm.year}`);

      // Check existing charges for this month
      let charges = await tx.feeCharge.findMany({
        where: {
          studentId,
          sessionId: activeSessionId,
          billingMonth: sm.month,
          billingYear: sm.year,
        },
      });

      // Not billed yet (advance payment of a future month): bill it now, with the same
      // per-head charges, concessions and invoice as any other billing path.
      if (charges.length === 0) {
        const bill = computeMonthBill(billing, sm.month, sm.year);
        if (!bill.eligible) {
          throw new Error(`${monthName} ${sm.year} can't be billed: ${bill.reason}.`);
        }
        await billMonth(tx, billing, bill, adminUserId);
        charges = await tx.feeCharge.findMany({
          where: { studentId, sessionId: activeSessionId, billingMonth: sm.month, billingYear: sm.year },
        });
      }

      // Bring late fees on these charges up to date (configured rule) before waivers and
      // allocation, so the receipt shows exactly what was settled.
      await persistAccruedLateFees(tx, studentId, charges.map((c) => c.id));
      charges = await tx.feeCharge.findMany({ where: { id: { in: charges.map((c) => c.id) } } });

      // STEP B: Handle Late Fines Waiver (if requested)
      for (const c of charges) {
        if (waiveLateFines && Number(c.lateFeeAmount) > 0) {
          const fineAmt = Number(c.lateFeeAmount);
          await tx.feeCharge.update({
            where: { id: c.id },
            data: {
              lateFeeAmount: 0,
              netAmount: Math.max(0, Number(c.netAmount) - fineAmt),
            },
          });

          await tx.feeAdjustment.create({
            data: {
              studentId,
              feeChargeId: c.id,
              type: "LATE_FEE_WAIVER",
              calculationType: "FIXED_AMOUNT",
              value: fineAmt,
              amount: fineAmt,
              reason: "Late fee waived at payment desk",
              appliedByUserId: adminUserId,
            },
          });

          discountsAppliedSummary.push({
            type: "LATE_FEE_WAIVER",
            reason: `Late fee waived for ${monthName} ${sm.year}`,
            amount: fineAmt,
            targetMonth: `${monthName} ${sm.year}`,
          });
        }

        // STEP C: Apply Itemized Head-Level Waivers (if specified)
        if (sm.headWaivers && sm.headWaivers.length > 0) {
          for (const hw of sm.headWaivers) {
            const matchCharge =
              (hw.chargeId && hw.chargeId === c.id) ||
              (hw.feeHeadId && hw.feeHeadId === c.feeHeadId);

            if (matchCharge && hw.waiverAmount > 0) {
              const currentOutstanding = Math.max(0, Number(c.netAmount) - Number(c.paidAmount));
              const waiverToApply = Math.min(hw.waiverAmount, currentOutstanding);

              if (waiverToApply > 0) {
                await tx.feeCharge.update({
                  where: { id: c.id },
                  data: {
                    discountAmount: Number(c.discountAmount) + waiverToApply,
                    netAmount: Math.max(0, Number(c.netAmount) - waiverToApply),
                  },
                });

                await tx.feeAdjustment.create({
                  data: {
                    studentId,
                    feeChargeId: c.id,
                    type: "FEE_WAIVER",
                    calculationType: "FIXED_AMOUNT",
                    value: waiverToApply,
                    amount: waiverToApply,
                    reason: hw.reason || "Fee head waiver",
                    appliedByUserId: adminUserId,
                  },
                });

                discountsAppliedSummary.push({
                  type: "HEAD_WAIVER",
                  reason: hw.reason || `Waiver on ${hw.headName || "fee head"}`,
                  amount: waiverToApply,
                  targetMonth: `${monthName} ${sm.year}`,
                });
              }
            }
          }
        }

        if (!processedChargeIds.includes(c.id)) {
          processedChargeIds.push(c.id);
        }
      }
    }

    // Refresh charges to get post-waiver values
    const currentCharges = await tx.feeCharge.findMany({
      where: { id: { in: processedChargeIds } },
      orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }, { id: "asc" }],
    });

    // STEP D: Apply Lump-Sum / Total Amount Discount (if provided)
    if (lumpSumDiscount && lumpSumDiscount.value > 0) {
      const remainingTotalDue = currentCharges.reduce(
        (sum, c) => sum + Math.max(0, Number(c.netAmount) - Number(c.paidAmount)),
        0
      );

      let discountToDistribute = 0;
      if (lumpSumDiscount.type === "PERCENTAGE") {
        discountToDistribute = Math.round((remainingTotalDue * lumpSumDiscount.value) / 100);
      } else {
        discountToDistribute = Math.min(lumpSumDiscount.value, remainingTotalDue);
      }

      if (discountToDistribute > 0) {
        let remainingDisc = discountToDistribute;

        for (let i = 0; i < currentCharges.length && remainingDisc > 0; i++) {
          const c = currentCharges[i];
          const outstanding = Math.max(0, Number(c.netAmount) - Number(c.paidAmount));
          if (outstanding <= 0) continue;

          // Proportionate or sequential slice
          const slice = i === currentCharges.length - 1 ? remainingDisc : Math.min(outstanding, remainingDisc);
          remainingDisc -= slice;

          await tx.feeCharge.update({
            where: { id: c.id },
            data: {
              discountAmount: Number(c.discountAmount) + slice,
              netAmount: Math.max(0, Number(c.netAmount) - slice),
            },
          });

          await tx.feeAdjustment.create({
            data: {
              studentId,
              feeChargeId: c.id,
              type: "SPECIAL_CONCESSION",
              calculationType: lumpSumDiscount.type,
              value: lumpSumDiscount.value,
              amount: slice,
              reason: lumpSumDiscount.reason || "Total amount discount concession",
              appliedByUserId: adminUserId,
            },
          });
        }

        discountsAppliedSummary.push({
          type: "TOTAL_DISCOUNT",
          reason: lumpSumDiscount.reason || "Overall fee discount",
          amount: discountToDistribute,
        });
      }
    }

    // STEP E: Record the Payment & Sequential Allocations
    const paymentNumber = `PAY-MULTI-${Date.now()}-${studentId}`;

    const created = await tx.payment.create({
      data: {
        paymentNumber,
        studentId,
        amount: paymentAmount,
        mode: paymentMode,
        status: PaymentStatus.SUCCESS,
        transactionRef,
        paidAt: new Date(),
        recordedByUserId: adminUserId,
      },
    });
    // Receipt number from the payment id: unique by construction (no random suffix).
    const receiptNumber = receiptNumberFor(created.id);
    const payment = await tx.payment.update({ where: { id: created.id }, data: { receiptNumber } });

    // Re-fetch charges to allocate payments against final netAmounts
    const chargesToPay = await tx.feeCharge.findMany({
      where: { id: { in: processedChargeIds } },
      orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }, { id: "asc" }],
    });

    let fundsToAllocate = paymentAmount;

    for (const c of chargesToPay) {
      if (fundsToAllocate <= 0) break;
      const currentNet = Number(c.netAmount);
      const currentPaid = Number(c.paidAmount);
      const needed = Math.max(0, currentNet - currentPaid);

      if (needed <= 0) continue;

      const allocation = Math.min(fundsToAllocate, needed);
      fundsToAllocate -= allocation;

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          feeChargeId: c.id,
          allocatedAmount: allocation,
        },
      });

      const newPaid = currentPaid + allocation;
      const isFullyPaid = newPaid >= currentNet;

      await tx.feeCharge.update({
        where: { id: c.id },
        data: {
          paidAmount: newPaid,
          status: isFullyPaid ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID,
        },
      });
    }

    // Update any linked Invoices for these months
    for (const sm of selectedMonths) {
      const monthName = MONTH_NAMES[sm.month - 1];
      const periodCode = `${monthName.substring(0, 3).toUpperCase()}_${sm.year}`;

      const inv = await tx.invoice.findFirst({
        where: {
          studentId,
          sessionId: activeSessionId,
          collectionPeriodCode: periodCode,
        },
      });

      if (inv) {
        // Calculate updated totals for invoice
        const invCharges = await tx.feeCharge.findMany({
          where: {
            studentId,
            sessionId: activeSessionId,
            billingMonth: sm.month,
            billingYear: sm.year,
          },
        });

        const totalNet = invCharges.reduce((sum, c) => sum + Number(c.netAmount), 0);
        const totalPaid = invCharges.reduce((sum, c) => sum + Number(c.paidAmount), 0);
        const isInvPaid = totalPaid >= totalNet;

        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            totalAmount: totalNet,
            paidAmount: totalPaid,
            status: isInvPaid ? InvoiceStatus.PAID : totalPaid > 0 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.ISSUED,
          },
        });
      }
    }

    // STEP F: If fundsToAllocate > 0, store excess in AdvancePayment
    if (fundsToAllocate > 0) {
      await tx.advancePayment.create({
        data: {
          studentId,
          paymentId: payment.id,
          amount: fundsToAllocate,
          remainingAmount: fundsToAllocate,
          status: AdvanceStatus.AVAILABLE,
        },
      });
    }

    // Audit Log
    await tx.feeAuditLog.create({
      data: {
        action: "RECORD_MULTI_MONTH_PAYMENT",
        entityType: "Payment",
        entityId: payment.id,
        userId: adminUserId,
        newValues: JSON.stringify({
          receiptNumber,
          paymentAmount,
          clearedMonths: clearedMonthsList,
          discountsApplied: discountsAppliedSummary,
          excessAdvance: fundsToAllocate,
        }),
      },
    });

    return {
      paymentId: payment.id,
      receiptNumber,
      paidAt: payment.paidAt,
      studentName: student.name,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      className: student.classSection
        ? `${student.classSection.className} - ${student.classSection.section}`
        : "Unassigned",
      fatherName: student.fatherName || "Parent",
      fatherContact: student.fatherContact || student.contactNumber || "",
      amountPaid: paymentAmount,
      mode: paymentMode,
      transactionRef: transactionRef || "N/A",
      notes: notes || "",
      clearedMonths: clearedMonthsList,
      discountsApplied: discountsAppliedSummary,
      excessCreditedAsAdvance: fundsToAllocate,
    };
  });
};
