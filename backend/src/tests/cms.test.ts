import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { parseCollectionInput, parseInquiry, parseMapEmbed, parseSettingsUpdate, parseStats } from "../modules/cms/cmsService";

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
  test("settings: only whitelisted fields are kept", () => {
    const out = parseSettingsUpdate({ schoolName: "  Test School ", id: 99, updatedAt: "x", hacker: true } as any);
    assert.deepStrictEqual(out, { schoolName: "Test School" });
    assert.strictEqual(statusOf(() => parseSettingsUpdate({ schoolName: "" })), 400);
    assert.strictEqual(statusOf(() => parseSettingsUpdate({ email: "nope" })), 400);
    assert.strictEqual(statusOf(() => parseSettingsUpdate({ logoUrl: "javascript:alert(1)" })), 400);
  });
  test("map embed accepts the Google iframe and nothing else", () => {
    const iframe = '<iframe src="https://www.google.com/maps/embed?pb=!1m18&amp;x=1" width="600"></iframe>';
    assert.ok(parseMapEmbed(iframe)!.startsWith("https://www.google.com/maps/embed?pb="));
    assert.strictEqual(parseMapEmbed(""), null);
    assert.strictEqual(statusOf(() => parseMapEmbed("https://evil.example/maps/embed")), 400);
    assert.strictEqual(statusOf(() => parseMapEmbed("http://www.google.com/maps/embed")), 400);
  });
  test("stats", () => {
    assert.deepStrictEqual(parseStats([{ value: "25+", label: "Years" }, { value: "", label: "" }]), [{ value: "25+", label: "Years" }]);
    assert.strictEqual(statusOf(() => parseStats([{ value: "1", label: "" }])), 400);
    assert.strictEqual(statusOf(() => parseStats(new Array(7).fill({ value: "1", label: "a" }))), 400);
  });
  test("collections", () => {
    assert.strictEqual(statusOf(() => parseCollectionInput("gallery", { title: "Sports day" }, false)), 400); // image required
    assert.deepStrictEqual(parseCollectionInput("faqs", { answer: "Yes", id: 5 }, true), { answer: "Yes" });
    assert.strictEqual(statusOf(() => parseCollectionInput("facilities", { iconName: "skull" }, true)), 400);
    assert.strictEqual(statusOf(() => parseCollectionInput("users", {}, true)), 404);
  });
  test("enquiry", () => {
    const ok = parseInquiry({ studentName: "Aarav", parentName: "Raj Kumar", phone: "98765 43210", gradeApplyingFor: "Class I" });
    assert.strictEqual(ok.studentName, "Aarav");
    assert.strictEqual(statusOf(() => parseInquiry({ studentName: "Aarav", parentName: "Raj", phone: "abc", gradeApplyingFor: "I" })), 400);
    assert.strictEqual(statusOf(() => parseInquiry({ studentName: "Aarav", parentName: "Raj", phone: "9876543210", gradeApplyingFor: "I", email: "bad" })), 400);
  });
});

describe("access", () => {
  test("public website data is open and includes every section", async () => {
    const r = await call("GET", "/api/public/website");
    assert.strictEqual(r.status, 200);
    for (const k of ["settings", "facilities", "notices", "gallery", "testimonials", "faqs"]) assert.ok(k in r.json.data, k);
    assert.ok(r.json.data.settings.schoolName);
  });
  test("admin CMS is closed to everyone but admins", async () => {
    assert.strictEqual((await call("GET", "/api/admin/cms/settings")).status, 401);
    assert.strictEqual((await call("GET", "/api/admin/cms/gallery", tokenFor(999999, "TEACHER"))).status, 403);
    assert.strictEqual((await call("PUT", "/api/admin/cms/settings", tokenFor(999999, "STUDENT"), { schoolName: "X" })).status, 403);
    assert.strictEqual((await call("GET", "/api/admin/cms/inquiries", tokenFor(999999, "TEACHER"))).status, 403);
  });
  test("unknown collections 404", async () => {
    assert.strictEqual((await call("GET", "/api/admin/cms/users", tokenFor(999999, "ADMIN"))).status, 404);
  });
  test("honeypot enquiries are accepted silently but not stored", async () => {
    const before = await prisma.admissionInquiry.count();
    const r = await call("POST", "/api/public/inquiry", undefined, { website: "spam.example", studentName: "Bot" });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(await prisma.admissionInquiry.count(), before);
  });
});

describe("admin CRUD against the database", () => {
  test("FAQ create → update → delete", async () => {
    const A = tokenFor(999999, "ADMIN");
    const c = await call("POST", "/api/admin/cms/faqs", A, { question: "Test question here?", answer: "Test answer", order: 99, isActive: false });
    assert.strictEqual(c.status, 201, JSON.stringify(c.json));
    const id = c.json.data.id;
    try {
      const u = await call("PUT", `/api/admin/cms/faqs/${id}`, A, { answer: "Updated", createdAt: "1999-01-01" });
      assert.strictEqual(u.status, 200);
      assert.strictEqual(u.json.data.answer, "Updated");
      assert.notStrictEqual(new Date(u.json.data.createdAt).getFullYear(), 1999);
      const pub = await call("GET", "/api/public/website");
      assert.ok(!pub.json.data.faqs.some((f: any) => f.id === id), "inactive FAQ must not be public");
    } finally {
      assert.strictEqual((await call("DELETE", `/api/admin/cms/faqs/${id}`, A)).status, 200);
    }
    assert.strictEqual((await call("DELETE", `/api/admin/cms/faqs/${id}`, A)).status, 404);
  });
});
