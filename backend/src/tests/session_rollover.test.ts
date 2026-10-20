import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { classRank, copySessionSetup, getPromotionPlan, promoteStudents } from "../modules/sessions/rolloverService";
import { classSectionForSession } from "../modules/sessions/enrollmentService";
import { getOtherSessionDues } from "../modules/fees/multiMonthPaymentService";

// Year-end rollover on throwaway sessions (2091-92 -> 2092-93), cleaned up afterwards.
const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tokenFor = (id: number, role: string) => jwt.sign({ id, email: `${role}-${id}@t.local`, role }, secret());
const tag = `RT${Date.now().toString(36)}`;

let server: Server;
let base: string;
const ids = { from: 0, to: 0, feeHead: 0, staff: 0 };
const cls: Record<string, number> = {};
const stu: Record<string, number> = {};

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const from = await prisma.academicSession.create({ data: { name: `${tag}-2091`, startDate: new Date(2091, 3, 1), endDate: new Date(2092, 2, 31) } });
  const to = await prisma.academicSession.create({ data: { name: `${tag}-2092`, startDate: new Date(2092, 3, 1), endDate: new Date(2093, 2, 31) } });
  ids.from = from.id;
  ids.to = to.id;
  const staff = await prisma.staff.findFirst({ where: { isActive: true } });
  ids.staff = staff?.id ?? 0;
  const head = await prisma.feeHead.create({ data: { name: `${tag} Tuition`, code: `${tag}T` } });
  ids.feeHead = head.id;

  for (const [key, className] of [["c5", "Class 5"], ["c6", "Class 6"], ["c12", "Class 12"]] as const) {
    const c = await prisma.classSection.create({ data: { sessionId: from.id, className, section: "A", classTeacherId: ids.staff || null } });
    cls[key] = c.id;
  }
  const maths = await prisma.subject.create({ data: { classSectionId: cls.c5, name: "Maths" } });
  if (ids.staff) await prisma.teacherSubject.create({ data: { staffId: ids.staff, subjectId: maths.id } });
  await prisma.timetableSlot.create({ data: { classSectionId: cls.c5, dayOfWeek: 1, periodNumber: 1, subjectId: maths.id, staffId: ids.staff || null, room: "R1" } });
  await prisma.feeStructure.create({
    data: { sessionId: from.id, classSectionId: cls.c5, name: "Class 5", items: { create: [{ feeHeadId: head.id, amount: 1000, applicableMonths: [] }] } },
  });
  await prisma.lateFeeRule.create({ data: { sessionId: from.id, gracePeriodDays: 7, feeType: "FIXED", amount: 50 } });

  const mk = async (key: string, name: string, classId: number, rollNo: string) => {
    const s = await prisma.student.create({ data: { name, admissionNo: `${tag}-${key}`, rollNo, classSectionId: classId } });
    stu[key] = s.id;
  };
  await mk("zara", "Zara", cls.c5, "1");
  await mk("aman", "Aman", cls.c5, "2");
  await mk("ravi", "Ravi", cls.c5, "3");
  await mk("meera", "Meera", cls.c6, "1");
  await mk("kabir", "Kabir", cls.c12, "1");
  await prisma.feeCharge.create({
    data: { studentId: stu.aman, feeHeadId: head.id, sessionId: from.id, billingMonth: 3, billingYear: 2092, dueDate: new Date(2092, 2, 10), baseAmount: 1000, netAmount: 1000 },
  });
});

after(async () => {
  const sessionIds = [ids.from, ids.to].filter(Boolean);
  const classIds = (await prisma.classSection.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })).map((c) => c.id);
  const studentIds = Object.values(stu);
  await prisma.studentEnrollment.deleteMany({ where: { OR: [{ sessionId: { in: sessionIds } }, { studentId: { in: studentIds } }] } });
  await prisma.feeCharge.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.timetableSlot.deleteMany({ where: { classSectionId: { in: classIds } } });
  await prisma.teacherSubject.deleteMany({ where: { subject: { classSectionId: { in: classIds } } } });
  await prisma.subject.deleteMany({ where: { classSectionId: { in: classIds } } });
  await prisma.feeStructure.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.lateFeeRule.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.classSection.deleteMany({ where: { id: { in: classIds } } });
  await prisma.academicSession.deleteMany({ where: { id: { in: sessionIds } } });
  if (ids.feeHead) await prisma.feeHead.delete({ where: { id: ids.feeHead } });
  await new Promise<void>((r) => server.close(() => r()));
});

describe("class order", () => {
  test("ranks pre-primary and numbered classes", () => {
    const names = ["Class 10", "UKG", "Class 2", "Nursery", "LKG", "Class V", "Grade 1"];
    const sorted = [...names].sort((a, b) => (classRank(a) ?? 999) - (classRank(b) ?? 999));
    assert.deepStrictEqual(sorted, ["Nursery", "LKG", "UKG", "Grade 1", "Class 2", "Class V", "Class 10"]);
    assert.strictEqual(classRank("Robotics club"), null);
  });
});

describe("access", () => {
  test("only super admin can run the rollover", async () => {
    const q = `/api/sessions/rollover/plan?from=${ids.from}&to=${ids.to}`;
    assert.strictEqual((await call("GET", q, tokenFor(999999, "ADMIN"))).status, 403);
    assert.strictEqual((await call("POST", "/api/sessions/rollover/promote", tokenFor(999999, "TEACHER"), {})).status, 403);
    assert.strictEqual((await call("GET", q)).status, 401);
  });
});

