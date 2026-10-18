import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";

// Marks permissions:
//  1. Only the subject's ALLOCATED teacher can enter its marks (timetable doesn't count).
//  2. The class teacher sees every subject of their class, but edits only their own.
//  3. A subject teacher sees only their own subject (no class ranks).
//  4. Changing a subject's teacher keeps all marks; the new teacher sees/edits them,
//     the old one loses access.
//  5. Locked exams reject edits; every change is in the audit history.

const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tokenFor = (id: number, role: string) => jwt.sign({ id, email: `${role}-${id}@test.local`, role }, secret());

let server: Server;
let base: string;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("exam lock / audit endpoint access (no database)", () => {
  test("lock is admin-only and validates its body", async () => {
    assert.strictEqual((await call("PATCH", "/api/exams/1/lock", undefined, { locked: true })).status, 401);
    assert.strictEqual((await call("PATCH", "/api/exams/1/lock", tokenFor(999999, "TEACHER"), { locked: true })).status, 403);
    assert.strictEqual((await call("PATCH", "/api/exams/1/lock", tokenFor(999999, "ADMIN"), {})).status, 400);
  });

  test("audit history is staff-only", async () => {
    assert.strictEqual((await call("GET", "/api/exams/1/audit")).status, 401);
    for (const role of ["STUDENT", "PARENT"]) {
      assert.strictEqual((await call("GET", "/api/exams/1/audit", tokenFor(999999, role))).status, 403, role);
    }
  });
});

