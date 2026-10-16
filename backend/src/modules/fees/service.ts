import { prisma } from "../../config/prisma";
import { FeePaymentStatus } from "../../generated/prisma/enums";
import type { FeeMode } from "../../generated/prisma/enums";

export const listFeeStructures = (classSectionId?: number, sessionId?: number) =>
  prisma.feeStructure.findMany({
    where: {
      classSectionId: classSectionId ?? undefined,
      sessionId: sessionId ?? undefined,
    },
    orderBy: [{ head: "asc" }],
  });

export const getFeeStructureById = (id: number) =>
  prisma.feeStructure.findUnique({ where: { id } });

export const createFeeStructure = (data: {
  classSectionId: number;
  sessionId: number;
  head: string;
  amount: number;
}) => prisma.feeStructure.create({ data });

// Sum of all fee-structure amounts configured for a class section (a ClassSection
// belongs to exactly one AcademicSession, so classSectionId alone scopes this correctly)
// — the total a student in that class section is expected to pay.
export const getStructureTotalForClassSection = async (classSectionId: number) => {
  const structures = await prisma.feeStructure.findMany({ where: { classSectionId } });
  return structures.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
};

export const listFeePaymentsForStudent = (studentId: number) =>
  prisma.feePayment.findMany({
    where: { studentId },
    include: { feeStructure: true },
    orderBy: { createdAt: "desc" },
  });

export const getFeePaymentById = (id: number) =>
  prisma.feePayment.findUnique({ where: { id }, include: { feeStructure: true, student: true } });

// Unique, human-readable receipt number — timestamp + studentId keeps it unique
// without a dedicated sequence, and it's readable enough for a paper receipt.
const generateReceiptNumber = (studentId: number) => `RCPT-${Date.now()}-${studentId}`;

export const createApprovedFeePayment = (data: {
  studentId: number;
  feeStructureId: number;
  amount: number;
  mode: FeeMode;
  transactionRef?: string;
  approvedByUserId: number;
}) =>
  prisma.feePayment.create({
    data: {
      studentId: data.studentId,
      feeStructureId: data.feeStructureId,
      amount: data.amount,
      mode: data.mode,
      transactionRef: data.transactionRef,
      status: FeePaymentStatus.APPROVED,
      approvedByUserId: data.approvedByUserId,
      paidAt: new Date(),
      receiptNumber: generateReceiptNumber(data.studentId),
    },
  });


export const approveFeePayment = async (id: number, approvedByUserId: number) => {
  const payment = await prisma.feePayment.findUniqueOrThrow({ where: { id } });
  return prisma.feePayment.update({
    where: { id },
    data: {
      status: FeePaymentStatus.APPROVED,
      approvedByUserId,
      paidAt: payment.paidAt ?? new Date(),
      receiptNumber: payment.receiptNumber ?? generateReceiptNumber(payment.studentId),
    },
  });
};

// All students in a class section, for the defaulters report.
export const listStudentsForClassSection = (classSectionId: number) =>
  prisma.student.findMany({ where: { classSectionId }, orderBy: { rollNo: "asc" } });

// Sum of APPROVED payments for a set of students, grouped by studentId — used
// alongside getStructureTotalForClassSession to compute each student's due balance.
export const getApprovedPaymentsForStudents = (studentIds: number[]) =>
  prisma.feePayment.findMany({
    where: { studentId: { in: studentIds }, status: FeePaymentStatus.APPROVED },
  });
