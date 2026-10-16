import { prisma } from "../../config/prisma";
import { ChargeStatus, InvoiceStatus, PaymentStatus } from "../../generated/prisma/enums";

export const allocatePaymentToCharges = async (
  paymentId: number,
  studentId: number,
  paymentAmount: number,
  targetInvoiceIds?: number[]
) => {
  return prisma.$transaction(async (tx: any) => {
    return allocatePaymentToChargesTransactionally(tx, { paymentId, studentId, amount: paymentAmount, targetInvoiceIds });
  });
};

export const allocatePaymentToChargesTransactionally = async (
  tx: any,
  params: {
    paymentId: number;
    studentId: number;
    amount: number;
    targetInvoiceIds?: number[];
    targetChargeId?: number;
  }
) => {
    const { paymentId, studentId, amount: paymentAmount, targetChargeId } = params;

    // 1. Fetch unpaid/partially paid charges for student (ordered FIFO by billing period)
    const unpaidCharges = await tx.feeCharge.findMany({
      where: {
        studentId,
        status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] },
        ...(targetChargeId ? { id: targetChargeId } : {})
      },
      include: { feeHead: true },
      orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
    });

    let remainingToAllocate = paymentAmount;
    const allocationsData: Array<{
      paymentId: number;
      feeChargeId: number;
      invoiceId?: number;
      allocatedAmount: number;
    }> = [];

    for (const charge of unpaidCharges) {
      if (remainingToAllocate <= 0) break;

      const baseAmount = Number(charge.baseAmount);
      const discountAmount = Number(charge.discountAmount);
      const lateFeeAmount = Number(charge.lateFeeAmount);
      const paidAmount = Number(charge.paidAmount);

      const chargeNet = baseAmount - discountAmount + lateFeeAmount;
      const chargeDue = Math.max(0, chargeNet - paidAmount);

      if (chargeDue <= 0) continue;

      const allocateForThisCharge = Math.min(remainingToAllocate, chargeDue);
      const newPaidAmount = paidAmount + allocateForThisCharge;
      const newStatus =
        newPaidAmount >= chargeNet ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID;

      // Update FeeCharge
      await tx.feeCharge.update({
        where: { id: charge.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      // Record allocation entry
      allocationsData.push({
        paymentId,
        feeChargeId: charge.id,
        allocatedAmount: allocateForThisCharge,
      });

      remainingToAllocate -= allocateForThisCharge;
    }

    // Create allocation records
    if (allocationsData.length > 0) {
      await tx.paymentAllocation.createMany({
        data: allocationsData,
      });
    }

    // Check if there is excess payment -> convert to Advance Payment
    if (remainingToAllocate > 0) {
      await tx.advancePayment.create({
        data: {
          studentId,
          paymentId,
          amount: remainingToAllocate,
          usedAmount: 0,
          remainingAmount: remainingToAllocate,
          status: "AVAILABLE",
        },
      });
    }

    // Update associated Invoices if any
    const studentInvoices = await tx.invoice.findMany({
      where: {
        studentId,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
      },
      include: { items: true },
    });

    for (const invoice of studentInvoices) {
      const itemChargeIds = invoice.items.map((i: any) => i.feeChargeId);
      const invoiceCharges = await tx.feeCharge.findMany({
        where: { id: { in: itemChargeIds } },
      });

      const totalInvoicePaid = invoiceCharges.reduce((sum: number, c: any) => sum + c.paidAmount, 0);
      const invoiceStatus =
        totalInvoicePaid >= invoice.totalAmount
          ? InvoiceStatus.PAID
          : totalInvoicePaid > 0
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.ISSUED;

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: Math.min(invoice.totalAmount, totalInvoicePaid),
          status: invoiceStatus,
        },
      });
    }

    return {
      allocatedAmount: paymentAmount - Math.max(0, remainingToAllocate),
      advanceAmount: Math.max(0, remainingToAllocate),
    };
};
