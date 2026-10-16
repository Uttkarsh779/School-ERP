import assert from "node:assert";
import { test } from "node:test";
import crypto from "crypto";
import { createRazorpayOrderForStudent, verifyAndConfirmRazorpayPayment } from "../modules/fees/razorpayService";
import { prisma } from "../config/prisma";

test("Razorpay Payment Pipeline & Webhook Idempotency", async (t) => {
  // Setup dummy student & charges
  const user = await prisma.user.create({
    data: {
      email: `rzp_test_${Date.now()}@school.com`,
      passwordHash: "hash",
      role: "STUDENT",
      name: "Razorpay Test Student",
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      name: `Rzp_Sess_${Date.now()}`,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-05-31"),
    },
  });

  const classSection = await prisma.classSection.create({
    data: {
      sessionId: session.id,
      className: "Class 10",
      section: `R${Date.now()}`,
    },
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      admissionNo: `RZP_ADM_${Date.now()}`,
      name: "Razorpay Student",
      rollNo: `RZP_${Date.now()}`,
      classSectionId: classSection.id,
    },
  });

  const feeHead = await prisma.feeHead.create({
    data: {
      name: `Rzp_Fee_${Date.now()}`,
      code: `RZP_${Date.now()}`,
      description: "Test fee",
    },
  });

  await prisma.feeCharge.create({
    data: {
      studentId: student.id,
      feeHeadId: feeHead.id,
      sessionId: session.id,
      billingMonth: 8,
      billingYear: 2026,
      dueDate: new Date("2026-08-10"),
      baseAmount: 3700,
      netAmount: 3700,
      paidAmount: 0,
      status: "UNPAID",
    },
  });

  let orderInfo: any;

  await t.test("1. Order Creation Calculates Payable Amount Correctly", async () => {
    orderInfo = await createRazorpayOrderForStudent({ studentId: student.id });
    assert.strictEqual(orderInfo.amount, 3700);
    assert.strictEqual(orderInfo.amountInPaise, 370000);
    assert.ok(orderInfo.orderId);
  });

  await t.test("2. Signature Verification & Payment Allocation", async () => {
    const razorpayOrderId = orderInfo.orderId;
    const razorpayPaymentId = `pay_${Date.now()}`;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "dummy_secret";
    const razorpaySignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    const result = await verifyAndConfirmRazorpayPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      studentId: student.id,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.receiptNumber);

    const chargeAfter = await prisma.feeCharge.findFirst({ where: { studentId: student.id } });
    assert.strictEqual(Number(chargeAfter?.paidAmount), 3700);
    assert.strictEqual(chargeAfter?.status, "PAID");
  });

  await t.test("3. Duplicate Payment Verification Returns Same Receipt (Idempotent)", async () => {
    const payment = await prisma.payment.findFirst({ where: { studentId: student.id } });
    assert.ok(payment);

    const duplicateResult = await verifyAndConfirmRazorpayPayment({
      razorpayOrderId: payment.razorpayOrderId!,
      razorpayPaymentId: payment.razorpayPaymentId!,
      razorpaySignature: payment.razorpaySignature || "dummy",
      studentId: student.id,
    });

    assert.strictEqual(duplicateResult.success, true);
    assert.strictEqual(duplicateResult.receiptNumber, payment.receiptNumber);

    const paymentCount = await prisma.payment.count({ where: { studentId: student.id } });
    assert.strictEqual(paymentCount, 1);
  });
});
