import assert from "node:assert";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import app from "../app";
import { computeExamAnalysis } from "../modules/exams/analysisService";

// Exam result analysis: ranks, ties, absent handling, pass mark, subject stats. The HTTP
// tests never reach the database (rejected by auth/role checks first).

const students = [
  { id: 1, name: "Asha", rollNo: "1", admissionNo: "A1", isActive: true },
  { id: 2, name: "Bilal", rollNo: "2", admissionNo: "A2", isActive: true },
  { id: 3, name: "Chitra", rollNo: "3", admissionNo: "A3", isActive: true },
  { id: 4, name: "Dev", rollNo: "4", admissionNo: "A4", isActive: true },
  { id: 5, name: "Esha", rollNo: "5", admissionNo: "A5", isActive: true },
  { id: 6, name: "Farhan", rollNo: "6", admissionNo: "A6", isActive: true },
  { id: 7, name: "Gita", rollNo: "7", admissionNo: "A7", isActive: true },
];
const subjects = [
  { id: 10, name: "Maths" },
  { id: 20, name: "English" },
  { id: 30, name: "Art" }, // no results entered for this exam -> not counted
];
const r = (studentId: number, subjectId: number, marksObtained: number, isAbsent = false) => ({
  studentId,
  subjectId,
  marksObtained,
  maxMarks: 100,
  isAbsent,
});

const analysis = computeExamAnalysis({
  passPercentage: 33,
  subjects,
  students,
  results: [
    r(1, 10, 90), r(1, 20, 80), // 170 PASS
    r(2, 10, 85), r(2, 20, 85), // 170 PASS (tie with Asha)
    r(3, 10, 95), r(3, 20, 30), // 125 FAIL (English below 33)
    r(4, 10, 0, true), r(4, 20, 0, true), // ABSENT in all
    r(5, 10, 70), r(5, 20, 0, true), // 70 FAIL (absent in English)
    r(6, 10, 60), // PENDING (English not entered)
    // Gita: nothing -> NOT_ENTERED
  ],
});
const byName = new Map(analysis.students.map((s) => [s.name, s]));

describe("exam result analysis", () => {
  test("only subjects with entered results count", () => {
    assert.deepStrictEqual(analysis.subjects.map((s) => s.name), ["English", "Maths"]);
  });

  test("result status per student", () => {
    assert.strictEqual(byName.get("Asha")!.status, "PASS");
    assert.strictEqual(byName.get("Chitra")!.status, "FAIL");
    assert.deepStrictEqual(byName.get("Chitra")!.failedSubjects, ["English"]);
    assert.strictEqual(byName.get("Dev")!.status, "ABSENT");
    assert.strictEqual(byName.get("Esha")!.status, "FAIL");
    assert.strictEqual(byName.get("Esha")!.absentSubjects, 1);
    assert.strictEqual(byName.get("Farhan")!.status, "PENDING");
    assert.strictEqual(byName.get("Gita")!.status, "NOT_ENTERED");
  });

  test("ties share a rank and the next rank is skipped (1, 1, 3, 4)", () => {
    assert.strictEqual(byName.get("Asha")!.rank, 1);
    assert.strictEqual(byName.get("Bilal")!.rank, 1);
    assert.strictEqual(byName.get("Chitra")!.rank, 3);
    assert.strictEqual(byName.get("Esha")!.rank, 4, "absent subject counts as 0 but the student is still ranked");
    for (const n of ["Dev", "Farhan", "Gita"]) assert.strictEqual(byName.get(n)!.rank, null, `${n} should be unranked`);
  });

  test("toppers are rank 1-3 and the summary adds up", () => {
    assert.deepStrictEqual(analysis.toppers.map((t) => t.name).sort(), ["Asha", "Bilal", "Chitra"]);
    const s = analysis.summary;
    assert.deepStrictEqual(
      [s.totalStudents, s.appeared, s.passed, s.failed, s.absent, s.pending, s.notEntered],
      [7, 4, 2, 2, 1, 1, 1]
    );
    assert.strictEqual(s.passRate, 50);
    assert.strictEqual(s.highestPercentage, 85);
  });

  test("subject stats exclude absentees and find the subject topper", () => {
    const maths = analysis.subjectStats.find((x) => x.subjectName === "Maths")!;
    assert.strictEqual(maths.absent, 1);
    assert.strictEqual(maths.appeared, 5);
    assert.strictEqual(maths.highestPercentage, 95);
    assert.deepStrictEqual(maths.toppers.map((t) => t.name), ["Chitra"]);
    const english = analysis.subjectStats.find((x) => x.subjectName === "English")!;
    assert.strictEqual(english.absent, 2);
    assert.strictEqual(english.failed, 1);
  });

  test("pass mark is applied per exam", () => {
    const strict = computeExamAnalysis({
      passPercentage: 85,
      subjects,
      students,
      results: [r(1, 10, 90), r(1, 20, 80)],
    });
    assert.strictEqual(strict.students.find((s) => s.name === "Asha")!.status, "FAIL");
  });

  test("empty exam produces no ranks and no crash", () => {
    const empty = computeExamAnalysis({ passPercentage: 33, subjects, students, results: [] });
    assert.strictEqual(empty.subjects.length, 0);
    assert.strictEqual(empty.toppers.length, 0);
    assert.strictEqual(empty.summary.passRate, null);
  });
});

describe("exam analysis access", () => {
  let server: Server;
  let base: string;
  const tokenFor = (role: string) =>
    jwt.sign({ id: 999999, email: `${role}@test.local`, role }, process.env.JWT_SECRET || "fallback_jwt_secret_key");

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test("no token → 401; students and parents → 403 (no seeing classmates' marks)", async () => {
    assert.strictEqual((await fetch(`${base}/api/exams/1/analysis`)).status, 401);
    for (const role of ["STUDENT", "PARENT"]) {
      const res = await fetch(`${base}/api/exams/1/analysis`, { headers: { Authorization: `Bearer ${tokenFor(role)}` } });
      assert.strictEqual(res.status, 403, role);
    }
  });
});
