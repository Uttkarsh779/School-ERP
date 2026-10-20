import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { listTeacherNoticeClasses, parseClassSectionIds, parseNoticeFields } from "../modules/notices/service";

const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tokenFor = (id: number, role: string) => jwt.sign({ id, email: `${role}-${id}@t.local`, role }, secret());
const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { statusCode?: number }).statusCode;
  }
  return undefined;
};

let server: Server;
let base: string;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));

describe("validators", () => {
  test("notice fields", () => {
    assert.deepStrictEqual(parseNoticeFields({ title: "  PTM on Friday ", body: " Please attend. " }), {
      title: "PTM on Friday",
      body: "Please attend.",
      attachmentUrl: null,
      isImportant: false,
    });
    assert.strictEqual(statusOf(() => parseNoticeFields({ title: "Hi", body: "Body text" })), 400);
    assert.strictEqual(statusOf(() => parseNoticeFields({ title: "Title ok", body: "" })), 400);
    assert.strictEqual(statusOf(() => parseNoticeFields({ title: "Title ok", body: "Body", attachmentUrl: "javascript:alert(1)" })), 400);
    assert.strictEqual(statusOf(() => parseNoticeFields({ title: "Title ok", body: "Body", isImportant: "yes" })), 400);
  });
  test("class list", () => {
    assert.deepStrictEqual(parseClassSectionIds([3, "3", 4]), [3, 4]);
    assert.strictEqual(statusOf(() => parseClassSectionIds([])), 400);
    assert.strictEqual(statusOf(() => parseClassSectionIds([0])), 400);
    assert.strictEqual(statusOf(() => parseClassSectionIds("5")), 400);
  });
});

describe("access", () => {
  test("students and parents cannot post or delete", async () => {
    assert.strictEqual((await call("POST", "/api/notices", tokenFor(999999, "STUDENT"), { title: "Hello all", body: "Test" })).status, 403);
    assert.strictEqual((await call("DELETE", "/api/notices/1", tokenFor(999999, "PARENT"))).status, 403);
  });
  test("sent/classes lists are teacher-only", async () => {
    assert.strictEqual((await call("GET", "/api/notices/sent", tokenFor(999999, "STUDENT"))).status, 403);
    assert.strictEqual((await call("GET", "/api/notices/classes", tokenFor(999999, "ADMIN"))).status, 403);
  });
  test("a teacher without a staff record has no classes to post to", async () => {
    const r = await call("POST", "/api/notices", tokenFor(999999, "TEACHER"), { title: "Hello class", body: "Test", classSectionIds: [1] });
    assert.strictEqual(r.status, 403);
  });
});

describe("teacher notice flow against the database", () => {
  test("post to own class → students of that class see it; other classes are refused", async () => {
    const staff = await prisma.staff.findFirst({
      where: { user: { role: "TEACHER", isActive: true } },
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
    });
    if (!staff) return;
    const classes = await listTeacherNoticeClasses(staff.userId);
    if (classes.length === 0) return;
    const T = tokenFor(staff.userId, "TEACHER");
    const own = classes[0].id;

    const other = await prisma.classSection.findFirst({ where: { id: { notIn: classes.map((c: any) => c.id) } }, select: { id: true } });
    if (other) {
      const refused = await call("POST", "/api/notices", T, { title: "Not my class", body: "Should fail", classSectionIds: [other.id] });
      assert.strictEqual(refused.status, 403);
    }

    const created = await call("POST", "/api/notices", T, { title: "ZZ test notice", body: "Bring your art file tomorrow.", classSectionIds: [own], isImportant: true });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    const id = created.json.data.id;
    try {
      const sent = await call("GET", "/api/notices/sent", T);
      const mine = sent.json.data.find((n: any) => n.id === id);
      assert.ok(mine, "appears under Sent");
      assert.strictEqual(mine.isImportant, true);
      assert.ok(mine.postedBy?.name);

      const student = await prisma.student.findFirst({ where: { classSectionId: own, isActive: true, userId: { not: null } }, select: { userId: true } });
      if (student?.userId) {
        const inbox = await call("GET", "/api/notices", tokenFor(student.userId, "STUDENT"));
        assert.ok(inbox.json.data.some((n: any) => n.id === id), "student of the class sees it");
      }
      const outsider = await prisma.student.findFirst({ where: { classSectionId: { not: own }, isActive: true, userId: { not: null } }, select: { userId: true } });
      if (outsider?.userId) {
        const inbox = await call("GET", "/api/notices", tokenFor(outsider.userId, "STUDENT"));
        assert.ok(!inbox.json.data.some((n: any) => n.id === id), "other classes don't see it");
      }

      // Another teacher can't delete it.
      assert.strictEqual((await call("DELETE", `/api/notices/${id}`, tokenFor(staff.userId + 100000, "TEACHER"))).status, 403);
    } finally {
      assert.strictEqual((await call("DELETE", `/api/notices/${id}`, T)).status, 200);
    }
    assert.strictEqual((await call("DELETE", `/api/notices/${id}`, T)).status, 404);
  });
});
