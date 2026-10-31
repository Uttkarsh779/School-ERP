import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { billStudentMonth, computeMonthBill, loadBillingContext } from "../modules/fees/billingService";
import { endStudentTransport } from "../modules/transport/endTransportService";

// Ending a student's transport: later months are no longer billed, and an already-issued
// unpaid transport bill after the end is waived. Uses a temporary student in an existing
// class of the current session; everything it creates is removed afterwards.
const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tag = Date.now().toString(36);
let server: Server;
let base: string;
const ctx = { adminUserId: 0, userId: 0, studentId: 0, villageId: 0, sessionId: 0, headId: 0 };

const transportLine = async (month: number, year: number) => {
  const bill = computeMonthBill(await loadBillingContext(prisma, ctx.studentId, ctx.sessionId), month, year);
  return bill.lines.find((l) => l.feeHeadId === ctx.headId)?.netAmount ?? 0;
};
const transportCharge = (month: number, year: number) =>
  prisma.feeCharge.findFirst({ where: { studentId: ctx.studentId, feeHeadId: ctx.headId, billingMonth: month, billingYear: year } });

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", isActive: true } });
  const session = await prisma.academicSession.findFirstOrThrow({ where: { isCurrent: true } });
  const cls = await prisma.classSection.findFirstOrThrow({ where: { sessionId: session.id } });
  const head =
    (await prisma.feeHead.findUnique({ where: { name: "Transport Fee" } })) ??
    (await prisma.feeHead.create({ data: { name: "Transport Fee", code: "TRANSPORT", isRecurring: true, allowPartialPayment: true } }));
  const user = await prisma.user.create({ data: { email: `zz_endtr_${tag}@test.local`, passwordHash: "x", role: "STUDENT", name: "ZZ End Transport" } });
  const student = await prisma.student.create({
    data: { userId: user.id, admissionNo: `ZZTR${tag}`, name: "ZZ End Transport", rollNo: `ZZ${tag}`, classSectionId: cls.id, admissionDate: session.startDate },
  });
  const village = await prisma.transportVillage.create({ data: { name: `ZZ Village ${tag}`, monthlyFee: 900 } });
  await prisma.studentTransportAssignment.create({
    data: { studentId: student.id, villageId: village.id, monthlyFee: 900, startDate: session.startDate, status: "ACTIVE", policy: "FULL_MONTH" },
  });
  Object.assign(ctx, { adminUserId: admin.id, userId: user.id, studentId: student.id, villageId: village.id, sessionId: session.id, headId: head.id });
});

after(async () => {
  if (ctx.studentId) {
    const charges = await prisma.feeCharge.findMany({ where: { studentId: ctx.studentId }, select: { id: true } });
    const ids = charges.map((c) => c.id);
    await prisma.feeAdjustment.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.invoiceItem.deleteMany({ where: { feeChargeId: { in: ids } } });
    await prisma.invoice.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.feeCharge.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.studentTransportAssignment.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: ctx.studentId } });
    await prisma.student.delete({ where: { id: ctx.studentId } });
  }
  if (ctx.userId) await prisma.user.delete({ where: { id: ctx.userId } });
  if (ctx.villageId) {
    await prisma.villageFeeHistory.deleteMany({ where: { villageId: ctx.villageId } });
    await prisma.transportVillage.delete({ where: { id: ctx.villageId } });
  }
  await new Promise<void>((r) => server.close(() => r()));
});

describe("end student transport", () => {
  // Two months inside the current session, a month apart, plus the month after.
  const pick = async () => {
    const s = await prisma.academicSession.findUniqueOrThrow({ where: { id: ctx.sessionId } });
    const d = new Date(s.startDate.getFullYear(), s.startDate.getMonth() + 3, 1);
    const m1 = { month: d.getMonth() + 1, year: d.getFullYear() };
    const d2 = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const m2 = { month: d2.getMonth() + 1, year: d2.getFullYear() };
    const d3 = new Date(d.getFullYear(), d.getMonth() + 2, 1);
    const m3 = { month: d3.getMonth() + 1, year: d3.getFullYear() };
    return { m1, m2, m3, lastDay: new Date(d.getFullYear(), d.getMonth(), 15) };
  };

  test("transport is billed while active", async () => {
    const { m1, m2 } = await pick();
    assert.strictEqual(await transportLine(m1.month, m1.year), 900);
    await billStudentMonth(ctx.studentId, ctx.sessionId, m1.month, m1.year, ctx.adminUserId);
    await billStudentMonth(ctx.studentId, ctx.sessionId, m2.month, m2.year, ctx.adminUserId);
    assert.strictEqual(Number((await transportCharge(m2.month, m2.year))?.netAmount), 900);
  });

  test("ending mid-month (full month): end month kept, next month's issued bill waived, later months not billed", async () => {
    const { m1, m2, m3, lastDay } = await pick();
    const r = await endStudentTransport({ studentId: ctx.studentId, lastDay, policy: "FULL_MONTH", appliedByUserId: ctx.adminUserId });
    assert.strictEqual(r.endedAssignments, 1);
    assert.strictEqual(r.waivedTotal, 900);
    assert.strictEqual(r.alreadyPaid, 0);

    assert.strictEqual(Number((await transportCharge(m1.month, m1.year))?.netAmount), 900, "end month is charged in full");
    const next = await transportCharge(m2.month, m2.year);
    assert.strictEqual(Number(next?.netAmount), 0, "issued bill after the end is waived");
    const adj = await prisma.feeAdjustment.findFirst({ where: { feeChargeId: next!.id, type: "FEE_WAIVER" } });
    assert.ok(adj && /Transport ended/.test(adj.reason));
    assert.strictEqual(await transportLine(m3.month, m3.year), 0, "no transport in later months");

    const a = await prisma.studentTransportAssignment.findFirstOrThrow({ where: { studentId: ctx.studentId } });
    assert.strictEqual(a.status, "DISCONTINUED");
  });

  test("ending again is refused (not using transport)", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ctx.adminUserId } });
    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, secret());
    const r = await fetch(`${base}/api/transport/students/${ctx.studentId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lastDay: new Date().toISOString().slice(0, 10) }),
    });
    assert.strictEqual(r.status, 400);
  });
});
