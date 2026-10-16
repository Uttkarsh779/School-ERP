import { prisma } from "../../config/prisma";
import type { AdjustmentType, CalculationType } from "../../generated/prisma/enums";

export const applyFeeAdjustment = async (data: {
  studentId: number;
  feeChargeId?: number;
  type: AdjustmentType;
  calculationType: CalculationType;
  value: number;
  reason: string;
  appliedByUserId: number;
}) => {
  const { studentId, feeChargeId, type, calculationType, value, reason, appliedByUserId } = data;

  let calculatedAmount = value;

  if (feeChargeId) {
    const charge = await prisma.feeCharge.findUniqueOrThrow({ where: { id: feeChargeId } });

    if (calculationType === "PERCENTAGE") {
      calculatedAmount = (Number(charge.baseAmount) * value) / 100;
    }

    // Apply discount amount directly to the fee charge
    await prisma.feeCharge.update({
      where: { id: feeChargeId },
      data: {
        discountAmount: Number(charge.discountAmount) + calculatedAmount,
        netAmount: Math.max(0, Number(charge.baseAmount) - (Number(charge.discountAmount) + calculatedAmount) + Number(charge.lateFeeAmount)),
      },
    });
  }

  return prisma.feeAdjustment.create({
    data: {
      studentId,
      feeChargeId,
      type,
      calculationType,
      value,
      amount: calculatedAmount,
      reason,
      appliedByUserId,
    },
    include: {
      student: true,
      appliedByUser: true,
    },
  });
};

export const waiveLateFee = async (
  feeChargeIds: number[],
  waiverAmountPerCharge: number | "FULL",
  reason: string,
  appliedByUserId: number
) => {
  return prisma.$transaction(async (tx) => {
    const results: any[] = [];
    for (const chargeId of feeChargeIds) {
      const charge = await tx.feeCharge.findUniqueOrThrow({ where: { id: chargeId } });
      const currentLateFee = Number(charge.lateFeeAmount);
      
      let amountToWaive = currentLateFee;
      if (waiverAmountPerCharge !== "FULL") {
        amountToWaive = Math.min(waiverAmountPerCharge, currentLateFee);
      }
      
      if (amountToWaive <= 0) continue;

      // Ensure we don't modify paid amounts. Just reduce late fee and netAmount
      await tx.feeCharge.update({
        where: { id: chargeId },
        data: {
          lateFeeAmount: currentLateFee - amountToWaive,
          netAmount: Math.max(0, Number(charge.netAmount) - amountToWaive)
        }
      });

      const adjustment = await tx.feeAdjustment.create({
        data: {
          studentId: charge.studentId,
          feeChargeId: chargeId,
          type: "LATE_FEE_WAIVER",
          calculationType: "FIXED_AMOUNT",
          value: amountToWaive,
          amount: amountToWaive,
          reason,
          appliedByUserId
        }
      });
      results.push(adjustment);
    }
    return results;
  });
};

export const waiveSmallBalance = async (
  feeChargeId: number,
  reason: string,
  appliedByUserId: number,
  limit: number = 100 // Configurable limit
) => {
  return prisma.$transaction(async (tx) => {
    const charge = await tx.feeCharge.findUniqueOrThrow({ where: { id: feeChargeId } });
    const outstanding = Math.max(0, Number(charge.netAmount) - Number(charge.paidAmount));
    
    if (outstanding <= 0) {
      throw new Error("No outstanding balance to waive.");
    }
    
    if (outstanding > limit) {
      throw new Error(`Small balance waiver rejected: Outstanding amount (₹${outstanding}) exceeds limit (₹${limit}).`);
    }

    // A small balance waiver acts as a post-generation discount, reducing netAmount exactly to paidAmount.
    await tx.feeCharge.update({
      where: { id: feeChargeId },
      data: {
        discountAmount: Number(charge.discountAmount) + outstanding,
        netAmount: Number(charge.paidAmount),
        status: "PAID" // since paidAmount === netAmount now
      }
    });

    return tx.feeAdjustment.create({
      data: {
        studentId: charge.studentId,
        feeChargeId,
        type: "SMALL_BALANCE_WAIVER",
        calculationType: "FIXED_AMOUNT",
        value: outstanding,
        amount: outstanding,
        reason,
        appliedByUserId
      }
    });
  });
};

export const waiveFee = async (
  feeChargeId: number,
  amountToWaive: number,
  reason: string,
  appliedByUserId: number
) => {
  return prisma.$transaction(async (tx) => {
    const charge = await tx.feeCharge.findUniqueOrThrow({ where: { id: feeChargeId } });
    const currentOutstanding = Math.max(0, Number(charge.netAmount) - Number(charge.paidAmount));
    
    if (amountToWaive > currentOutstanding) {
      throw new Error(`Waiver rejected: Amount (₹${amountToWaive}) exceeds outstanding balance (₹${currentOutstanding}).`);
    }

    if (amountToWaive <= 0) return charge;

    await tx.feeCharge.update({
      where: { id: feeChargeId },
      data: {
        discountAmount: Number(charge.discountAmount) + amountToWaive,
        netAmount: Number(charge.netAmount) - amountToWaive,
        status: (Number(charge.paidAmount) >= Number(charge.netAmount) - amountToWaive) ? "PAID" : charge.status
      }
    });

    return tx.feeAdjustment.create({
      data: {
        studentId: charge.studentId,
        feeChargeId,
        type: "FEE_WAIVER",
        calculationType: "FIXED_AMOUNT",
        value: amountToWaive,
        amount: amountToWaive,
        reason,
        appliedByUserId
      }
    });
  });
};

export const createRefundRequest = async (data: {
  studentId: number;
  paymentId?: number;
  amount: number;
  reason: string;
  requestedByUserId: number;
}) => {
  const refundNumber = `REF-${Date.now()}-${data.studentId}`;
  return prisma.refund.create({
    data: {
      refundNumber,
      studentId: data.studentId,
      paymentId: data.paymentId,
      amount: data.amount,
      reason: data.reason,
      status: "REFUND_REQUESTED",
      requestedByUserId: data.requestedByUserId,
    },
    include: {
      student: true,
      requestedByUser: true,
    },
  });
};

export const approveOrRejectRefund = async (data: {
  refundId: number;
  approved: boolean;
  approvedByUserId: number;
}) => {
  const { refundId, approved, approvedByUserId } = data;
  const status = approved ? "REFUND_APPROVED" : "REFUND_REJECTED";

  const refund = await prisma.refund.update({
    where: { id: refundId },
    data: {
      status,
      approvedByUserId,
      processedAt: approved ? new Date() : null,
    },
    include: {
      student: true,
    },
  });

  return refund;
};

export const listRefunds = async (studentId?: number) => {
  return prisma.refund.findMany({
    where: { studentId: studentId ?? undefined },
    include: {
      student: true,
      requestedByUser: true,
      approvedByUser: true,
    },
    orderBy: { createdAt: "desc" },
  });
};
