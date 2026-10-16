import { prisma } from "../../config/prisma";
import { FeeMode, PaymentStatus } from "../../generated/prisma/enums";
import * as receiptService from "./receiptService";
import { allocatePaymentToChargesTransactionally } from "./paymentAllocationService";

export const recordFamilyPayment = async (data: {
  parentGuardianId: number;
  totalAmount: number;
  mode: FeeMode;
  transactionRef?: string;
  notes?: string;
  recordedByUserId: number;
  allocations: { studentId: number; feeBillId?: number; amount: number }[];
}) => {
  // 1. Basic validation
  const calculatedTotal = data.allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  if (Math.abs(calculatedTotal - data.totalAmount) > 0.01) {
    throw new Error(`Sum of allocations (${calculatedTotal}) does not match total amount (${data.totalAmount})`);
  }

  // 2. Validate students belong to parent
  const parent = await prisma.parentGuardian.findUnique({
    where: { id: data.parentGuardianId },
    include: { children: true },
  });

  if (!parent) throw new Error("ParentGuardian not found");

  const allowedStudentIds = new Set(parent.children.map((c) => c.studentId));
  for (const alloc of data.allocations) {
    if (alloc.amount > 0 && !allowedStudentIds.has(alloc.studentId)) {
      throw new Error(`Student ${alloc.studentId} is not linked to this family`);
    }
  }

  // 3. Execute everything inside a transaction
  return await prisma.$transaction(async (tx) => {
    // a. Create the PaymentBatch record
    const familyReceiptNo = `FAM-REC-${Date.now()}-${data.parentGuardianId}`;
    
    const paymentBatch = await tx.paymentBatch.create({
      data: {
        parentGuardianId: data.parentGuardianId,
        totalAmount: data.totalAmount,
        mode: data.mode,
        receiptNumber: familyReceiptNo,
        transactionRef: data.transactionRef,
        notes: data.notes,
        recordedByUserId: data.recordedByUserId,
      },
    });

    const individualPayments: any[] = [];

    // b. Create individual Payment records and allocate them
    for (const alloc of data.allocations) {
      if (alloc.amount <= 0) continue;

      const studentReceiptNo = `REC-${Date.now()}-${alloc.studentId}-${Math.floor(Math.random() * 1000)}`;

      const payment = await tx.payment.create({
        data: {
          paymentNumber: `PAY-MANUAL-${Date.now()}-${alloc.studentId}`,
          studentId: alloc.studentId,
          paymentBatchId: paymentBatch.id,
          amount: alloc.amount,
          mode: data.mode,
          status: PaymentStatus.SUCCESS,
          transactionRef: data.transactionRef,
          receiptNumber: studentReceiptNo, // Individual receipt still exists!
          paidAt: new Date(),
          recordedByUserId: data.recordedByUserId,
        },
      });

      // c. Allocate the payment to specific bills (if feeBillId provided) or FIFO
      await allocatePaymentToChargesTransactionally(tx, {
        paymentId: payment.id,
        studentId: alloc.studentId,
        amount: alloc.amount,
        targetChargeId: alloc.feeBillId,
      });

      individualPayments.push(payment);
    }

    // d. Create audit log inside transaction
    await tx.feeAuditLog.create({
      data: {
        action: "RECORD_FAMILY_PAYMENT",
        entityType: "PaymentBatch",
        entityId: paymentBatch.id,
        userId: data.recordedByUserId,
        newValues: JSON.stringify(paymentBatch),
      }
    });

    return { paymentBatch, individualPayments };
  }, { maxWait: 5000, timeout: 20000 });
};
