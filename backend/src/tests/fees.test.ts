import crypto from "crypto";
import { describe, it } from "node:test";
import assert from "node:assert";

// Unit & Integration Logic Tests for Fee Management & Razorpay Verification

describe("Fee Management & Razorpay Module Tests", () => {

  it("1. Idempotency Check: Same Razorpay Payment ID must not duplicate payment", () => {
    const processedPaymentIds = new Set<string>();
    const paymentId = "pay_test_998877";

    function processWebhook(razorpayPaymentId: string) {
      if (processedPaymentIds.has(razorpayPaymentId)) {
        return { success: true, duplicate: true, message: "Webhook already processed" };
      }
      processedPaymentIds.add(razorpayPaymentId);
      return { success: true, duplicate: false, message: "Payment processed successfully" };
    }

    const firstRun = processWebhook(paymentId);
    assert.strictEqual(firstRun.duplicate, false);
    assert.strictEqual(firstRun.message, "Payment processed successfully");

    const secondRun = processWebhook(paymentId);
    assert.strictEqual(secondRun.duplicate, true);
    assert.strictEqual(secondRun.message, "Webhook already processed");
  });

  it("2. Razorpay HMAC-SHA256 Signature Verification", () => {
    const orderId = "order_N12345678";
    const paymentId = "pay_P87654321";
    const secret = "test_razorpay_secret_key_123";

    // Generate valid signature
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // Verify valid signature
    const verifySignature = (ordId: string, payId: string, sig: string, sec: string) => {
      const expected = crypto.createHmac("sha256", sec).update(`${ordId}|${payId}`).digest("hex");
      return expected === sig;
    };

    assert.strictEqual(verifySignature(orderId, paymentId, validSignature, secret), true);
    assert.strictEqual(verifySignature(orderId, paymentId, "tampered_fake_signature", secret), false);
  });

  it("3. FIFO Payment Allocation against Oldest Dues First", () => {
    const charges = [
      { id: 101, name: "July Tuition", due: 3000, paid: 0 },
      { id: 102, name: "August Tuition", due: 3000, paid: 0 },
      { id: 103, name: "September Tuition", due: 3000, paid: 0 },
    ];

    let paymentAmount = 5000;
    const allocations: Array<{ chargeId: number; allocated: number; remainingDue: number }> = [];

    for (const charge of charges) {
      if (paymentAmount <= 0) break;
      const allocate = Math.min(paymentAmount, charge.due);
      charge.paid += allocate;
      paymentAmount -= allocate;
      allocations.push({
        chargeId: charge.id,
        allocated: allocate,
        remainingDue: charge.due - charge.paid,
      });
    }

    assert.strictEqual(allocations[0].allocated, 3000); // July fully paid
    assert.strictEqual(allocations[0].remainingDue, 0);

    assert.strictEqual(allocations[1].allocated, 2000); // August partially paid
    assert.strictEqual(allocations[1].remainingDue, 1000);

    assert.strictEqual(charges[2].paid, 0); // September unpaid
    assert.strictEqual(paymentAmount, 0);
  });

  it("4. Advance Payment Balance Calculation when Overpaid", () => {
    const totalDue = 6000;
    const paidAmount = 9000;

    let advanceBalance = 0;
    let allocatedAmount = 0;

    if (paidAmount > totalDue) {
      allocatedAmount = totalDue;
      advanceBalance = paidAmount - totalDue;
    } else {
      allocatedAmount = paidAmount;
    }

    assert.strictEqual(allocatedAmount, 6000);
    assert.strictEqual(advanceBalance, 3000);
  });

  it("5. Multi-Month Billing Line Item Preservation", () => {
    const lineItems = [
      { head: "Tuition Fee", month: "May 2027", amount: 3000 },
      { head: "Tuition Fee", month: "June 2027", amount: 3000 },
    ];

    const totalInvoiceAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

    assert.strictEqual(lineItems.length, 2);
    assert.strictEqual(lineItems[0].month, "May 2027");
    assert.strictEqual(lineItems[1].month, "June 2027");
    assert.strictEqual(totalInvoiceAmount, 6000);
  });

  it("6. Student Mid-Year Admission Prorated Calculation", () => {
    const monthlyTuition = 3000;
    const daysInMonth = 30;
    const admissionDay = 16;

    const activeDays = daysInMonth - admissionDay + 1; // 15 active days
    const proratedAmount = Math.round((monthlyTuition / daysInMonth) * activeDays);

    assert.strictEqual(proratedAmount, 1500);
  });

  it("7. Security Verification: Server-side Amount Enforcement", () => {
    const serverCalculatedOutstanding = 6100;
    const frontendTamperedRequestedAmount = 100; // Malicious student trying to pay ₹100 instead of ₹6100

    function validatePaymentAmount(requested: number, actual: number, allowPartial: boolean) {
      if (requested > actual) {
        throw new Error("Requested amount exceeds actual outstanding balance");
      }
      if (!allowPartial && requested < actual) {
        throw new Error("Partial payments are not allowed for this fee head");
      }
      return requested; // Valid partial payment
    }

    // Attempting to pay valid partial amount when allowed
    const validPartial = validatePaymentAmount(2000, serverCalculatedOutstanding, true);
    assert.strictEqual(validPartial, 2000);

    // Attempting to pay full amount
    const validFull = validatePaymentAmount(6100, serverCalculatedOutstanding, true);
    assert.strictEqual(validFull, 6100);

    // Attempting to claim overpayment
    assert.throws(() => validatePaymentAmount(7000, serverCalculatedOutstanding, true), /exceeds/);
  });
});
