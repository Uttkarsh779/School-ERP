import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import {
  accruedLateFee,
  effectiveLateFee,
  outstandingOf,
  parseSlabs,
  receiptNumberFor,
} from "../modules/fees/lateFeeService";

// Fee module fixes: late-fee rule maths, receipt numbers, and access control. The HTTP tests
// are rejected by auth/validation before any database write.

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
const due = day(0);

describe("late fee rules", () => {
  test("no rule means no late fee", () => {
    assert.strictEqual(accruedLateFee(due, null, day(40)), 0);
  });

  test("grace period is respected", () => {
    const rule = { gracePeriodDays: 10, feeType: "FIXED" as const, amount: 200 };
    assert.strictEqual(accruedLateFee(due, rule, day(10)), 0);
    assert.strictEqual(accruedLateFee(due, rule, day(11)), 200);
  });

  test("DAILY charges per day after the grace period", () => {
    const rule = { gracePeriodDays: 5, feeType: "DAILY" as const, amount: 20 };
    assert.strictEqual(accruedLateFee(due, rule, day(8)), 60);
  });

  test("SLAB picks the first matching slab, open-ended last slab", () => {
    const rule = {
      gracePeriodDays: 0,
      feeType: "SLAB" as const,
      amount: 0,
      slabsJson: JSON.stringify([
        { uptoDays: 10, amount: 100 },
        { uptoDays: 20, amount: 250 },
        { uptoDays: null, amount: 500 },
      ]),
    };
    assert.strictEqual(accruedLateFee(due, rule, day(5)), 100);
    assert.strictEqual(accruedLateFee(due, rule, day(15)), 250);
    assert.strictEqual(accruedLateFee(due, rule, day(90)), 500);
  });

  test("slab validation rejects bad input", () => {
    assert.throws(() => parseSlabs([]));
    assert.throws(() => parseSlabs([{ uptoDays: -1, amount: 10 }]));
    assert.throws(() => parseSlabs([{ uptoDays: 5, amount: "x" }]));
  });

  test("waivers reduce the late fee; settled charges keep their billed late fee", () => {
    const rule = { gracePeriodDays: 0, feeType: "FIXED" as const, amount: 300 };
    const charge = {
      id: 1,
      dueDate: due,
      status: "UNPAID",
      baseAmount: "1000.00", // Prisma Decimals arrive as strings/objects
      discountAmount: "100.00",
      lateFeeAmount: "0.00",
      paidAmount: "200.00",
      sessionId: 1,
    };
    assert.strictEqual(effectiveLateFee(charge, rule, 0, day(30)), 300);
    assert.strictEqual(effectiveLateFee(charge, rule, 300, day(30)), 0, "fully waived");
    assert.strictEqual(effectiveLateFee({ ...charge, status: "PAID", lateFeeAmount: "50.00" }, rule, 0, day(30)), 50);
    // 1000 - 100 + 300 - 200 — computed numerically, never as concatenated strings
    assert.strictEqual(outstandingOf(charge, 300), 1000);
  });

  test("receipt numbers are derived from the payment id", () => {
    assert.strictEqual(receiptNumberFor(42, new Date("2026-05-01")), "REC-2026-000042");
    assert.notStrictEqual(receiptNumberFor(42), receiptNumberFor(43));
  });
});

describe("fee access control", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) =>
    jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
  const call = (method: string, path: string, role?: string, body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("a student can no longer list every student's invoices or refunds", async () => {
    // This user has no student record, so they own nothing -> refused instead of "everything".
    assert.strictEqual((await call("GET", "/api/fees/invoices", "STUDENT")).status, 400);
    assert.strictEqual((await call("GET", "/api/refunds", "STUDENT")).status, 400);
  });

  test("a student can't request a refund on someone else's fees", async () => {
    const res = await call("POST", "/api/refunds", "STUDENT", { studentId: 1, amount: 100, reason: "Paid twice" });
    assert.strictEqual(res.status, 403);
  });

  test("refund approval, payout and charge discounts are Super Admin only", async () => {
    assert.strictEqual((await call("PATCH", "/api/refunds/1/approve", "ADMIN", { approved: true })).status, 403);
    assert.strictEqual((await call("PATCH", "/api/refunds/1/process", "ADMIN")).status, 403);
    assert.strictEqual((await call("POST", "/api/fees/adjustments", "ADMIN", {})).status, 403);
  });

  test("admins can apply waivers at the payment desk", async () => {
    // Unknown student, so nothing is written — we only check the role is no longer refused.
    const res = await call("POST", "/api/fees/payments/multi-month", "ADMIN", {
      studentId: 999999999,
      selectedMonths: [{ month: 4, year: 2026 }],
      paymentAmount: 100,
      paymentMode: "CASH",
      waiveLateFines: true,
    });
    assert.notStrictEqual(res.status, 403, "waivers are no longer Super Admin only");
  });

  test("manual payment validates input", async () => {
    assert.strictEqual((await call("POST", "/api/payments/manual", "ADMIN", { studentId: 1, amount: -5, mode: "CASH" })).status, 400);
    assert.strictEqual((await call("POST", "/api/payments/manual", "ADMIN", { studentId: 1, amount: 100, mode: "GATEWAY" })).status, 400);
  });

  test("late-fee rules are validated", async () => {
    const bad = await call("POST", "/api/fees/late-fee-rules", "ADMIN", { sessionId: 1, feeType: "SLAB", amount: 0, slabsJson: [] });
    assert.strictEqual(bad.status, 400);
  });

  test("the overview is staff-only", async () => {
    assert.strictEqual((await call("GET", "/api/fees/overview", "STUDENT")).status, 403);
  });

  test("webhook without a configured secret is refused (no unsigned 'payment captured')", async () => {
    if (process.env.RAZORPAY_WEBHOOK_SECRET) return; // configured environments are covered by signature checks
    const res = await call("POST", "/api/payments/razorpay/webhook", undefined, { event: "payment.captured" });
    assert.notStrictEqual(res.status, 200);
  });
});
