import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { publicError, publicMessage } from "../utils/publicError";
import { httpError } from "../utils/httpError";

// Users only ever see messages we wrote; everything else stays in the server log.
class PrismaClientKnownRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("messages we wrote go out", () => {
  test("httpError keeps its status and text", () => {
    assert.deepStrictEqual(publicError(httpError(409, "Marks are locked")), { status: 409, message: "Marks are locked" });
  });

  test("a plain Error from a service keeps its text, as a 400", () => {
    assert.deepStrictEqual(publicError(new Error("Cannot delete: 3 student(s) are enrolled")), { status: 400, message: "Cannot delete: 3 student(s) are enrolled" });
  });
});

describe("everything else stays private", () => {
  const SECRET = "ep-example-host-123.neon.tech";
  const cases: [string, unknown][] = [
    ["a Prisma validation error", new Error(`Invalid \`prisma.lateFeeRule.create()\` invocation in ${SECRET}`)],
    ["an unknown Prisma code", new PrismaClientKnownRequestError(`column missing ${SECRET}`, "P2010")],
    ["a code bug", new TypeError(`Cannot read properties of undefined ${SECRET}`)],
    ["a bad JSON parse", new SyntaxError(`Unexpected token ${SECRET}`)],
    ["a Node system error", Object.assign(new Error(`open ${SECRET}`), { code: "ERR_FS_FILE_TOO_LARGE" })],
    ["a Postgres error", Object.assign(new Error(`relation in ${SECRET}`), { code: "42P01" })],
    ["a Cloudinary rejection", { message: `Invalid api_key ${SECRET}`, http_code: 401 }],
    ["a Cloudinary Error", Object.assign(new Error(`Invalid api_key ${SECRET}`), { http_code: 401 })],
    ["a thrown string", `boom ${SECRET}`],
  ];
  for (const [name, err] of cases) {
    test(name, () => {
      const out = publicError(err, "Couldn't save");
      assert.strictEqual(out.status, 500);
      assert.strictEqual(out.message, "Couldn't save");
    });
  }

  test("nothing at all still gives a message", () => {
    assert.strictEqual(publicMessage(undefined), "Something went wrong. Please try again.");
  });
});

describe("common failures get a useful message", () => {
  test("Prisma's everyday errors", () => {
    assert.strictEqual(publicError(new PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", "P2002")).status, 409);
    assert.strictEqual(publicError(new PrismaClientKnownRequestError("Foreign key constraint violated", "P2003")).status, 409);
    assert.strictEqual(publicError(new PrismaClientKnownRequestError("Record not found", "P2025")).status, 404);
  });

  test("a database outage is a 503", () => {
    assert.strictEqual(publicError(new Error("Can't reach database server at x")).status, 503);
  });

  test("an oversized upload", () => {
    const err = Object.assign(new Error("File too large"), { name: "MulterError", code: "LIMIT_FILE_SIZE" });
    assert.strictEqual(publicError(err).status, 413);
  });
});

describe("over HTTP", () => {
  let server: Server;
  let base: string;
  before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  test("broken JSON doesn't echo the parser", async () => {
    const res = await fetch(`${base}/api/users/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    const body = (await res.json()) as { message: string };
    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.message, "The request couldn't be read. Please try again.");
  });

  test("an unknown API address answers in JSON", async () => {
    // Some routers on /api ask for a login first, so an anonymous caller learns nothing.
    const anonymous = await fetch(`${base}/api/no-such-thing`);
    assert.strictEqual(anonymous.status, 401);
    assert.strictEqual(((await anonymous.json()) as { success: boolean }).success, false);

    const token = jwt.sign({ id: 999999, email: "nobody@test.local", role: "SUPER_ADMIN" }, process.env.JWT_SECRET || "fallback_jwt_secret_key");
    const signedIn = await fetch(`${base}/api/no-such-thing`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(signedIn.status, 404);
    assert.strictEqual(((await signedIn.json()) as { success: boolean }).success, false);
  });
});
