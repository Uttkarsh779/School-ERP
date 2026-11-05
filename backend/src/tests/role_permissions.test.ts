import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";

// Who may do what (config/permissions.ts). Every call here is either refused or read-only, or
// fails validation before writing, so the live database is never changed.
describe("role permissions", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) => jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
  const status = async (method: string, path: string, role: string, body?: unknown) =>
    (
      await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor(role)}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    ).status;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("the office can't change money rules any more", async () => {
    assert.strictEqual(await status("POST", "/api/fees/adjustments/waive-fee", "ADMIN", {}), 403);
    assert.strictEqual(await status("POST", "/api/fees/heads", "ADMIN", {}), 403);
    assert.strictEqual(await status("PUT", "/api/fees/heads/1", "ADMIN", {}), 403);
    assert.strictEqual(await status("POST", "/api/fee-structures", "ADMIN", {}), 403);
    assert.strictEqual(await status("PUT", "/api/fee-structures/1", "ADMIN", {}), 403);
    assert.strictEqual(await status("POST", "/api/fees/late-fee-rules", "ADMIN", {}), 403);
    assert.strictEqual(await status("PUT", "/api/fees/billing-settings", "ADMIN", {}), 403);
    assert.strictEqual(await status("PUT", "/api/transport/villages/1/fee", "ADMIN", {}), 403);
    assert.strictEqual(await status("DELETE", "/api/class-sections/999999", "ADMIN"), 403);
    assert.strictEqual(await status("POST", "/api/exams/schemes", "ADMIN", {}), 403);
  });

  test("fee-head waivers and discounts at the desk are Super Admin only", async () => {
    const withWaiver = {
      studentId: 999999999,
      selectedMonths: [{ month: 4, year: 2026, headWaivers: [{ feeHeadId: 1, waiverAmount: 500, reason: "x" }] }],
      paymentAmount: 100,
      paymentMode: "CASH",
    };
    const withDiscount = { ...withWaiver, selectedMonths: [{ month: 4, year: 2026 }], lumpSumDiscount: { type: "FIXED_AMOUNT", value: 200, reason: "x" } };
    for (const role of ["ADMIN", "ACCOUNTANT"]) {
      assert.strictEqual(await status("POST", "/api/fees/payments/multi-month", role, withWaiver), 403, role);
      assert.strictEqual(await status("POST", "/api/fees/payments/multi-month", role, withDiscount), 403, role);
    }
    // Unknown student: refused for that reason, not for the role.
    assert.notStrictEqual(await status("POST", "/api/fees/payments/multi-month", "SUPER_ADMIN", withWaiver), 403);
  });

  test("the Principal sees everything but doesn't handle money", async () => {
    assert.strictEqual(await status("GET", "/api/fees/overview", "PRINCIPAL"), 200);
    assert.strictEqual(await status("GET", "/api/students", "PRINCIPAL"), 200);
    assert.strictEqual(await status("GET", "/api/staff", "PRINCIPAL"), 200);
    assert.notStrictEqual(await status("GET", "/api/attendance/report", "PRINCIPAL"), 403); // needs a date range
    assert.strictEqual(await status("GET", "/api/leaves", "PRINCIPAL"), 200);
    assert.strictEqual(await status("GET", "/api/dashboard/admin", "PRINCIPAL"), 200);
    assert.strictEqual(await status("POST", "/api/payments/manual", "PRINCIPAL", {}), 403);
    assert.strictEqual(await status("POST", "/api/fees/payments/multi-month", "PRINCIPAL", {}), 403);
    assert.strictEqual(await status("GET", "/api/accounts/summary", "PRINCIPAL"), 403);
    assert.strictEqual(await status("POST", "/api/students", "PRINCIPAL", {}), 403);
    assert.strictEqual(await status("PATCH", "/api/staff/1", "PRINCIPAL", {}), 403);
    assert.strictEqual(await status("GET", "/api/backups", "PRINCIPAL"), 403);
    // Academic work is the Principal's: refused only for bad input, not for the role.
    assert.notStrictEqual(await status("PATCH", "/api/exams/999999/publish", "PRINCIPAL", {}), 403);
    assert.notStrictEqual(await status("POST", "/api/class-sections", "PRINCIPAL", {}), 403);
    assert.notStrictEqual(await status("POST", "/api/notices", "PRINCIPAL", {}), 403);
  });

  test("the Accountant handles fees and accounts only", async () => {
    assert.strictEqual(await status("POST", "/api/payments/manual", "ACCOUNTANT", { studentId: 1, amount: -5, mode: "CASH" }), 400);
    assert.strictEqual(await status("GET", "/api/fees/reports/day-book?from=2026-10-01&to=2026-10-31", "ACCOUNTANT"), 200);
    assert.strictEqual(await status("GET", "/api/students", "ACCOUNTANT"), 200);
    assert.strictEqual(await status("POST", "/api/students", "ACCOUNTANT", {}), 403);
    assert.strictEqual(await status("GET", "/api/staff", "ACCOUNTANT"), 403);
    assert.strictEqual(await status("GET", "/api/attendance/report", "ACCOUNTANT"), 403);
    assert.strictEqual(await status("GET", "/api/exams", "ACCOUNTANT"), 403);
    assert.strictEqual(await status("POST", "/api/fees/heads", "ACCOUNTANT", {}), 403);
    assert.strictEqual(await status("POST", "/api/fees/adjustments/waive-fee", "ACCOUNTANT", {}), 403);
    assert.strictEqual(await status("POST", "/api/notices", "ACCOUNTANT", {}), 403);
  });

  test("only the Super Admin publishes when no Principal is signed in", async () => {
    assert.strictEqual(await status("PATCH", "/api/exams/999999/publish", "ADMIN", {}), 403);
    assert.strictEqual(await status("PATCH", "/api/exams/999999/publish", "TEACHER", {}), 403);
  });
});
