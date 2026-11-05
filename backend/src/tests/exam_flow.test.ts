import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../config/prisma";
import { gradeFor, passedFor, FALLBACK_SCHEME } from "../modules/exams/schemeService";
import { parseDateSheet } from "../modules/exams/admitCardService";

// The exam module end to end, from each role's side: coordinator teacher, subject teacher,
// class teacher, publisher and student. Runs on its own ZZ classes (one two-term, one
// one-result) and removes everything afterwards.
const secret = () => process.env.JWT_SECRET || "fallback_jwt_secret_key";
const tag = `ZZFlow${Date.now().toString(36)}`;
const oneResultClass = `${tag}One`;
const token = (u: { id: number; email: string; role: string }) => jwt.sign({ id: u.id, email: u.email, role: u.role }, secret());

let server: Server;
let base: string;
const made = { users: [] as number[], staff: [] as number[], classes: [] as number[], students: [] as number[], subjects: [] as number[], schemeId: 0 };
const t = { coord: "", teacher: "", classTeacher: "", publisher: "", student: "", student2: "" };
const c = { sessionId: 0, classId: 0, oneClassId: 0, maths: 0, art: 0, oneMaths: 0, s1: 0, s2: 0, oneStudent: 0, coordUser: 0 };

const call = async (method: string, path: string, tok: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};
const ok = (r: { status: number; json: any }, status = 200) => {
  assert.strictEqual(r.status, status, JSON.stringify(r.json));
  return r.json.data;
};

const staffUser = async (name: string, role = "TEACHER", coordinator = false) => {
  const user = await prisma.user.create({ data: { email: `${tag}-${name}@test.local`, passwordHash: "x", role: role as any, name: `${tag} ${name}` } });
  made.users.push(user.id);
  const staff = await prisma.staff.create({ data: { userId: user.id, isExamCoordinator: coordinator } });
  made.staff.push(staff.id);
  return { user, staff };
};
const studentIn = async (classSectionId: number, roll: string) => {
  const user = await prisma.user.create({ data: { email: `${tag}-s${classSectionId}${roll}@test.local`, passwordHash: "x", role: "STUDENT", name: `${tag} Kid ${roll}` } });
  made.users.push(user.id);
  const student = await prisma.student.create({ data: { name: `${tag} Kid ${roll}`, rollNo: roll, admissionNo: `${tag}-${classSectionId}-${roll}`, classSectionId, userId: user.id } });
  made.students.push(student.id);
  return { user, student };
};
const subject = async (classSectionId: number, name: string, staffId?: number) => {
  const s = await prisma.subject.create({ data: { classSectionId, name } });
  made.subjects.push(s.id);
  if (staffId) await prisma.teacherSubject.create({ data: { staffId, subjectId: s.id } });
  return s.id;
};

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const session = await prisma.academicSession.findFirstOrThrow({ where: { isCurrent: true } });
  c.sessionId = session.id;
  const coord = await staffUser("Coord", "TEACHER", true);
  const teacher = await staffUser("Teacher");
  const classTeacher = await staffUser("ClassT");
  const principal = await staffUser("Principal", "PRINCIPAL");
  c.coordUser = coord.user.id;
  t.coord = token(coord.user);
  t.teacher = token(teacher.user);
  t.classTeacher = token(classTeacher.user);
  t.publisher = token(principal.user);

  const cls = await prisma.classSection.create({ data: { sessionId: session.id, className: tag, section: "A", classTeacherId: classTeacher.staff.id } });
  const one = await prisma.classSection.create({ data: { sessionId: session.id, className: oneResultClass, section: "A", classTeacherId: classTeacher.staff.id } });
  made.classes.push(cls.id, one.id);
  c.classId = cls.id;
  c.oneClassId = one.id;
  const scheme = await prisma.assessmentScheme.create({
    data: { name: `${tag} one`, classNames: [oneResultClass], terms: 1, paMax: 20, examMax: 80, finalWeights: [100], paComponents: [{ key: "PT", label: "Periodic tests", max: 20, source: "TESTS", rule: "AVERAGE" }] as any, gradeScale: [] as any },
  });
  made.schemeId = scheme.id;

  c.maths = await subject(cls.id, "Maths", teacher.staff.id);
  c.art = await subject(cls.id, "Art"); // nobody teaches this one
  c.oneMaths = await subject(one.id, "Maths", teacher.staff.id);
  const k1 = await studentIn(cls.id, "1");
  const k2 = await studentIn(cls.id, "2");
  const k3 = await studentIn(one.id, "1");
  c.s1 = k1.student.id;
  c.s2 = k2.student.id;
  c.oneStudent = k3.student.id;
  t.student = token(k1.user);
  t.student2 = token(k3.user);
});