describe("marks permissions against the database", async () => {
  let ready = false;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'Exam' AND column_name = 'isLocked'`
    )) as unknown[];
    ready = rows.length > 0;
  } catch {
    ready = false;
  }

  test("allocation, class-teacher view, teacher change, lock and audit", { skip: !ready && "exam lock SQL not applied yet" }, async () => {
    const stamp = Date.now();
    const created: { userIds: number[]; staffIds: number[] } = { userIds: [], staffIds: [] };
    let sessionId: number | undefined;
    let classSectionId: number | undefined;
    let studentId: number | undefined;
    let examId: number | undefined;
    const subjectIds: number[] = [];

    const makeTeacher = async (name: string) => {
      const user = await prisma.user.create({
        data: { email: `perm_${name}_${stamp}@school.com`, passwordHash: "x", role: "TEACHER", name: `${name} ${stamp}` },
      });
      const staff = await prisma.staff.create({ data: { userId: user.id } });
      created.userIds.push(user.id);
      created.staffIds.push(staff.id);
      return { userId: user.id, staffId: staff.id, token: tokenFor(user.id, "TEACHER") };
    };

    try {
      const admin = await prisma.user.create({
        data: { email: `perm_admin_${stamp}@school.com`, passwordHash: "x", role: "ADMIN", name: "Perm Admin" },
      });
      created.userIds.push(admin.id);
      const adminToken = tokenFor(admin.id, "ADMIN");

      const classTeacher = await makeTeacher("classteacher"); // teaches Maths, class teacher
      const englishTeacher = await makeTeacher("english");
      const newEnglishTeacher = await makeTeacher("newenglish");
      const timetableOnly = await makeTeacher("substitute");

      const session = await prisma.academicSession.create({
        data: { name: `Perm_${stamp}`, startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") },
      });
      sessionId = session.id;
      const cs = await prisma.classSection.create({
        data: { sessionId: session.id, className: "Perm Class", section: `P${stamp}`, classTeacherId: classTeacher.staffId },
      });
      classSectionId = cs.id;
      const maths = await prisma.subject.create({ data: { classSectionId: cs.id, name: "Maths" } });
      const english = await prisma.subject.create({ data: { classSectionId: cs.id, name: "English" } });
      subjectIds.push(maths.id, english.id);
      await prisma.teacherSubject.create({ data: { staffId: classTeacher.staffId, subjectId: maths.id } });
      await prisma.teacherSubject.create({ data: { staffId: englishTeacher.staffId, subjectId: english.id } });
      // Substitute has an English period on the timetable but no allocation.
      await prisma.timetableSlot.create({
        data: { classSectionId: cs.id, dayOfWeek: 1, periodNumber: 1, subjectId: english.id, staffId: timetableOnly.staffId },
      });
      const student = await prisma.student.create({
        data: { name: "Perm Student", rollNo: "1", admissionNo: `PERM-${stamp}`, classSectionId: cs.id },
      });
      studentId = student.id;
      const exam = await prisma.exam.create({ data: { sessionId: session.id, classSectionId: cs.id, name: "Perm Test" } });
      examId = exam.id;

      const enter = (token: string, subjectId: number, marks: number) =>
        call("POST", `/api/exams/${exam.id}/results`, token, {
          results: [{ studentId: student.id, subjectId, marksObtained: marks, maxMarks: 100 }],
        }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

      // 1 + 2: class teacher can enter Maths (allocated) but NOT English.
      assert.strictEqual((await enter(classTeacher.token, maths.id, 80)).json.data[0].success, true);
      assert.strictEqual((await enter(classTeacher.token, english.id, 50)).json.data[0].success, false);
      // Timetable-only substitute cannot enter English.
      assert.strictEqual((await enter(timetableOnly.token, english.id, 50)).json.data[0].success, false);
      // Allocated English teacher can.
      assert.strictEqual((await enter(englishTeacher.token, english.id, 70)).json.data[0].success, true);

      // 2: class teacher sees both subjects; 3: English teacher sees only English, no ranks.
      const ctResults = (await (await call("GET", `/api/exams/${exam.id}/results`, classTeacher.token)).json()) as any;
      assert.strictEqual(ctResults.data.length, 2);
      const enResults = (await (await call("GET", `/api/exams/${exam.id}/results`, englishTeacher.token)).json()) as any;
      assert.deepStrictEqual(enResults.data.map((r: any) => r.subjectId), [english.id]);
      const enAnalysis = (await (await call("GET", `/api/exams/${exam.id}/analysis`, englishTeacher.token)).json()) as any;
      assert.strictEqual(enAnalysis.data.scope, "SUBJECT");
      assert.deepStrictEqual(enAnalysis.data.subjects.map((s: any) => s.name), ["English"]);
      assert.strictEqual(enAnalysis.data.toppers.length, 0);
      const ctAnalysis = (await (await call("GET", `/api/exams/${exam.id}/analysis`, classTeacher.token)).json()) as any;
      assert.strictEqual(ctAnalysis.data.scope, "FULL");
      assert.strictEqual(ctAnalysis.data.students.find((s: any) => s.studentId === student.id).rank, 1);
      // Report card: class teacher yes, subject teacher no.
      assert.strictEqual((await call("GET", `/api/exams/${exam.id}/report-card/${student.id}`, classTeacher.token)).status, 200);
      assert.strictEqual((await call("GET", `/api/exams/${exam.id}/report-card/${student.id}`, englishTeacher.token)).status, 403);

      // 4: change the English teacher — marks stay, new teacher can see and edit, old can't.
      await prisma.teacherSubject.deleteMany({ where: { subjectId: english.id } });
      await prisma.teacherSubject.create({ data: { staffId: newEnglishTeacher.staffId, subjectId: english.id } });
      const newView = (await (await call("GET", `/api/exams/${exam.id}/results`, newEnglishTeacher.token)).json()) as any;
      assert.strictEqual(newView.data.find((r: any) => r.subjectId === english.id).marksObtained, 70, "old marks preserved");
      assert.strictEqual((await enter(newEnglishTeacher.token, english.id, 72)).json.data[0].success, true);
      // The old teacher no longer has any link to this class, so the whole request is refused
      // (403) — or, if they still taught another subject here, the row would fail instead.
      const oldTeacher = await enter(englishTeacher.token, english.id, 10);
      assert.ok(
        oldTeacher.status === 403 || oldTeacher.json.data?.[0]?.success === false,
        `old teacher must be refused (got ${oldTeacher.status})`
      );
      const stillSeventyTwo = (await (await call("GET", `/api/exams/${exam.id}/results`, newEnglishTeacher.token)).json()) as any;
      assert.strictEqual(stillSeventyTwo.data.find((r: any) => r.subjectId === english.id).marksObtained, 72, "old teacher's attempt changed nothing");

      // 5: lock blocks edits; unlock allows again.
      assert.strictEqual((await call("PATCH", `/api/exams/${exam.id}/lock`, adminToken, { locked: true })).status, 200);
      assert.strictEqual((await enter(newEnglishTeacher.token, english.id, 75)).status, 409);
      assert.strictEqual((await call("PATCH", `/api/exams/${exam.id}/lock`, adminToken, { locked: false })).status, 200);

      // Re-saving an unchanged value doesn't add history.
      await enter(classTeacher.token, maths.id, 80);

      const audit = (await (await call("GET", `/api/exams/${exam.id}/audit`, adminToken)).json()) as any;
      const english70to72 = audit.data.find((a: any) => a.subjectId === english.id && a.action === "UPDATE");
      assert.ok(english70to72, "edit recorded");
      assert.strictEqual(english70to72.oldMarks, 70);
      assert.strictEqual(english70to72.newMarks, 72);
      assert.strictEqual(audit.data.length, 3, "Maths create, English create, English update — no duplicate for the unchanged re-save");
    } finally {
      if (examId) {
        await prisma.examResultAudit.deleteMany({ where: { examId } });
        await prisma.examResult.deleteMany({ where: { examId } });
        await prisma.exam.delete({ where: { id: examId } });
      }
      if (studentId) await prisma.student.delete({ where: { id: studentId } });
      if (classSectionId) {
        await prisma.timetableSlot.deleteMany({ where: { classSectionId } });
        await prisma.teacherSubject.deleteMany({ where: { subjectId: { in: subjectIds } } });
        await prisma.subject.deleteMany({ where: { classSectionId } });
        await prisma.classSection.delete({ where: { id: classSectionId } });
      }
      if (sessionId) await prisma.academicSession.delete({ where: { id: sessionId } });
      await prisma.staff.deleteMany({ where: { id: { in: created.staffIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    }
  });
});
