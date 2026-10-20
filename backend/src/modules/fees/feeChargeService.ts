import { prisma } from "../../config/prisma";
import { withLateFees } from "./lateFeeService";
import { ChargeStatus } from "../../generated/prisma/enums";
import { billMonth, computeMonthBill, loadBillingContext } from "./billingService";

export const getOrCreateTransportFeeHead = async () => {
  let feeHead = await prisma.feeHead.findUnique({ where: { name: "Transport Fee" } });
  if (!feeHead) {
    feeHead = await prisma.feeHead.create({
      data: {
        name: "Transport Fee",
        code: "TRANSPORT",
        description: "Village-based student transportation fee",
        isRecurring: true,
        allowPartialPayment: true,
      },
    });
  }
  return feeHead;
};

// Bills one month for every active student of a class section (billingService rules:
// students admitted after the month, or with nothing to bill, are skipped). Already-billed
// heads are left untouched, so running it twice is safe.
export const generateChargesForClassSection = async (data: {
  sessionId: number;
  classSectionId: number;
  billingMonth: number; // 1-12
  billingYear: number;  // e.g. 2026
  appliedByUserId?: number;
}) => {
  const { sessionId, classSectionId, billingMonth, billingYear } = data;
  const appliedByUserId = data.appliedByUserId;

  const students = await prisma.student.findMany({
    where: { classSectionId, isActive: true },
    select: { id: true, name: true },
  });

  let generatedCount = 0;
  let skippedCount = 0;
  const skippedStudents: Array<{ studentId: number; name: string; reason: string }> = [];

  for (const student of students) {
    const ctx = await loadBillingContext(prisma, student.id, sessionId);
    const bill = computeMonthBill(ctx, billingMonth, billingYear);
    if (!bill.eligible) {
      skippedStudents.push({ studentId: student.id, name: student.name, reason: bill.reason ?? "Not billable" });
      continue;
    }
    const { created } = await prisma.$transaction((tx: any) => billMonth(tx, ctx, bill, appliedByUserId));
    generatedCount += created.length;
    skippedCount += bill.lines.length - created.length;
  }

  return {
    success: true,
    generatedCount,
    skippedCount,
    skippedStudents,
    message: `Generated ${generatedCount} fee charges for ${students.length - skippedStudents.length} of ${students.length} students.`,
  };
};

export const getStudentDueSummary = async (studentId: number) => {
  // Three independent reads in parallel (one nested include would run them back to back).
  const [studentRow, feeCharges, advances] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { classSection: true } }),
    prisma.feeCharge.findMany({
      where: { studentId, status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] } },
      include: { feeHead: true, feeStructureItem: true },
      orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
    }),
    prisma.advancePayment.findMany({ where: { studentId, status: "AVAILABLE" } }),
  ]);
  const student = { ...studentRow, feeCharges, advances };

  // Late fees come from the session's configured rule (see lateFeeService) — the same
  // calculation the payment desk, ledger and defaulters list use.
  const computed = await withLateFees(prisma, student.feeCharges as any[]);
  const chargesWithLateFee = computed.map(({ charge, lateFee, outstanding }: any) => ({
    ...charge,
    baseAmount: Number(charge.baseAmount),
    discountAmount: Number(charge.discountAmount),
    paidAmount: Number(charge.paidAmount),
    lateFeeAmount: lateFee,
    calculatedLateFee: lateFee,
    netAmount: Math.max(0, Number(charge.baseAmount) - Number(charge.discountAmount) + lateFee),
    outstandingAmount: outstanding,
  }));

  let totalOutstanding = chargesWithLateFee.reduce((sum: number, c: any) => sum + c.outstandingAmount, 0);

  if (totalOutstanding === 0) {
    const studentInvoices = await prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
    });

    for (const inv of studentInvoices) {
      const dueAmt = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount || 0));
      totalOutstanding += dueAmt;
    }
  }

  const totalAdvanceAvailable = student.advances.reduce((sum: number, a: any) => sum + Number(a.remainingAmount), 0);

  return {
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      classSection: `${student.classSection.className} - ${student.classSection.section}`,
    },
    charges: chargesWithLateFee,
    totalOutstanding,
    totalAdvanceAvailable,
    netPayable: Math.max(0, totalOutstanding - totalAdvanceAvailable),
  };
};