after(async () => {
  const exams = (await prisma.exam.findMany({ where: { classSectionId: { in: made.classes } }, select: { id: true } })).map((e) => e.id);
  await prisma.resultPublication.deleteMany({ where: { classSectionId: { in: made.classes } } });
  await prisma.termRemark.deleteMany({ where: { classSectionId: { in: made.classes } } });
  await prisma.assessmentMark.deleteMany({ where: { classSectionId: { in: made.classes } } });
  await prisma.periodicAdjustment.deleteMany({ where: { classSectionId: { in: made.classes } } });
  await prisma.assessmentAudit.deleteMany({ where: { classSectionId: { in: made.classes } } });
  await prisma.examResultAudit.deleteMany({ where: { examId: { in: exams } } });
  await prisma.examResult.deleteMany({ where: { examId: { in: exams } } });
  await prisma.exam.deleteMany({ where: { id: { in: exams } } });
  await prisma.student.deleteMany({ where: { id: { in: made.students } } });
  await prisma.teacherSubject.deleteMany({ where: { subjectId: { in: made.subjects } } });
  await prisma.subject.deleteMany({ where: { id: { in: made.subjects } } });
  await prisma.classSection.deleteMany({ where: { id: { in: made.classes } } });
  await prisma.staff.deleteMany({ where: { id: { in: made.staff } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  if (made.schemeId) await prisma.assessmentScheme.delete({ where: { id: made.schemeId } });
  await new Promise<void>((r) => server.close(() => r()));
});

const plan = async (name: string, type: string, term: number, classSectionIds: number[]) => {
  const created = ok(await call("POST", "/api/exams/plan", t.coord, { name, type, term, classSectionIds }), 201);
  return prisma.exam.findMany({ where: { groupKey: created.groupKey } });
};
const enter = (examId: number, rows: any[], tok = t.teacher) => call("POST", `/api/exams/${examId}/results`, tok, { results: rows });
const mark = (studentId: number, subjectId: number, marksObtained: number) => ({ studentId, subjectId, marksObtained, maxMarks: 0 });

describe("pure rules", () => {
  test("pass and grade agree at the rounding edge", () => {
    assert.strictEqual(gradeFor(FALLBACK_SCHEME, 32.6), "D");
    assert.strictEqual(passedFor(FALLBACK_SCHEME, 32.6), true);
    assert.strictEqual(gradeFor(FALLBACK_SCHEME, 32.4), "E");
    assert.strictEqual(passedFor(FALLBACK_SCHEME, 32.4), false);
  });

  test("a date sheet can't have two papers at once", () => {
    const names = new Map([[1, "Maths"], [2, "Art"]]);
    const entry = (subjectId: number, start: string, end: string) => ({ subjectId, date: "2026-12-01", start, end });
    assert.throws(() => parseDateSheet({ entries: [entry(1, "09:00", "11:00"), entry(2, "10:00", "12:00")] }, [1, 2], names), /Maths and Art overlap/);
    assert.strictEqual(parseDateSheet({ entries: [entry(1, "09:00", "11:00"), entry(2, "11:00", "12:00")] }, [1, 2], names).entries.length, 2);
    assert.throws(() => parseDateSheet({ entries: [{ subjectId: 1, date: "2026-12-01", start: "", end: "" }] }, [1], names), /Maths: enter the start/);
  });
});

describe("exam flow", () => {
  let term1: number;
  let pt1: number;

  test("a coordinator teacher with no classes can plan and see every class", async () => {
    const classes = ok(await call("GET", "/api/exams/classes", t.coord));
    assert.ok(classes.some((x: any) => x.id === c.classId));
    assert.strictEqual((await call("GET", "/api/exams/classes", t.teacher)).status, 403, "ordinary teachers don't get it");

    term1 = (await plan(`${tag} Half Yearly`, "TERM_EXAM", 1, [c.classId]))[0].id;
    pt1 = (await plan(`${tag} PT1`, "PERIODIC_TEST", 1, [c.classId]))[0].id;
    const exams = ok(await call("GET", "/api/exams", t.coord));
    assert.ok(exams.some((e: any) => e.id === term1), "the planner lists exams of classes they don't teach");
    assert.strictEqual(ok(await call("GET", `/api/exams/${term1}/analysis`, t.coord)).scope, "FULL");
    assert.strictEqual((await call("GET", `/api/exams/${term1}/progress`, t.coord)).status, 200);
    assert.strictEqual((await call("GET", `/api/exams/${term1}/audit`, t.coord)).status, 200);
  });

  test("a class has one term exam per term, also when editing", async () => {
    const second = await call("POST", "/api/exams/plan", t.coord, { name: `${tag} Other`, type: "TERM_EXAM", term: 1, classSectionIds: [c.classId] });
    assert.strictEqual(second.status, 409);
    assert.match(second.json.message, /already has a term exam/);
    const annual = await plan(`${tag} Annual`, "TERM_EXAM", 2, [c.classId]);
    const moved = await call("PATCH", `/api/exams/plan/${annual[0].groupKey}`, t.coord, { term: 1 });
    assert.strictEqual(moved.status, 409, "can't move onto a taken term");
  });

  test("progress only counts subjects with a paper", async () => {
    // Art has no teacher and no paper in this exam.
    ok(await call("PUT", `/api/exams/${term1}/subjects`, t.coord, { subjects: [{ subjectId: c.art, maxMarks: null }] }));
    const p = ok(await call("GET", `/api/exams/${term1}/progress`, t.coord));
    assert.deepStrictEqual(p.subjects.map((s: any) => s.name), ["Maths"]);
  });

  test("marks entry: right class only, and a saved mark can be taken back", async () => {
    const rows = ok(await enter(term1, [mark(c.s1, c.maths, 60), mark(c.s2, c.maths, 20), mark(c.oneStudent, c.maths, 40)]));
    assert.deepStrictEqual(rows.map((o: any) => o.success), [true, true, false], "a student of another class is refused");
    assert.match(rows[2].message, /isn't in this class/);

    const removed = ok(await enter(term1, [{ studentId: c.s2, subjectId: c.maths, marksObtained: 0, maxMarks: 0, clear: true }]));
    assert.strictEqual(removed[0].success, true);
    assert.strictEqual(await prisma.examResult.count({ where: { examId: term1, studentId: c.s2 } }), 0);
    const audit = ok(await call("GET", `/api/exams/${term1}/audit`, t.coord));
    assert.strictEqual(audit[0].action, "DELETE");
    assert.strictEqual(audit[0].oldMarks, 20);
  });

  test("ready needs every mark, and unlocking asks for it again", async () => {
    const early = await call("PATCH", `/api/exams/${term1}/ready`, t.classTeacher, { ready: true });
    assert.strictEqual(early.status, 409);
    assert.match(early.json.message, /Maths \(1\)/);
    ok(await enter(term1, [{ studentId: c.s2, subjectId: c.maths, marksObtained: 0, maxMarks: 0, isAbsent: true }]));
    ok(await call("PATCH", `/api/exams/${term1}/ready`, t.classTeacher, { ready: true }));
    ok(await call("PATCH", `/api/exams/${term1}/lock`, t.coord, { locked: true }));
    assert.strictEqual((await call("PUT", `/api/exams/${term1}/subjects`, t.coord, { subjects: [{ subjectId: c.maths, maxMarks: 100 }] })).status, 409, "max marks stay put once locked");
    ok(await call("PATCH", `/api/exams/${term1}/lock`, t.coord, { locked: false }));
    assert.strictEqual((await prisma.exam.findUniqueOrThrow({ where: { id: term1 } })).readyAt, null);
  });

  test("a part with no periodic test isn't reported missing; a final mark settles the parts", async () => {
    // Maths has PT1 with no marks for anyone yet, plus notebook and enrichment to enter.
    const before = ok(await call("GET", `/api/exams/results?classSectionId=${c.classId}&term=1`, t.coord));
    const row = before.students.find((s: any) => s.student.id === c.s1).subjects.find((x: any) => x.subjectId === c.maths);
    assert.deepStrictEqual(row.missing, ["Periodic tests", "Notebook", "Subject enrichment"]);
    assert.strictEqual(row.complete, false);
    ok(await call("PUT", "/api/exams/assessment/adjust", t.teacher, { classSectionId: c.classId, term: 1, subjectId: c.maths, rows: [{ studentId: c.s1, marks: 15 }] }));
    const after = ok(await call("GET", `/api/exams/results?classSectionId=${c.classId}&term=1`, t.coord));
    const settled = after.students.find((s: any) => s.student.id === c.s1).subjects.find((x: any) => x.subjectId === c.maths);
    assert.strictEqual(settled.complete, true);
    assert.deepStrictEqual(settled.missing, []);
    assert.ok(after.attendance, "unpublished results carry attendance for printing");
  });

  test("a bad row saves nothing from the sheet", async () => {
    const bad = await call("PUT", "/api/exams/assessment/marks", t.teacher, {
      classSectionId: c.classId, term: 1, subjectId: c.maths,
      rows: [{ studentId: c.s1, component: "NB", marks: 4 }, { studentId: c.s2, component: "NB", marks: 99 }],
    });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(await prisma.assessmentMark.count({ where: { classSectionId: c.classId } }), 0);
    assert.strictEqual((await call("PUT", "/api/exams/assessment/marks", t.teacher, { classSectionId: c.classId, term: 7, subjectId: c.maths, rows: [] })).status, 400, "no such term");
    assert.strictEqual((await call("PUT", "/api/exams/assessment/marks", t.teacher, { classSectionId: c.oneClassId, term: 1, subjectId: c.maths, rows: [] })).status, 400, "subject of another class");
  });

  test("the final waits for both terms", async () => {
    const r = await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.classId], term: 0 });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /Term 1 and Term 2 first/);
  });

  test("publishing a term locks and releases its exams; nothing can change until unpublished", async () => {
    assert.strictEqual((await call("GET", `/api/exams/${term1}/report-card/${c.s1}`, t.student)).status, 403, "hidden before publishing");

    const res = ok(await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.classId], term: 1 }));
    assert.strictEqual(res.published, 1);
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: term1 } });
    assert.ok(exam.isLocked && exam.resultsPublished);
    const pt = await prisma.exam.findUniqueOrThrow({ where: { id: pt1 } });
    assert.ok(pt.isLocked, "the periodic test is locked too");
    assert.strictEqual(pt.resultsPublished, false, "with no marks in it, there's nothing to release");

    assert.strictEqual((await call("GET", `/api/exams/${term1}/report-card/${c.s1}`, t.student)).status, 200);
    assert.strictEqual(ok(await call("GET", "/api/exams/my-results", t.student)).length, 1);

    assert.strictEqual((await enter(term1, [mark(c.s1, c.maths, 70)])).status, 409);
    assert.strictEqual((await call("PATCH", `/api/exams/${term1}/lock`, t.coord, { locked: false })).status, 409, "published marks can't be reopened");
    assert.strictEqual((await call("PATCH", `/api/exams/${term1}/publish`, t.publisher, { published: false })).status, 409, "the term goes back first");
    assert.strictEqual((await call("PUT", "/api/exams/assessment/adjust", t.teacher, { classSectionId: c.classId, term: 1, subjectId: c.maths, rows: [{ studentId: c.s1, marks: 10 }] })).status, 409);
    assert.strictEqual((await call("PUT", "/api/exams/term-remarks", t.classTeacher, { classSectionId: c.classId, term: 1, rows: [] })).status, 409);
    const moved = await call("PATCH", `/api/exams/plan/${exam.groupKey}`, t.coord, { term: 2 });
    assert.strictEqual(moved.status, 409, "a published exam stays in its term");

    const again = await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.classId], term: 1 });
    assert.strictEqual(again.status, 409, "publishing twice would overwrite the frozen result");
  });

  test("unpublishing takes the exams back; the coordinator reopens the marks", async () => {
    ok(await call("DELETE", `/api/exams/results?classSectionId=${c.classId}&term=1`, t.publisher));
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: term1 } });
    assert.strictEqual(exam.resultsPublished, false);
    assert.strictEqual(exam.isLocked, true);
    assert.strictEqual((await call("GET", `/api/exams/${term1}/report-card/${c.s1}`, t.student)).status, 403);
    ok(await call("PATCH", `/api/exams/${term1}/lock`, t.coord, { locked: false }));
    assert.strictEqual(ok(await enter(term1, [mark(c.s1, c.maths, 70)]))[0].success, true);
  });

  test("an exam or term with no marks can't be published", async () => {
    const annual = await prisma.exam.findFirstOrThrow({ where: { classSectionId: c.classId, term: 2, type: "TERM_EXAM" } });
    assert.strictEqual((await call("PATCH", `/api/exams/${annual.id}/publish`, t.publisher, { published: true })).status, 409);
    const r = await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.classId], term: 2 });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /no marks/);
  });

  test("a one-result class publishes once, whatever it's called", async () => {
    const halfYearly = (await plan(`${tag} HY`, "TERM_EXAM", 1, [c.oneClassId]))[0];
    const annual = (await plan(`${tag} Annual10`, "TERM_EXAM", 2, [c.oneClassId]))[0];
    ok(await enter(halfYearly.id, [mark(c.oneStudent, c.oneMaths, 60)]));
    ok(await enter(annual.id, [mark(c.oneStudent, c.oneMaths, 70)]));

    const term2 = await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.oneClassId], term: 2 });
    assert.strictEqual(term2.status, 409);
    assert.match(term2.json.message, /one result for the year/);

    ok(await call("POST", "/api/exams/results/publish", t.publisher, { classSectionIds: [c.oneClassId], term: 0 }));
    const pubs = await prisma.resultPublication.findMany({ where: { classSectionId: c.oneClassId } });
    assert.deepStrictEqual(pubs.map((p) => p.term), [1], "a one-result class's final is stored as its one result");
    for (const e of [halfYearly, annual]) {
      const fresh = await prisma.exam.findUniqueOrThrow({ where: { id: e.id } });
      assert.ok(fresh.isLocked && fresh.resultsPublished, "both exams fed the one result");
    }
    assert.strictEqual((await enter(annual.id, [mark(c.oneStudent, c.oneMaths, 75)])).status, 409);
    assert.strictEqual(ok(await call("GET", "/api/exams/results/overview", t.publisher)).find((x: any) => x.id === c.oneClassId).examStatus[0].locked, 2);
  });

  test("copying a date sheet and max marks to the other classes matches subjects by name", async () => {
    const group = await plan(`${tag} PT2`, "PERIODIC_TEST", 2, [c.classId]);
    // A second class-level exam in the same plan, sharing the groupKey.
    ok(await call("PATCH", `/api/exams/plan/${group[0].groupKey}`, t.coord, { addClassSectionIds: [c.oneClassId] }).then((r) => r));
    const [own, other] = [group[0].id, (await prisma.exam.findFirstOrThrow({ where: { groupKey: group[0].groupKey, classSectionId: c.oneClassId } })).id];
    ok(await call("PUT", `/api/exams/${own}/subjects`, t.coord, { subjects: [{ subjectId: c.maths, maxMarks: 25 }] }));
    ok(await call("POST", `/api/exams/${own}/subjects/copy`, t.coord));
    assert.strictEqual((await prisma.examSubject.findFirstOrThrow({ where: { examId: other, subjectId: c.oneMaths } })).maxMarks, 25);

    assert.strictEqual((await call("POST", `/api/exams/${own}/date-sheet/copy`, t.coord)).status, 400, "nothing to copy yet");
    ok(await call("PUT", `/api/exams/${own}/date-sheet`, t.coord, { entries: [{ subjectId: c.maths, date: "2026-12-07", start: "09:00", end: "11:00" }] }));
    const copied = ok(await call("POST", `/api/exams/${own}/date-sheet/copy`, t.coord));
    assert.strictEqual(copied.classes, 1);
    const sheet = (await prisma.exam.findUniqueOrThrow({ where: { id: other } })).dateSheet as any;
    assert.strictEqual(sheet.entries[0].subjectId, c.oneMaths, "mapped onto the other class's own subject");
  });

  test("students never get a rank", async () => {
    const dash = ok(await call("GET", "/api/dashboard/student", t.student)).latestResult;
    assert.ok(dash === null || dash.rank === null);
  });
});
