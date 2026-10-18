import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { parseMonth, percentage } from "../modules/attendance/reportService";

// Detailed monthly attendance report. These tests never reach the database: requests are
// rejected by auth/validation first.

describe("monthly attendance report helpers", () => {
  test("parseMonth returns the month's first and last day", () => {
    const feb = parseMonth({ year: "2028", month: "2" }); // leap year
    assert.strictEqual(feb.from.toISOString().slice(0, 10), "2028-02-01");
    assert.strictEqual(feb.to.toISOString().slice(0, 10), "2028-02-29");
    assert.strictEqual(feb.daysInMonth, 29);
  });

  test("parseMonth rejects bad input with 400", () => {
    for (const q of [{}, { year: "2026", month: "13" }, { year: "2026", month: "0" }, { year: "abc", month: "1" }]) {
      assert.throws(() => parseMonth(q), (err: any) => err.statusCode === 400, JSON.stringify(q));
    }
  });

  test("attendance % is present / marked days, null when nothing marked", () => {
    assert.strictEqual(percentage(18, 20), 90);
    assert.strictEqual(percentage(2, 3), 66.7);
    assert.strictEqual(percentage(0, 0), null);
  });
});

describe("monthly attendance report access", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) =>
    jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const paths = ["/api/attendance/report/monthly?year=2026&month=10", "/api/attendance/report/monthly/1?year=2026&month=10"];

  test("no token → 401; teacher, student, parent → 403", async () => {
    for (const path of paths) {
      assert.strictEqual((await fetch(base + path)).status, 401, path);
      for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
        const res = await fetch(base + path, { headers: { Authorization: `Bearer ${tokenFor(role)}` } });
        assert.strictEqual(res.status, 403, `${role} ${path}`);
      }
    }
  });

  test("admins pass auth and get 400 for an invalid month", async () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      const res = await fetch(`${base}/api/attendance/report/monthly?year=2026&month=14`, {
        headers: { Authorization: `Bearer ${tokenFor(role)}` },
      });
      assert.strictEqual(res.status, 400, role);
    }
  });
});
