import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { parseAdmissionFilters } from "../modules/admissionReport/service";
import { parseAmount, parseDate, parseExpenseFilters, parseExpenseInput, parseVoidReason } from "../modules/construction/validation";
import {
  createExpense,
  createProject,
  getConstructionSummary,
  listExpenses,
  updateExpense,
  voidExpense,
} from "../modules/construction/service";

// Admission Report + Building Construction Expense are SUPER_ADMIN only. The RBAC and
// validation tests below never reach the database (requests are rejected first); the
// final suite does, and skips itself if the construction tables haven't been created.

const statusOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as { statusCode?: number }).statusCode;
  }
  return undefined;
};

describe("construction validation", () => {
  test("amounts must be positive with at most 2 decimals", () => {
    assert.strictEqual(parseAmount("1500.50"), "1500.50");
    assert.strictEqual(parseAmount(250), "250");
    for (const bad of ["0", "-5", "1.234", "abc", "", "1e5", "12345678901"]) {
      assert.strictEqual(statusOf(() => parseAmount(bad)), 400, `expected "${bad}" to be rejected`);
    }
  });

  test("dates must be real calendar dates and not in the future", () => {
    assert.strictEqual(parseDate("2026-01-15", "d").toISOString().slice(0, 10), "2026-01-15");
    assert.strictEqual(statusOf(() => parseDate("2026-02-31", "d")), 400);
    assert.strictEqual(statusOf(() => parseDate("15-01-2026", "d")), 400);
    assert.strictEqual(statusOf(() => parseDate("2999-01-01", "d", { notFuture: true })), 400);
  });

  test("required expense fields are enforced on create but not on partial update", () => {
    assert.strictEqual(statusOf(() => parseExpenseInput({})), 400);
    assert.strictEqual(
      statusOf(() =>
        parseExpenseInput({ projectId: 1, title: "  ", category: "MATERIALS", expenseDate: "2026-01-01", amount: "10" })
      ),
      400
    );
    assert.strictEqual(statusOf(() => parseExpenseInput({ projectId: 1, title: "x", category: "BOGUS", expenseDate: "2026-01-01", amount: "10" })), 400);

    const partial = parseExpenseInput({ amount: "99.90" }, true);
    assert.deepStrictEqual(partial, { amount: "99.90" });
    assert.strictEqual(statusOf(() => parseExpenseInput({ title: "" }, true)), 400);
  });

  test("void needs a meaningful reason and filters reject bad values", () => {
    assert.strictEqual(statusOf(() => parseVoidReason({})), 400);
    assert.strictEqual(statusOf(() => parseVoidReason({ reason: "oops" })), 400);
    assert.strictEqual(parseVoidReason({ reason: "Duplicate entry" }), "Duplicate entry");
    assert.strictEqual(statusOf(() => parseExpenseFilters({ from: "2026-05-01", to: "2026-04-01" })), 400);
    assert.strictEqual(statusOf(() => parseExpenseFilters({ sortBy: "password" })), 400);
  });
});

describe("admission report filter validation", () => {
  test("valid filters parse, invalid ones are 400", () => {
    const f = parseAdmissionFilters({ gender: "FEMALE", category: "OBC", status: "active", from: "2026-04-01", to: "2026-04-30" });
    assert.strictEqual(f.gender, "FEMALE");
    assert.strictEqual(f.status, "active");
    assert.strictEqual(f.sortBy, "admissionDate");
    assert.strictEqual(statusOf(() => parseAdmissionFilters({ gender: "X" })), 400);
    assert.strictEqual(statusOf(() => parseAdmissionFilters({ from: "2026-05-01", to: "2026-04-01" })), 400);
    assert.strictEqual(statusOf(() => parseAdmissionFilters({ sessionId: "abc" })), 400);
    assert.strictEqual(statusOf(() => parseAdmissionFilters({ sortBy: "aadharNumber" })), 400);
  });
});

