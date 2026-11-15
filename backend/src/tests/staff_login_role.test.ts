import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";

// Designation and login role are separate. Uses a throwaway ZZ staff member, with no classes or
// students, so nothing here reaches real people. Removed afterwards.
const tag = `zzrole${Date.now().toString(36)}`;
let server: Server;
let base: string;
let staffId = 0;
let userId = 0;
let superToken = "";
let adminToken = "";
const extraUsers: number[] = [];

const call = async (method: string, path: string, token: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
};
const roleNow = async () => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const owner = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const secret = process.env.JWT_SECRET || "fallback_jwt_secret_key";
  superToken = jwt.sign({ id: owner.id, email: owner.email, role: owner.role }, secret);
  adminToken = jwt.sign({ id: 999999, email: "x@test.local", role: "ADMIN" }, secret);
});

after(async () => {
  await prisma.feeAuditLog.deleteMany({ where: { action: "CHANGE_LOGIN_ROLE", entityId: { in: [userId, ...extraUsers] } } });
  await prisma.staff.deleteMany({ where: { user: { email: { startsWith: tag } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await new Promise<void>((r) => server.close(() => r()));
});

describe("role and designation", () => {
  test("a new staff member gets the usual role unless another is chosen", async () => {
    const usual = await call("POST", "/api/staff", superToken, { name: `${tag} A`, email: `${tag}a@test.local`, password: "Start12345", staffCategory: "VICE_PRINCIPAL" });
    assert.strictEqual(usual.status, 201, JSON.stringify(usual.json));
    assert.strictEqual(usual.json.data.user.role, "TEACHER");
    staffId = usual.json.data.id;
    userId = usual.json.data.userId;

    const chosen = await call("POST", "/api/staff", superToken, { name: `${tag} B`, email: `${tag}b@test.local`, password: "Start12345", staffCategory: "VICE_PRINCIPAL", loginRole: "PRINCIPAL" });
    assert.strictEqual(chosen.status, 201, JSON.stringify(chosen.json));
    assert.strictEqual(chosen.json.data.user.role, "PRINCIPAL");
    extraUsers.push(chosen.json.data.userId);
  });

  test("changing designation doesn't change access", async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    const r = await call("PATCH", `/api/staff/${staffId}`, superToken, { staffCategory: "ACCOUNTANT" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.staffCategory, "ACCOUNTANT");
    assert.strictEqual(await roleNow(), "ADMIN");
  });

  test("the login role changes only on purpose, and it's logged", async () => {
    const r = await call("PATCH", `/api/staff/${staffId}`, superToken, { loginRole: "TEACHER" });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(await roleNow(), "TEACHER");
    const log = await prisma.feeAuditLog.findFirst({ where: { action: "CHANGE_LOGIN_ROLE", entityId: userId } });
    assert.ok(log, "the change is in the audit log");
    assert.match(String(log.oldValues), /ADMIN/);
    assert.match(String(log.newValues), /TEACHER/);

    await call("PATCH", `/api/staff/${staffId}`, superToken, { loginRole: "TEACHER" });
    assert.strictEqual(await prisma.feeAuditLog.count({ where: { action: "CHANGE_LOGIN_ROLE", entityId: userId } }), 1, "saving the same role logs nothing");
  });

  test("Super Admin can't be handed out from this form", async () => {
    const r = await call("PATCH", `/api/staff/${staffId}`, superToken, { loginRole: "SUPER_ADMIN" });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(await roleNow(), "TEACHER");
    assert.strictEqual((await call("POST", "/api/staff", superToken, { name: `${tag} C`, email: `${tag}c@test.local`, staffCategory: "TEACHER", loginRole: "STUDENT" })).status, 400);
  });

  test("a Super Admin's own role can't be changed here", async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: "SUPER_ADMIN" } });
    assert.strictEqual((await call("PATCH", `/api/staff/${staffId}`, superToken, { loginRole: "TEACHER" })).status, 400);
    await prisma.user.update({ where: { id: userId }, data: { role: "TEACHER" } });
  });

  test("only a Super Admin can change it", async () => {
    assert.strictEqual((await call("PATCH", `/api/staff/${staffId}`, adminToken, { loginRole: "PRINCIPAL" })).status, 403);
    assert.strictEqual(await roleNow(), "TEACHER");
  });
});
