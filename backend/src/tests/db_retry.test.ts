import assert from "node:assert";
import { describe, test } from "node:test";
import { connectWithRetry, isDatabaseDown } from "../config/dbRetry";

// Retrying a dropped connection, and telling "database down" from a real error. No database.
const noWait = async () => undefined;
const failing = (times: number, error: unknown) => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls <= times) throw error;
    return "client";
  };
  return { fn, calls: () => calls };
};

describe("opening a connection", () => {
  test("a brief failure is retried and succeeds", async () => {
    const c = failing(2, Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
    assert.strictEqual(await connectWithRetry(c.fn, [1, 1], noWait), "client");
    assert.strictEqual(c.calls(), 3);
  });

  test("it gives up after the last retry", async () => {
    const c = failing(9, new Error("Connection terminated due to connection timeout"));
    await assert.rejects(connectWithRetry(c.fn, [1, 1], noWait), /connection timeout/);
    assert.strictEqual(c.calls(), 3);
  });

  test("a wrong password isn't retried, but a database starting up is", async () => {
    const wrong = failing(9, Object.assign(new Error("password authentication failed"), { code: "28P01" }));
    await assert.rejects(connectWithRetry(wrong.fn, [1, 1], noWait));
    assert.strictEqual(wrong.calls(), 1);
    const starting = failing(1, Object.assign(new Error("the database system is starting up"), { code: "57P03" }));
    assert.strictEqual(await connectWithRetry(starting.fn, [1, 1], noWait), "client");
  });
});

describe("recognising a database outage", () => {
  test("connection failures are recognised", () => {
    assert.ok(isDatabaseDown(new Error("Invalid `prisma.lateFeeRule.create()` invocation\nCan't reach database server at example.neon.tech")));
    assert.ok(isDatabaseDown(new Error("Connection terminated unexpectedly")));
    assert.ok(isDatabaseDown({ code: "P1001", message: "x" }));
  });

  test("ordinary errors aren't", () => {
    assert.strictEqual(isDatabaseDown(new Error("Fee due day must be a day between 1 and 28")), false);
    assert.strictEqual(isDatabaseDown({ code: "P2002", message: "Unique constraint failed" }), false);
    assert.strictEqual(isDatabaseDown(undefined), false);
  });
});
