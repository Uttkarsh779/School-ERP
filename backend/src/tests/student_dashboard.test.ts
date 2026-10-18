import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";

// Student dashboard: STUDENT only, always the caller's own data. Uses a user id with no
// student record, so nothing is read beyond that lookup and nothing is written.

describe("student dashboard access", () => {
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

  test("/dashboard/student is STUDENT only", async () => {
    assert.strictEqual((await get("/api/dashboard/student")).status, 401);
    for (const role of ["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT"]) {
      assert.strictEqual((await get("/api/dashboard/student", role)).status, 403, role);
    }
  });

  test("a student login without a student record gets an explicit empty response", async () => {
    const res = await get("/api/dashboard/student", "STUDENT");
    assert.strictEqual(res.status, 200);
    const json = (await res.json()) as { data: { hasStudentProfile: boolean } };
    assert.strictEqual(json.data.hasStudentProfile, false);
  });

  test("a student can't open someone else's report card", async () => {
    assert.strictEqual((await get("/api/exams/1/report-card/1", "STUDENT")).status, 403);
  });

  test("full student history is admin-only", async () => {
    assert.strictEqual((await get("/api/students/1/history")).status, 401);
    for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
      assert.strictEqual((await get("/api/students/1/history", role)).status, 403, role);
    }
  });

  test("history for a non-existent student is 404", async () => {
    assert.strictEqual((await get("/api/students/987654321/history", "ADMIN")).status, 404);
    assert.strictEqual((await get("/api/students/abc/history", "SUPER_ADMIN")).status, 404);
  });
});
