import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";

// Teacher dashboard + class-teacher access to the monthly attendance register. Uses a
// user id with no staff record, so nothing is read beyond a staff lookup and nothing is
// written.

describe("teacher dashboard & register access", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) =>
    jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
  const get = (path: string, role?: string) =>
    fetch(base + path, { headers: role ? { Authorization: `Bearer ${tokenFor(role)}` } : {} });

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("/dashboard/teacher is TEACHER only", async () => {
    assert.strictEqual((await get("/api/dashboard/teacher")).status, 401);
    for (const role of ["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]) {
      assert.strictEqual((await get("/api/dashboard/teacher", role)).status, 403, role);
    }
  });

  test("a teacher without a staff profile gets an explicit empty dashboard", async () => {
    const res = await get("/api/dashboard/teacher", "TEACHER");
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as { data: { hasStaffProfile: boolean } };
    assert.strictEqual(json.data.hasStaffProfile, false);
  });

  test("admin dashboard is still admin-only", async () => {
    assert.strictEqual((await get("/api/dashboard/admin", "TEACHER")).status, 403);
  });

  test("teachers can't open a register for a class they don't class-teach; overview stays admin-only", async () => {
    assert.strictEqual((await get("/api/attendance/report/monthly/1?year=2026&month=10", "TEACHER")).status, 403);
    assert.strictEqual((await get("/api/attendance/report/monthly?year=2026&month=10", "TEACHER")).status, 403);
    assert.strictEqual((await get("/api/attendance/report/monthly/1?year=2026&month=10", "STUDENT")).status, 403);
  });
});
