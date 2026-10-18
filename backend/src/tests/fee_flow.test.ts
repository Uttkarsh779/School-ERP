import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { getStudentDueSummary } from "../modules/fees/feeChargeService";
import { getDefaultersReport, getStudentLedger } from "../modules/fees/ledgerService";

// End-to-end fee flow against the real database, with full cleanup:
// overdue charge -> late fee from the configured rule -> manual payment persists it ->
// receipt number from payment id -> ledger has no NaN -> defaulter total correct ->
// refund guards (own records only, Super Admin approval, status order).

const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tokenFor = (id: number, role: string) => jwt.sign({ id, email: `${role}-${id}@t.local`, role }, secret());

let server: Server;
let base: string;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((r) => server.close(() => r())));

const call = (method: string, path: string, token: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

describe("fee flow against the database", () => {
  test("late fee, payment, receipt, ledger, defaulters and refunds", async () => {
    const stamp = Date.now();
    const ids: Record<string, number | undefined> = {};
    const userIds: number[] = [];
    try {
      const admin = await prisma.user.create({ data: { email: `fee_admin_${stamp}@t.com`, passwordHash: "x", role: "ADMIN", name: "Fee Admin" } });
      const superAdmin = await prisma.user.create({ data: { email: `fee_sa_${stamp}@t.com`, passwordHash: "x", role: "SUPER_ADMIN", name: "Fee SA" } });
      const stuUser = await prisma.user.create({ data: { email: `fee_stu_${stamp}@t.com`, passwordHash: "x", role: "STUDENT", name: "Fee Student" } });
      userIds.push(admin.id, superAdmin.id, stuUser.id);

      const session = await prisma.academicSession.create({ data: { name: `FeeFlow_${stamp}`, startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
      ids.session = session.id;
      const cs = await prisma.classSection.create({ data: { sessionId: session.id, className: "FeeFlow", section: `F${stamp}` } });
      ids.cs = cs.id;
      const head = await prisma.feeHead.create({ data: { name: `FlowTuition_${stamp}`, code: `FT${stamp}` } });
      ids.head = head.id;
      const student = await prisma.student.create({ data: { name: "Flow Student", rollNo: "1", admissionNo: `FLOW-${stamp}`, classSectionId: cs.id, userId: stuUser.id } });
      ids.student = student.id;

      // Rule: 5 grace days, then ₹20/day.
      await prisma.lateFeeRule.create({ data: { sessionId: session.id, gracePeriodDays: 5, feeType: "DAILY", amount: 20 } });
      const dueDate = new Date(Date.now() - 15 * 86_400_000); // 15 days overdue -> 10 chargeable days -> ₹200
      const charge = await prisma.feeCharge.create({
        data: {
          studentId: student.id, feeHeadId: head.id, sessionId: session.id, billingMonth: 4, billingYear: 2026,
          dueDate, baseAmount: 1000, discountAmount: 100, lateFeeAmount: 0, netAmount: 900, paidAmount: 0,
        },
      });
      ids.charge = charge.id;

      // Due summary applies the configured rule.
      const due = await getStudentDueSummary(student.id);
      const dueCharge = (due.charges as any[]).find((c) => c.id === charge.id);
      assert.strictEqual(dueCharge.calculatedLateFee, 200);
      assert.strictEqual(dueCharge.outstandingAmount, 1100); // 1000 - 100 + 200
      assert.strictEqual(due.totalOutstanding, 1100);

      // Defaulters: correct numeric total (previously string-concatenated).
      const defaulters = await getDefaultersReport(cs.id);
      assert.strictEqual(defaulters[0].totalDue, 1100);
      assert.ok(defaulters[0].daysOverdue >= 15);

      // Manual payment by an Admin: late fee persisted, receipt from payment id.
      const pay = await call("POST", "/api/payments/manual", tokenFor(admin.id, "ADMIN"), { studentId: student.id, amount: 600, mode: "CASH" });
      assert.strictEqual(pay.status, 201, JSON.stringify(pay.json));
      ids.payment = pay.json.data.id;
      assert.strictEqual(pay.json.data.receiptNumber, `REC-${new Date().getFullYear()}-${String(pay.json.data.id).padStart(6, "0")}`);
      const after1 = await prisma.feeCharge.findUniqueOrThrow({ where: { id: charge.id } });
      assert.strictEqual(Number(after1.lateFeeAmount), 200, "late fee saved onto the charge");
      assert.strictEqual(Number(after1.netAmount), 1100);
      assert.strictEqual(Number(after1.paidAmount), 600);
      assert.strictEqual(after1.status, "PARTIALLY_PAID");

      // Ledger: numbers only, balance correct.
      const ledger = await getStudentLedger(student.id);
      assert.ok(ledger.entries.every((e: any) => Number.isFinite(e.balance)), "no NaN in ledger");
      assert.strictEqual(ledger.finalBalance, 500); // 1200 charged - 100 discount - 600 paid

      // Refunds: student can request on own payment, within the paid amount.
      const stuToken = tokenFor(stuUser.id, "STUDENT");
      const tooMuch = await call("POST", "/api/refunds", stuToken, { studentId: student.id, paymentId: ids.payment, amount: 700, reason: "Paid twice" });
      assert.strictEqual(tooMuch.status, 400);
      const req = await call("POST", "/api/refunds", stuToken, { studentId: student.id, paymentId: ids.payment, amount: 100, reason: "Paid twice" });
      assert.strictEqual(req.status, 201, JSON.stringify(req.json));
      ids.refund = req.json.data.id;
      assert.strictEqual(req.json.data.requestedByUser.passwordHash, undefined, "no password hash in response");

      // Student sees only their own refunds; admin can't approve; super admin approves then pays out.
      const myRefunds = await call("GET", "/api/refunds", stuToken);
      assert.ok(myRefunds.json.data.every((r: any) => r.studentId === student.id));
      assert.strictEqual((await call("PATCH", `/api/refunds/${ids.refund}/approve`, tokenFor(admin.id, "ADMIN"), { approved: true })).status, 403);
      const sa = tokenFor(superAdmin.id, "SUPER_ADMIN");
      assert.strictEqual((await call("PATCH", `/api/refunds/${ids.refund}/process`, sa)).status, 409, "can't pay out before approval");
      assert.strictEqual((await call("PATCH", `/api/refunds/${ids.refund}/approve`, sa, { approved: true })).status, 200);
      assert.strictEqual((await call("PATCH", `/api/refunds/${ids.refund}/approve`, sa, { approved: true })).status, 409, "can't decide twice");
      assert.strictEqual((await call("PATCH", `/api/refunds/${ids.refund}/process`, sa)).status, 200);

      // Receipt endpoint returns real numbers and the settled item.
      const receipt = await call("GET", `/api/payments/${ids.payment}/receipt`, stuToken);
      assert.strictEqual(receipt.status, 200);
      assert.strictEqual(receipt.json.data.amountPaid, 600);
      assert.strictEqual(receipt.json.data.settledItems[0].amountAllocated, 600);
    } finally {
      if (ids.student) {
        await prisma.refund.deleteMany({ where: { studentId: ids.student } });
        await prisma.paymentAllocation.deleteMany({ where: { payment: { studentId: ids.student } } });
        await prisma.advancePayment.deleteMany({ where: { studentId: ids.student } });
        await prisma.payment.deleteMany({ where: { studentId: ids.student } });
        await prisma.feeAdjustment.deleteMany({ where: { studentId: ids.student } });
        await prisma.invoiceItem.deleteMany({ where: { invoice: { studentId: ids.student } } });
        await prisma.invoice.deleteMany({ where: { studentId: ids.student } });
        await prisma.feeCharge.deleteMany({ where: { studentId: ids.student } });
        await prisma.student.delete({ where: { id: ids.student } });
      }
      if (ids.head) await prisma.feeHead.delete({ where: { id: ids.head } });
      if (ids.cs) await prisma.classSection.delete({ where: { id: ids.cs } });
      if (ids.session) {
        await prisma.lateFeeRule.deleteMany({ where: { sessionId: ids.session } });
        await prisma.academicSession.delete({ where: { id: ids.session } });
      }
      await prisma.feeAuditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });
});
