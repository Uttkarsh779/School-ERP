import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { FeeMode, PaymentStatus } from "../../generated/prisma/enums";
import { allocatePaymentToCharges } from "./paymentAllocationService";
import { generateReceiptNumber } from "./receiptService";

const getRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_mock_key_id";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "mock_razorpay_secret_key";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "mock_razorpay_webhook_secret";
  return { keyId, keySecret, webhookSecret };
};

export const createRazorpayOrderForStudent = async (data: {
  studentId: number;
  requestedAmount?: number; // Optional partial amount requested by student
  invoiceIds?: number[];
  chargeIds?: number[];
}) => {
  const { studentId, requestedAmount, invoiceIds, chargeIds } = data;

  // 1. Calculate actual server-side outstanding amount
  const dueSummary = await prisma.feeCharge.findMany({
    where: {
      studentId,
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      id: chargeIds && chargeIds.length > 0 ? { in: chargeIds } : undefined,
    },
  });

  let totalOutstanding = dueSummary.reduce((sum: number, c: any) => {
    const net = Number(c.netAmount || c.baseAmount || 0);
    const paid = Number(c.paidAmount || 0);
    return sum + Math.max(0, net - paid);
  }, 0);

  if (totalOutstanding <= 0) {
    // Fallback: Check issued Invoices (Fee Bills)
    const dueInvoices = await prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
    });

    totalOutstanding = dueInvoices.reduce((sum: number, inv: any) => {
      const tot = Number(inv.totalAmount || 0);
      const pd = Number(inv.paidAmount || 0);
      return sum + Math.max(0, tot - pd);
    }, 0);
  }

  if (totalOutstanding <= 0) {
    if (requestedAmount && requestedAmount > 0) {
      totalOutstanding = requestedAmount;
    } else {
      throw new Error("No outstanding fee balance to pay for this student.");
    }
  }

  // 2. Validate payment amount — if partial payment requested, ensure requestedAmount <= totalOutstanding
  let payableAmount = totalOutstanding;
  if (requestedAmount && requestedAmount > 0) {
    payableAmount = Math.min(requestedAmount, totalOutstanding > 0 ? totalOutstanding : requestedAmount);
  }

  const { keyId, keySecret } = getRazorpayCredentials();

  // 3. Call Razorpay API to create order (or mock in test/dev if credentials not configured)
  const amountInPaise = Math.round(payableAmount * 100);
  let razorpayOrderId = `order_mock_${Date.now()}_${studentId}`;

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${studentId}_${Date.now()}`,
        notes: { studentId: studentId.toString() },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Razorpay Order Creation Failed: ${errText}`);
    }

    const orderData = (await response.json()) as any;
    razorpayOrderId = orderData.id;
  }

  // 4. Create pending Payment record in database
  const paymentNumber = `PAY-${Date.now()}-${studentId}`;
  const payment = await prisma.payment.create({
    data: {
      paymentNumber,
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
  };
};

export const verifyAndConfirmRazorpayPayment = async (data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  studentId: number;
}) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, studentId } = data;
  const { keySecret } = getRazorpayCredentials();

  // 1. Verify Razorpay HMAC-SHA256 signature
  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const isSignatureValid =
    process.env.RAZORPAY_KEY_SECRET ? generatedSignature === razorpaySignature : true;

  if (!isSignatureValid) {
    throw new Error("Invalid Razorpay payment signature! Security verification failed.");
  }

  // 2. Fetch pending payment record
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ razorpayOrderId }, { studentId, status: PaymentStatus.PENDING }],
    },
  });

  if (!payment) {
    throw new Error("Pending payment order not found.");
  }

  // Idempotency check: if payment already marked SUCCESS, return existing record
  if (payment.status === PaymentStatus.SUCCESS && payment.receiptNumber) {
    return {
      success: true,
      message: "Payment already verified and processed.",
      payment,
      receiptNumber: payment.receiptNumber,
    };
  }

  // 3. Execute atomic DB Transaction: Mark SUCCESS -> Generate Receipt -> Allocate Payment
  const receiptNumber = await generateReceiptNumber();

  const updatedPayment = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
        receiptNumber,
      },
    });

    return updated;
  });

  // Run payment allocation FIFO algorithm
  await allocatePaymentToCharges(updatedPayment.id, studentId, updatedPayment.amount);

  return {
    success: true,
    message: "Payment successfully verified and allocated.",
    payment: updatedPayment,
    receiptNumber,
  };
};

export const processRazorpayWebhook = async (rawBody: string, signature: string) => {
  const { webhookSecret } = getRazorpayCredentials();

  // 1. Verify webhook signature
  if (process.env.RAZORPAY_WEBHOOK_SECRET) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      throw new Error("Invalid webhook signature!");
    }
  }

  const event = JSON.parse(rawBody);

  // Idempotently handle payment.captured
  if (event.event === "payment.captured") {
    const paymentEntity = event.payload.payment.entity;
    const razorpayOrderId = paymentEntity.order_id;
    const razorpayPaymentId = paymentEntity.id;

    const existingPayment = await prisma.payment.findFirst({
      where: { razorpayOrderId },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.SUCCESS) {
      return { success: true, message: "Webhook already processed." };
    }

    if (existingPayment) {
      await verifyAndConfirmRazorpayPayment({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: "WEBHOOK_VERIFIED",
        studentId: existingPayment.studentId,
      });
    }
  }

  return { success: true, event: event.event };
};
