import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { parseProfileUpdate, validateNewPassword } from "../modules/profile/service";
import { parseLeaveInput } from "../modules/leaves/service";
import { parseAssignmentInput } from "../modules/assignments/service";
import { parseRemarkRows } from "../modules/exams/remarksService";
import { hashPassword } from "../utils/password";

const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tokenFor = (id: number, role: string) => jwt.sign({ id, email: `${role}-${id}@t.local`, role }, secret());
const status400 = (fn: () => unknown) => {
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

describe("security fixes", () => {
  test("register is no longer public and not open to admins", async () => {
    const body = { email: `x${Date.now()}@t.com`, password: "Passw0rd!", role: "SUPER_ADMIN", name: "Intruder" };
    assert.strictEqual((await call("POST", "/api/users/register", undefined, body)).status, 401);
    assert.strictEqual((await call("POST", "/api/users/register", tokenFor(999999, "ADMIN"), body)).status, 403);
  });

  test("database reset is not public", async () => {
    assert.strictEqual((await call("POST", "/api/seed-reset")).status, 401);
    assert.strictEqual((await call("POST", "/api/seed-reset", tokenFor(999999, "ADMIN"))).status, 403);
  });
});

describe("validators", () => {
  test("profile fields", () => {
    assert.deepStrictEqual(parseProfileUpdate({ name: "  Asha Rao ", contact: "98765 43210" }), { name: "Asha Rao", contact: "98765 43210" });
    assert.strictEqual(status400(() => parseProfileUpdate({ name: "A" })), 400);
    assert.strictEqual(status400(() => parseProfileUpdate({ contact: "call me" })), 400);
    assert.strictEqual(status400(() => parseProfileUpdate({ photoUrl: "https://evil.example/x.png" })), 400);
    assert.ok(parseProfileUpdate({ photoUrl: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg" }).photoUrl);
  });

  test("password rules", () => {
    assert.strictEqual(status400(() => validateNewPassword("short1")), 400);
    assert.strictEqual(status400(() => validateNewPassword("allletters")), 400);
    assert.strictEqual(status400(() => validateNewPassword("12345678")), 400);
    assert.strictEqual(status400(() => validateNewPassword("Passw0rd")), undefined);
  });

  test("leave dates and reason", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const ok = parseLeaveInput({ fromDate: "2026-10-20", toDate: "2026-10-22", reason: "Family function" }, now);
    assert.strictEqual(ok.days, 3);
    assert.strictEqual(status400(() => parseLeaveInput({ fromDate: "2026-10-22", toDate: "2026-10-20", reason: "Family function" }, now)), 400);
    assert.strictEqual(status400(() => parseLeaveInput({ fromDate: "2026-10-20", toDate: "2026-12-30", reason: "Long trip away" }, now)), 400);
    assert.strictEqual(status400(() => parseLeaveInput({ fromDate: "2026-09-01", toDate: "2026-09-02", reason: "Too far back" }, now)), 400);
    assert.strictEqual(status400(() => parseLeaveInput({ fromDate: "2026-10-20", toDate: "2026-10-20", reason: "ill" }, now)), 400);
  });

  test("homework input", () => {
    assert.strictEqual(status400(() => parseAssignmentInput({ title: "Hi", description: "x", classSectionId: 1, subjectId: 1, dueDate: "2026-10-20" })), 400);
    assert.strictEqual(
      status400(() => parseAssignmentInput({ title: "Chapter 3", description: "Q1-5", classSectionId: 1, subjectId: 1, dueDate: "2026-10-20", endDate: "2026-10-19" })),
      400
    );
    assert.strictEqual(
      status400(() => parseAssignmentInput({ title: "Chapter 3", description: "Q1-5", classSectionId: 1, subjectId: 1, dueDate: "2026-10-20", attachmentUrl: "http://x.com/f.pdf" })),
      400
    );
  });

  test("co-scholastic grades", () => {
    assert.deepStrictEqual(parseRemarkRows([{ studentId: 1, remark: " Good ", discipline: "a" }])[0], {
      studentId: 1, remark: "Good", workEducation: null, artEducation: null, healthPhysical: null, discipline: "A",
    });
    assert.strictEqual(status400(() => parseRemarkRows([{ studentId: 1, discipline: "D" }])), 400);
  });
});

describe("access control", () => {
  test("profile endpoints need a login", async () => {
    assert.strictEqual((await call("GET", "/api/profile/me")).status, 401);
    assert.strictEqual((await call("POST", "/api/profile/change-password")).status, 401);
  });
  test("My Students is teacher-only", async () => {
    assert.strictEqual((await call("GET", "/api/teaching/students?classSectionId=1", tokenFor(999999, "ADMIN"))).status, 403);
    assert.strictEqual((await call("GET", "/api/teaching/students?classSectionId=1", tokenFor(999999, "TEACHER"))).status, 403);
  });
  test("leave lists and decisions are role-gated", async () => {
    assert.strictEqual((await call("GET", "/api/leaves", tokenFor(999999, "TEACHER"))).status, 403);
    assert.strictEqual((await call("PATCH", "/api/leaves/1/decision", tokenFor(999999, "STUDENT"), { approved: true })).status, 403);
  });
  test("only admins publish results; parents can't list homework any more", async () => {
    assert.strictEqual((await call("PATCH", "/api/exams/1/publish", tokenFor(999999, "TEACHER"), { published: true })).status, 403);
    assert.strictEqual((await call("GET", "/api/assignments", tokenFor(999999, "PARENT"))).status, 403);
  });
});

describe("teacher features against the database", async () => {
  let ready = false;
  try {
    const rows = (await prisma.$queryRawUnsafe(`SELECT to_regclass('"LeaveRequest"')::text AS t`)) as Array<{ t: string | null }>;
    ready = !!rows[0]?.t;
  } catch {
    ready = false;
  }

  test("profile, homework, remarks/publish and leave workflows", { skip: !ready && "teacher_features.sql not applied yet" }, async () => {
    const stamp = Date.now();
    const userIds: number[] = [];
    const ids: Record<string, number | undefined> = {};
    try {
      const pw = await hashPassword("Start123");
      const tUser = await prisma.user.create({ data: { email: `tf_t_${stamp}@t.com`, passwordHash: pw, role: "TEACHER", name: "TF Teacher" } });
      const sUser = await prisma.user.create({ data: { email: `tf_s_${stamp}@t.com`, passwordHash: pw, role: "STUDENT", name: "TF Student" } });
      const aUser = await prisma.user.create({ data: { email: `tf_a_${stamp}@t.com`, passwordHash: pw, role: "ADMIN", name: "TF Admin" } });
      userIds.push(tUser.id, sUser.id, aUser.id);
      const staff = await prisma.staff.create({ data: { userId: tUser.id } });
      ids.staff = staff.id;
      const session = await prisma.academicSession.create({ data: { name: `TF_${stamp}`, startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") } });
      ids.session = session.id;
      const cs = await prisma.classSection.create({ data: { sessionId: session.id, className: "TF", section: `T${stamp}`, classTeacherId: staff.id } });
      ids.cs = cs.id;
      const subject = await prisma.subject.create({ data: { classSectionId: cs.id, name: "Maths" } });
      ids.subject = subject.id;
      await prisma.teacherSubject.create({ data: { staffId: staff.id, subjectId: subject.id } });
      const student = await prisma.student.create({ data: { name: "TF Kid", rollNo: "1", admissionNo: `TF-${stamp}`, classSectionId: cs.id, userId: sUser.id } });
      ids.student = student.id;
      const T = tokenFor(tUser.id, "TEACHER");
      const S = tokenFor(sUser.id, "STUDENT");
      const A = tokenFor(aUser.id, "ADMIN");

      // Profile + password
      const upd = await call("PATCH", "/api/profile/me", T, { name: "TF Teacher Two", contact: "9876543210", qualifications: "M.Sc" });
      assert.strictEqual(upd.status, 200, JSON.stringify(upd.json));
      assert.strictEqual(upd.json.data.staff.contact, "9876543210");
      assert.strictEqual((await call("PATCH", "/api/profile/me", S, { name: "Hacker" })).status, 403);
      assert.strictEqual((await call("POST", "/api/profile/change-password", T, { currentPassword: "wrong", newPassword: "NewPass99" })).status, 400);
      assert.strictEqual((await call("POST", "/api/profile/change-password", T, { currentPassword: "Start123", newPassword: "NewPass99" })).status, 200);

      // My Students
      const roster = await call("GET", `/api/teaching/students?classSectionId=${cs.id}`, T);
      assert.strictEqual(roster.status, 200);
      assert.strictEqual(roster.json.data.access, "CLASS_TEACHER");
      assert.strictEqual(roster.json.data.students.length, 1);
      const overview = await call("GET", `/api/teaching/students/${student.id}`, T);
      assert.strictEqual(overview.status, 200);
      assert.strictEqual(overview.json.data.fees, undefined, "teachers never get fees");

      // Homework: create, submit, review
      const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      const hw = await call("POST", "/api/assignments", T, { title: "Chapter 3", description: "Q1-5", classSectionId: cs.id, subjectId: subject.id, dueDate: due });
      assert.strictEqual(hw.status, 201, JSON.stringify(hw.json));
      ids.assignment = hw.json.data.id;
      assert.strictEqual(hw.json.data.assignedBy.user.passwordHash, undefined);
      assert.strictEqual((await call("POST", `/api/assignments/${ids.assignment}/submit`, S, {})).status, 400);
      assert.strictEqual((await call("POST", `/api/assignments/${ids.assignment}/submit`, S, { text: "My answers" })).status, 201);
      assert.strictEqual((await call("PATCH", `/api/assignments/${ids.assignment}/submissions/${student.id}`, T, { action: "REDO" })).status, 400, "redo needs a comment");
      assert.strictEqual((await call("PATCH", `/api/assignments/${ids.assignment}/submissions/${student.id}`, T, { action: "REDO", comment: "Show working" })).status, 200);
      assert.strictEqual((await call("POST", `/api/assignments/${ids.assignment}/submit`, S, { text: "With working" })).status, 201, "resubmit after redo");
      assert.strictEqual((await call("PATCH", `/api/assignments/${ids.assignment}/submissions/${student.id}`, T, { action: "CHECKED", comment: "Well done" })).status, 200);
      assert.strictEqual((await call("POST", `/api/assignments/${ids.assignment}/submit`, S, { text: "again" })).status, 409, "can't change after checked");
      const mine = await call("GET", "/api/assignments", S);
      assert.strictEqual(mine.json.data[0].mySubmission.status, "CHECKED");

      // Remarks + publish gating
      const exam = await prisma.exam.create({ data: { sessionId: session.id, classSectionId: cs.id, name: "TF Term" } });
      ids.exam = exam.id;
      await prisma.examResult.create({ data: { examId: exam.id, studentId: student.id, subjectId: subject.id, marksObtained: 80, maxMarks: 100, enteredByUserId: tUser.id } });
      assert.strictEqual(
        (await call("PUT", `/api/exams/${exam.id}/remarks`, T, { rows: [{ studentId: student.id, remark: "Sincere", discipline: "A", workEducation: "B" }] })).status,
        200
      );
      assert.strictEqual((await call("GET", `/api/exams/${exam.id}/report-card/${student.id}`, S)).status, 403, "hidden until published");
      assert.strictEqual((await call("PATCH", `/api/exams/${exam.id}/publish`, A, { published: true })).status, 200);
      const card = await call("GET", `/api/exams/${exam.id}/report-card/${student.id}`, S);
      assert.strictEqual(card.status, 200);
      assert.strictEqual(card.json.data.remarks.remark, "Sincere");
      assert.strictEqual(card.json.data.remarks.coScholastic.discipline, "A");
      assert.strictEqual(card.json.data.rank, 1);
      assert.strictEqual((await call("PUT", `/api/exams/${exam.id}/remarks`, T, { rows: [{ studentId: student.id, remark: "x" }] })).status, 409, "locked after publish");

      // Student leave -> class teacher approves -> attendance marked LEAVE (Sundays skipped)
      const from = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const leave = await call("POST", "/api/leaves", S, { fromDate: from, toDate: to, reason: "Family function" });
      assert.strictEqual(leave.status, 201, JSON.stringify(leave.json));
      assert.strictEqual((await call("POST", "/api/leaves", S, { fromDate: from, toDate: from, reason: "Overlapping one" })).status, 409);
      const classLeaves = await call("GET", "/api/leaves/class", T);
      assert.ok(classLeaves.json.data.some((l: any) => l.id === leave.json.data.id));
      const decided = await call("PATCH", `/api/leaves/${leave.json.data.id}/decision`, T, { approved: true });
      assert.strictEqual(decided.status, 200);
      const leaveDays = await prisma.attendance.count({ where: { studentId: student.id, status: "LEAVE" } });
      assert.strictEqual(leaveDays, decided.json.data.attendanceMarked);
      assert.ok(leaveDays >= 2);

      // Teacher's own leave -> admin decides; teacher can't decide own
      const own = await call("POST", "/api/leaves", T, { fromDate: from, toDate: from, reason: "Doctor appointment" });
      assert.strictEqual(own.status, 201);
      assert.strictEqual((await call("PATCH", `/api/leaves/${own.json.data.id}/decision`, T, { approved: true })).status, 403);
      assert.strictEqual((await call("PATCH", `/api/leaves/${own.json.data.id}/decision`, A, { approved: false, note: "Exams week" })).status, 200);
    } finally {
      if (ids.student) {
        await prisma.leaveRequest.deleteMany({ where: { OR: [{ studentId: ids.student }, { staffId: ids.staff }] } });
        await prisma.attendance.deleteMany({ where: { studentId: ids.student } });
        await prisma.homeworkSubmission.deleteMany({ where: { studentId: ids.student } });
      }
      if (ids.exam) {
        await prisma.examStudentRemark.deleteMany({ where: { examId: ids.exam } });
        await prisma.examResultAudit.deleteMany({ where: { examId: ids.exam } });
        await prisma.examResult.deleteMany({ where: { examId: ids.exam } });
        await prisma.exam.delete({ where: { id: ids.exam } });
      }
      if (ids.assignment) await prisma.assignment.deleteMany({ where: { id: ids.assignment } });
      if (ids.student) await prisma.student.delete({ where: { id: ids.student } });
      if (ids.subject) {
        await prisma.teacherSubject.deleteMany({ where: { subjectId: ids.subject } });
        await prisma.subject.delete({ where: { id: ids.subject } });
      }
      if (ids.cs) await prisma.classSection.delete({ where: { id: ids.cs } });
      if (ids.session) await prisma.academicSession.delete({ where: { id: ids.session } });
      if (ids.staff) await prisma.staff.delete({ where: { id: ids.staff } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });
});
