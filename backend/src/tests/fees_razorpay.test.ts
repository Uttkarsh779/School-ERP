import assert from "node:assert";
import { test } from "node:test";
import crypto from "crypto";
import { createRazorpayOrderForStudent, verifyAndConfirmRazorpayPayment } from "../modules/fees/razorpayService";
import { prisma } from "../config/prisma";
import { trackTestRows, uniqueTag } from "./helpers/testData";

test("Razorpay Payment Pipeline & Webhook Idempotency", async (t) => {
  // Own session (not current), class, student and fee head; all removed at the end.
  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
  // Setup dummy student & charges
  const user = rows.add("User", await prisma.user.create({
    data: {
      email: `${tag.toLowerCase()}@test.local`,
      passwordHash: "hash",
      role: "STUDENT",
      name: "Razorpay Test Student",
    },
  }));

  const session = rows.add("AcademicSession", await prisma.academicSession.create({
    data: {
      name: `${tag} session`,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-05-31"),
      isCurrent: false,
    },
  }));

  const classSection = rows.add("ClassSection", await prisma.classSection.create({
    data: {
      sessionId: session.id,
      className: "ZZ Test",
      section: tag,
    },
  }));

  const student = rows.add("Student", await prisma.student.create({
    data: {
      userId: user.id,
      admissionNo: `${tag}-ADM`,
      name: "Razorpay Student",
      rollNo: "1",
      classSectionId: classSection.id,
    },
  }));

  const feeHead = rows.add("FeeHead", await prisma.feeHead.create({
    data: {
      name: `${tag} fee`,
      code: `${tag}_FEE`,
      description: "Test fee",
    },
  }));

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
  } finally {
    // Payment notifications are built in the background; let that finish first.
    await new Promise((r) => setTimeout(r, 1500));
    await rows.remove();
    await prisma.$disconnect();
  }
});
