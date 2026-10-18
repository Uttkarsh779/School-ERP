import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { FeeMode, PaymentStatus } from "../../generated/prisma/enums";
import { allocatePaymentToChargesTransactionally } from "./paymentAllocationService";
import { receiptNumberFor, withLateFees } from "./lateFeeService";
import { httpError } from "../../utils/httpError";

// Online fee payments via Razorpay.
//
// Security model:
// - Real mode (RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET set): orders are created with Razorpay
//   and every checkout is verified with the HMAC signature. No signature, no payment.
// - Mock mode is for local development ONLY: it must be switched on explicitly with
//   RAZORPAY_MOCK_MODE=true and is refused when NODE_ENV=production.
// - Neither configured: online payment is unavailable (503) — it never silently "succeeds".
// - Webhooks are accepted only when RAZORPAY_WEBHOOK_SECRET is set and the signature matches.

const isRealMode = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const isMockMode = () =>
  !isRealMode() && process.env.RAZORPAY_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";

const assertConfigured = () => {
  if (!isRealMode() && !isMockMode()) {
    throw httpError(503, "Online payment is not available right now. Please pay at the school fee counter.");
  }
};

const signatureMatches = (payload: string, signature: string, secret: string) => {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature ?? ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Current outstanding for a student (optionally limited to some charges), incl. late fees.
const outstandingFor = async (studentId: number, chargeIds?: number[]) => {
  const charges = await prisma.feeCharge.findMany({
    where: {
      studentId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      ...(chargeIds && chargeIds.length > 0 ? { id: { in: chargeIds } } : {}),
    },
  });
  const computed = await withLateFees(prisma, charges as any[]);
  return computed.reduce((sum, r) => sum + r.outstanding, 0);
};

export const createRazorpayOrderForStudent = async (data: {
  studentId: number;
  requestedAmount?: number; // optional partial amount
  invoiceIds?: number[];
  chargeIds?: number[];
}) => {
  assertConfigured();
  const { studentId, requestedAmount, chargeIds } = data;

  const totalOutstanding = await outstandingFor(studentId, chargeIds);
  if (totalOutstanding <= 0) {
    throw httpError(400, "There is no outstanding fee to pay right now.");
  }

  let payableAmount = totalOutstanding;
  if (requestedAmount !== undefined && requestedAmount !== null) {
    const req = Number(requestedAmount);
    if (!Number.isFinite(req) || req <= 0) throw httpError(400, "Enter an amount greater than zero.");
    if (req > totalOutstanding) {
      throw httpError(400, `You can pay at most ₹${totalOutstanding.toLocaleString("en-IN")} (your current outstanding).`);
    }
    payableAmount = req;
  }
  payableAmount = Math.round(payableAmount * 100) / 100;
  const amountInPaise = Math.round(payableAmount * 100);

  let razorpayOrderId: string;
  let keyId: string;
  if (isRealMode()) {
    keyId = process.env.RAZORPAY_KEY_ID!;
    const authHeader = Buffer.from(`${keyId}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${authHeader}` },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `stu_${studentId}_${Date.now()}`,
        notes: { studentId: String(studentId) },
      }),
    });
    if (!response.ok) {
      throw httpError(502, "Could not start the online payment. Please try again in a moment.");
    }
    const orderData = (await response.json()) as { id: string };
    razorpayOrderId = orderData.id;
  } else {
    keyId = "rzp_test_mock";
    razorpayOrderId = `order_mock_${Date.now()}_${studentId}`;
  }

  const payment = await prisma.payment.create({
    data: {
      paymentNumber: `PAY-ONLINE-${Date.now()}-${studentId}`,
      studentId,
      amount: payableAmount,
      mode: FeeMode.GATEWAY,
      status: PaymentStatus.PENDING,
      razorpayOrderId,
    },
  });

  return {
    orderId: razorpayOrderId,
    amount: payableAmount,
    amountInPaise,
    currency: "INR",
    keyId,
    paymentId: payment.id,
    mock: isMockMode(),
  };
};

// Marks a pending online payment successful and allocates it to the student's charges —
// one transaction, idempotent (a second call returns the already-confirmed payment).
const confirmPendingPayment = async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string | null) =>
  prisma.$transaction(async (tx: any) => {
    const payment = await tx.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) throw httpError(404, "Payment order not found.");
    if (payment.status === PaymentStatus.SUCCESS) {
      return { payment, receiptNumber: payment.receiptNumber, alreadyProcessed: true };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw httpError(409, "This payment order can no longer be completed.");
    }
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
        receiptNumber: receiptNumberFor(payment.id),
      },
    });
    await allocatePaymentToChargesTransactionally(tx, {
      paymentId: updated.id,
      studentId: updated.studentId,
      amount: Number(updated.amount),
    });
    return { payment: updated, receiptNumber: updated.receiptNumber, alreadyProcessed: false };
  });

export const verifyAndConfirmRazorpayPayment = async (data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  studentId: number;
}) => {
  assertConfigured();
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, studentId } = data;
  if (!razorpayOrderId || !razorpayPaymentId) throw httpError(400, "Missing payment details.");

  // The order must belong to this student — never match "any pending payment".
  const pending = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  if (!pending || pending.studentId !== Number(studentId)) {
    throw httpError(404, "Payment order not found.");
  }

  if (isRealMode()) {
    const ok = signatureMatches(`${razorpayOrderId}|${razorpayPaymentId}`, razorpaySignature, process.env.RAZORPAY_KEY_SECRET!);
    if (!ok) throw httpError(400, "Payment could not be verified. If money was deducted, contact the school office with your transaction ID.");
  }

  const result = await confirmPendingPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature ?? null);
  return {
    success: true,
    message: result.alreadyProcessed ? "Payment already verified." : "Payment verified and recorded.",
    payment: result.payment,
    receiptNumber: result.receiptNumber,
  };
};

export const processRazorpayWebhook = async (rawBody: string, signature: string) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw httpError(503, "Webhook is not configured.");
  if (!signatureMatches(rawBody, signature, secret)) throw httpError(401, "Invalid webhook signature.");

  const event = JSON.parse(rawBody);
  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    if (entity?.order_id && entity?.id) {
      const exists = await prisma.payment.findUnique({ where: { razorpayOrderId: entity.order_id } });
      if (exists) {
        // The webhook signature (checked above) authenticates this event.
        await confirmPendingPayment(entity.order_id, entity.id, null);
      }
    }
  }
  return { success: true, event: event.event };
};
