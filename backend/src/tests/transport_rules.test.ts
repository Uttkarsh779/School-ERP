import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { transportFeeForMonth } from "../modules/transport/transportVillageService";

// Transport rules that need no database writes: who can read the roster, and billing dates.
const village = { monthlyFee: 1000, feeHistory: [] };
const assignment = (startDate: string, policy: string, endDate?: string) => ({ startDate, endDate, policy, village });

describe("transport fee for a month", () => {
  test("starting on the 1st is a full month, whatever the policy", () => {
    for (const policy of ["FULL_MONTH", "PRORATED", "NEXT_PERIOD"]) {
      assert.strictEqual(transportFeeForMonth([assignment("2026-11-01", policy)], 2026, 11), 1000, policy);
    }
  });

  test("a mid-month start follows the policy", () => {
    assert.strictEqual(transportFeeForMonth([assignment("2026-11-16", "FULL_MONTH")], 2026, 11), 1000);
    assert.strictEqual(transportFeeForMonth([assignment("2026-11-16", "NEXT_PERIOD")], 2026, 11), 0);
    assert.strictEqual(transportFeeForMonth([assignment("2026-11-16", "PRORATED")], 2026, 11), 500);
  });

  test("nothing is billed after transport ends", () => {
    assert.strictEqual(transportFeeForMonth([assignment("2026-04-01", "FULL_MONTH", "2026-10-31")], 2026, 11), 0);
  });

  test("a future fee doesn't apply before its date", () => {
    const changed = { monthlyFee: 1000, feeHistory: [{ effectiveDate: "2026-12-01", monthlyFee: 2000 }, { effectiveDate: "2026-04-01", monthlyFee: 1000 }] };
    const rows = [{ startDate: "2026-04-01", policy: "FULL_MONTH", village: changed }];
    assert.strictEqual(transportFeeForMonth(rows, 2026, 11), 1000);
    assert.strictEqual(transportFeeForMonth(rows, 2026, 12), 2000);
  });
});

describe("over HTTP", () => {
  let server: Server;
  let base: string;
  const token = (role: string) => jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
  before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  test("students and teachers can't read the whole transport roster", async () => {
    for (const role of ["STUDENT", "PARENT", "TEACHER"]) {
      const res = await fetch(`${base}/api/transport/assignments`, { headers: { Authorization: `Bearer ${token(role)}` } });
      assert.strictEqual(res.status, 403, role);
    }
  });

  test("the old route that skipped the bill correction is gone", async () => {
    const res = await fetch(`${base}/api/transport/assignments/discontinue`, { method: "POST", headers: { Authorization: `Bearer ${token("SUPER_ADMIN")}`, "Content-Type": "application/json" }, body: "{}" });
    assert.strictEqual(res.status, 404);
  });

  test("the fee and status routes the page calls exist, and are Super Admin only", async () => {
    const headers = { Authorization: `Bearer ${token("ADMIN")}`, "Content-Type": "application/json" };
    assert.strictEqual((await fetch(`${base}/api/transport/villages/1/fee`, { method: "PUT", headers, body: "{}" })).status, 403);
    assert.strictEqual((await fetch(`${base}/api/transport/villages/1/status`, { method: "PATCH", headers, body: "{}" })).status, 403);
  });
});
