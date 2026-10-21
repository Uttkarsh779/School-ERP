import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";

// Exam rules for teachers: only the class teacher creates exams; a subject teacher sees
// only their own subjects (progress + results). Uses existing data; the exam it creates
// is removed afterwards.
const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tag = `ZZ Scope ${Date.now().toString(36)}`;
let server: Server;
let base: string;
const ctx: { classId: number; sessionId: number; classTeacherUser: number; subjectUser: number; subjectStaff: number; examId: number } = {
  classId: 0,
  sessionId: 0,
  classTeacherUser: 0,
  subjectUser: 0,
  subjectStaff: 0,
  examId: 0,
};

const tokenFor = async (userId: number) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return jwt.sign({ id: u.id, email: u.email, role: u.role }, secret());
};
const call = async (method: string, path: string, userId: number, body?: unknown) => {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenFor(userId)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
};

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // A class with a class teacher AND a different teacher allocated to one of its subjects.
  const classes = await prisma.classSection.findMany({
    where: { classTeacherId: { not: null }, session: { isCurrent: true } },
    include: { classTeacher: true, subjects: { include: { teacherSubjects: { include: { staff: true } } } } },
  });
  for (const c of classes) {
    const other = c.subjects.flatMap((s) => s.teacherSubjects).find((t) => t.staffId !== c.classTeacherId && t.staff.isActive);
    if (other && c.classTeacher) {
      ctx.classId = c.id;
      ctx.sessionId = c.sessionId;
      ctx.classTeacherUser = c.classTeacher.userId;
      ctx.subjectUser = other.staff.userId;
      ctx.subjectStaff = other.staffId;
      break;
    }
  }
});

after(async () => {
  if (ctx.examId) await prisma.exam.deleteMany({ where: { id: ctx.examId } });
  await new Promise<void>((r) => server.close(() => r()));
});

describe("teacher exam scope", () => {
  test("a subject teacher cannot create an exam", async (t) => {
    if (!ctx.classId) return t.skip("no class with a separate subject teacher in the data");
    const r = await call("POST", "/api/exams", ctx.subjectUser, { name: tag, classSectionId: ctx.classId });
    assert.strictEqual(r.status, 403);
  });

  test("the class teacher creates it, in the class's session; duplicates are refused", async (t) => {
    if (!ctx.classId) return t.skip("no suitable class");
    const r = await call("POST", "/api/exams", ctx.classTeacherUser, { name: tag, classSectionId: ctx.classId, passPercentage: 40 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    ctx.examId = r.json.data.id;
    assert.strictEqual(r.json.data.sessionId, ctx.sessionId);
    const dup = await call("POST", "/api/exams", ctx.classTeacherUser, { name: tag.toUpperCase(), classSectionId: ctx.classId });
    assert.strictEqual(dup.status, 409);
  });

  test("progress: class teacher sees every subject, subject teacher only their own", async (t) => {
    if (!ctx.examId) return t.skip("exam not created");
    const full = await call("GET", `/api/exams/${ctx.examId}/progress`, ctx.classTeacherUser);
    assert.strictEqual(full.status, 200);
    assert.strictEqual(full.json.data.isClassTeacher, true);
    const allSubjects = await prisma.subject.count({ where: { classSectionId: ctx.classId } });
    assert.strictEqual(full.json.data.subjects.length, allSubjects);

    const mine = await call("GET", `/api/exams/${ctx.examId}/progress`, ctx.subjectUser);
    assert.strictEqual(mine.status, 200);
    assert.strictEqual(mine.json.data.isClassTeacher, false);
    const allocated = await prisma.teacherSubject.count({ where: { staffId: ctx.subjectStaff, subject: { classSectionId: ctx.classId } } });
    assert.strictEqual(mine.json.data.subjects.length, allocated);
    assert.ok(mine.json.data.subjects.every((s: any) => s.isMine));
  });
});