describe("rollover", () => {
  test("copies classes, subjects, allocations, timetable, fees (+10%) and late-fee rule", async () => {
    const r = await copySessionSetup({ fromSessionId: ids.from, toSessionId: ids.to, feeIncreasePercent: 10, roundFeesTo: 10 });
    assert.strictEqual(r.classesCreated, 3);
    assert.strictEqual(r.subjects, 1);
    assert.strictEqual(r.timetableSlots, 1);
    assert.strictEqual(r.feeStructures, 1);
    assert.strictEqual(r.lateFeeRule, true);
    const toClasses = await prisma.classSection.findMany({ where: { sessionId: ids.to } });
    for (const c of toClasses) cls[`to_${c.className}`] = c.id;
    const slot = await prisma.timetableSlot.findFirst({ where: { classSectionId: cls["to_Class 5"] }, include: { subject: true } });
    assert.strictEqual(slot?.subject?.name, "Maths");
    assert.strictEqual(slot?.room, "R1");
    const st = await prisma.feeStructure.findFirst({ where: { sessionId: ids.to }, include: { items: true } });
    assert.strictEqual(st?.classSectionId, cls["to_Class 5"]);
    assert.strictEqual(Number(st?.items[0].amount), 1100);
    if (ids.staff) assert.strictEqual(toClasses[0].classTeacherId, ids.staff);

    // Re-running copies nothing twice.
    const again = await copySessionSetup({ fromSessionId: ids.from, toSessionId: ids.to });
    assert.strictEqual(again.classesCreated, 0);
    assert.strictEqual(again.subjects, 0);
    assert.strictEqual(again.feeStructures, 0);
    assert.strictEqual(again.timetableSkipped, 1);
  });

  test("plan suggests next class and passed-out for the final class", async () => {
    const plan = await getPromotionPlan(ids.from, ids.to);
    const c5 = plan.classes.find((c) => c.id === cls.c5)!;
    const c12 = plan.classes.find((c) => c.id === cls.c12)!;
    assert.strictEqual(c5.suggestedPromoteToId, cls["to_Class 6"]);
    assert.strictEqual(c5.suggestedDetainToId, cls["to_Class 5"]);
    assert.deepStrictEqual(c5.students.map((s) => s.name), ["Aman", "Ravi", "Zara"]);
    assert.strictEqual(c12.isFinalClass, true);
    assert.strictEqual(c12.defaultAction, "PASSED_OUT");
  });

  test("promotes, detains and graduates; history and rolls are kept", async () => {
    const res = await promoteStudents({
      fromSessionId: ids.from,
      toSessionId: ids.to,
      rollNumbering: "ALPHABETICAL",
      decisions: [
        { studentId: stu.zara, action: "PROMOTE", toClassSectionId: cls["to_Class 6"] },
        { studentId: stu.aman, action: "PROMOTE", toClassSectionId: cls["to_Class 6"] },
        { studentId: stu.ravi, action: "DETAIN", toClassSectionId: cls["to_Class 5"] },
        { studentId: stu.meera, action: "LEFT", remarks: "Moved city" },
        { studentId: stu.kabir, action: "PASSED_OUT" },
      ],
    });
    assert.deepStrictEqual(res, { promoted: 2, detained: 1, passedOut: 1, left: 1, skipped: 0 });

    const [zara, aman, ravi, meera, kabir] = await Promise.all(
      [stu.zara, stu.aman, stu.ravi, stu.meera, stu.kabir].map((id) => prisma.student.findUniqueOrThrow({ where: { id } }))
    );
    assert.strictEqual(aman.classSectionId, cls["to_Class 6"]);
    assert.strictEqual(aman.rollNo, "1"); // alphabetical: Aman, Zara
    assert.strictEqual(zara.rollNo, "2");
    assert.strictEqual(ravi.classSectionId, cls["to_Class 5"]);
    assert.strictEqual(meera.isActive, false);
    assert.strictEqual(meera.classSectionId, cls.c6);
    assert.strictEqual(kabir.isActive, false);

    const hist = await prisma.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId: stu.aman, sessionId: ids.from } } });
    assert.strictEqual(hist?.classSectionId, cls.c5);
    assert.strictEqual(hist?.outcome, "PROMOTED");
    const leftRow = await prisma.studentEnrollment.findUnique({ where: { studentId_sessionId: { studentId: stu.meera, sessionId: ids.from } } });
    assert.strictEqual(leftRow?.remarks, "Moved city");

    // Old-session lookups still resolve to last year's class.
    const withClass = await prisma.student.findUniqueOrThrow({ where: { id: stu.aman }, include: { classSection: true } });
    assert.strictEqual((await classSectionForSession(prisma, withClass, ids.from))?.id, cls.c5);

    // Running it again skips students already moved.
    const rerun = await promoteStudents({ fromSessionId: ids.from, toSessionId: ids.to, decisions: [{ studentId: stu.aman, action: "PROMOTE", toClassSectionId: cls["to_Class 6"] }] });
    assert.strictEqual(rerun.skipped, 1);
  });

  test("unpaid fees of last session show as previous dues", async () => {
    const to = await prisma.academicSession.findUniqueOrThrow({ where: { id: ids.to } });
    const dues = await getOtherSessionDues(stu.aman, to);
    assert.strictEqual(dues.length, 1);
    assert.strictEqual(dues[0].sessionId, ids.from);
    assert.strictEqual(dues[0].isPrevious, true);
    assert.ok(dues[0].outstanding >= 1000);
    assert.deepStrictEqual(dues[0].months, ["Mar 2092"]);
  });

  test("rejects a promote without a target class in the new session", async () => {
    await assert.rejects(
      promoteStudents({ fromSessionId: ids.from, toSessionId: ids.to, decisions: [{ studentId: stu.ravi, action: "PROMOTE", toClassSectionId: cls.c6 }] }),
      (e: any) => e.statusCode === 400
    );
  });
});
