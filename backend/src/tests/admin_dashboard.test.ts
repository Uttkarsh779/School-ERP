import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";

// Admin dashboard: ADMIN/SUPER_ADMIN only; returns the operational sections. Read-only.

describe("admin dashboard", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) =>
    jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
  const get = (role?: string) =>
    fetch(`${base}/api/dashboard/admin`, { headers: role ? { Authorization: `Bearer ${tokenFor(role)}` } : {} });

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("only admins can open it", async () => {
    assert.strictEqual((await get()).status, 401);
    for (const role of ["TEACHER", "STUDENT", "PARENT"]) assert.strictEqual((await get(role)).status, 403, role);
  });

  test("returns today, this month, fees and attention sections with consistent numbers", async () => {
    const res = await get("ADMIN");
    assert.strictEqual(res.status, 200);
    const { data } = (await res.json()) as { data: any };
    for (const key of ["attendanceToday", "attendanceMonth", "fees", "exams", "admissions", "birthdays", "attention", "recentNotices"]) {
      assert.ok(key in data, `missing ${key}`);
    }
    const a = data.attendanceToday;
    assert.strictEqual(a.classesMarked + a.notMarked.length, a.classesTotal, "marked + not marked = all classes");
    assert.strictEqual(a.marked, a.counts.PRESENT + a.counts.ABSENT + a.counts.LATE + a.counts.LEAVE);
    assert.ok(typeof data.fees.outstanding === "number");
    // No invented placeholder figures.
    assert.notStrictEqual(data.financialSummary.totalMonthlyBilled, 185000);
  });
});