describe("SUPER_ADMIN-only access", () => {
  let server: Server;
  let base: string;
  const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
  const tokenFor = (role: string) => jwt.sign({ id: 999999, email: `${role}@test.local`, role }, secret());

  const endpoints: Array<[string, string]> = [
    ["GET", "/api/admission-report"],
    ["GET", "/api/admission-report/overview"],
    ["GET", "/api/admission-report/filter-options"],
    ["GET", "/api/construction/summary"],
    ["GET", "/api/construction/projects"],
    ["POST", "/api/construction/projects"],
    ["PATCH", "/api/construction/projects/1"],
    ["GET", "/api/construction/expenses"],
    ["GET", "/api/construction/expenses/1"],
    ["POST", "/api/construction/expenses"],
    ["PATCH", "/api/construction/expenses/1"],
    ["POST", "/api/construction/expenses/1/void"],
  ];

  const call = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
    });

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("requests without a token are rejected with 401", async () => {
    for (const [method, path] of endpoints) {
      const res = await call(method, path);
      assert.strictEqual(res.status, 401, `${method} ${path}`);
    }
  });

  test("ADMIN, TEACHER, STUDENT and PARENT are rejected with 403", async () => {
    for (const role of ["ADMIN", "TEACHER", "STUDENT", "PARENT"]) {
      const token = tokenFor(role);
      for (const [method, path] of endpoints) {
        const res = await call(method, path, token);
        assert.strictEqual(res.status, 403, `${role} ${method} ${path}`);
        const json = (await res.json()) as { success: boolean };
        assert.strictEqual(json.success, false);
      }
    }
  });

  test("SUPER_ADMIN passes authorization and hits server-side validation", async () => {
    const token = tokenFor("SUPER_ADMIN");
    const badCreate = await call("POST", "/api/construction/expenses", token, { title: "Cement", amount: "-10" });
    assert.strictEqual(badCreate.status, 400);
    const badVoid = await call("POST", "/api/construction/expenses/1/void", token, { reason: "" });
    assert.strictEqual(badVoid.status, 400);
    const badFilter = await call("GET", "/api/admission-report?gender=UNKNOWN", token);
    assert.strictEqual(badFilter.status, 400);
  });

  test("service layer refuses non-SUPER_ADMIN callers even without the route guard", async () => {
    await assert.rejects(
      listExpenses({ id: 1, role: "ADMIN" } as any, parseExpenseFilters({})),
      (err: any) => err.statusCode === 403
    );
    await assert.rejects(getConstructionSummary({ id: 1, role: "ADMIN" } as any), (err: any) => err.statusCode === 403);
  });
});

describe("construction expenses against the database", async () => {
  let tablesExist = false;
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass('"ConstructionExpense"')::text AS t`);
    tablesExist = !!(rows as Array<{ t: string | null }>)[0]?.t;
  } catch {
    tablesExist = false;
  }

  test("create, idempotent replay, edit, void and totals", { skip: !tablesExist && "construction tables not created yet" }, async () => {
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: { email: `test_construction_${stamp}@school.com`, passwordHash: "dummy", role: "SUPER_ADMIN", name: "Construction Tester" },
    });
    const actor = { id: user.id, role: "SUPER_ADMIN" as const };
    let projectId: number | undefined;

    try {
      const project = await createProject(actor, { name: `Test Block ${stamp}`, budget: "100000.00" });
      projectId = project.id;
      const base = { projectId: project.id, category: "MATERIALS" as const, expenseDate: new Date("2026-01-10") };

      const key = `test-${stamp}-abcdef`;
      const first = await createExpense(actor, { ...base, title: "Cement", amount: "1200.50" }, key);
      const replay = await createExpense(actor, { ...base, title: "Cement", amount: "1200.50" }, key);
      assert.strictEqual(first.replayed, false);
      assert.strictEqual(replay.replayed, true);
      assert.strictEqual(replay.expense.id, first.expense.id, "same idempotency key must not create a duplicate");

      const second = await createExpense(actor, { ...base, title: "Bricks", amount: "799.50" });

      let list = await listExpenses(actor, parseExpenseFilters({ projectId: String(project.id) }));
      assert.strictEqual(list.totals.count, 2);
      assert.strictEqual(list.totals.amount, "2000");

      await updateExpense(actor, second.expense.id, { amount: "800.00" });
      list = await listExpenses(actor, parseExpenseFilters({ projectId: String(project.id) }));
      assert.strictEqual(list.totals.amount, "2000.5");

      await voidExpense(actor, first.expense.id, "Duplicate test entry");
      await assert.rejects(voidExpense(actor, first.expense.id, "Again please"), (err: any) => err.statusCode === 409);
      await assert.rejects(updateExpense(actor, first.expense.id, { amount: "1" }), (err: any) => err.statusCode === 409);

      list = await listExpenses(actor, parseExpenseFilters({ projectId: String(project.id), includeVoid: "true" }));
      assert.strictEqual(list.rows.length, 2, "voided rows are still listed for audit");
      assert.strictEqual(list.totals.count, 1, "voided rows are excluded from totals");
      assert.strictEqual(list.totals.amount, "800");

      const logs = await prisma.constructionAuditLog.findMany({
        where: { entityType: "ConstructionExpense", entityId: { in: [first.expense.id, second.expense.id] } },
      });
      assert.deepStrictEqual(logs.map((l: any) => l.action).sort(), ["CREATE", "CREATE", "UPDATE", "VOID"]);
    } finally {
      // Clean up everything this test created.
      await prisma.constructionAuditLog.deleteMany({ where: { userId: user.id } });
      if (projectId) {
        await prisma.constructionExpense.deleteMany({ where: { projectId } });
        await prisma.constructionProject.delete({ where: { id: projectId } });
      }
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
