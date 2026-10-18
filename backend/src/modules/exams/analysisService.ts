import { prisma } from "../../config/prisma";

// Detailed result analysis for one exam (one class section): merit list with ranks,
// pass/fail per student and per subject, toppers and subject-wise statistics.
//
// Rules:
// - The subjects that count are those with at least one result entered for this exam, so
//   a class subject not tested in this exam isn't treated as "missing" for everyone.
// - Per subject, a student PASSES when not absent and marks/max >= exam.passPercentage.
// - Student result:
//     NOT_ENTERED – no marks/AB recorded at all
//     ABSENT      – marked AB in every counted subject
//     PENDING     – some counted subjects still have nothing entered
//     FAIL        – complete, and failed or was absent in at least one subject
//     PASS        – complete, passed every subject
// - Rank: everyone with a complete entry who appeared in at least one subject (PASS/FAIL),
//   by total marks (an absent subject counts as 0). Ties share a rank: 1, 2, 2, 4.

export type ResultStatus = "PASS" | "FAIL" | "ABSENT" | "PENDING" | "NOT_ENTERED";

export interface AnalysisInput {
  passPercentage: number;
  subjects: Array<{ id: number; name: string }>;
  students: Array<{ id: number; name: string; rollNo: string; admissionNo: string; isActive: boolean }>;
  results: Array<{ studentId: number; subjectId: number; marksObtained: number; maxMarks: number; isAbsent: boolean }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (obtained: number, max: number) => (max > 0 ? round1((obtained / max) * 100) : 0);

export const computeExamAnalysis = ({ passPercentage, subjects, students, results }: AnalysisInput) => {
  const testedSubjectIds = new Set(results.map((r) => r.subjectId));
  const counted = subjects
    .filter((s) => testedSubjectIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const resultByKey = new Map(results.map((r) => [`${r.studentId}:${r.subjectId}`, r]));

  // Students: roster plus anyone who has results (e.g. since moved class / deactivated).
  const studentMap = new Map(students.map((s) => [s.id, s]));
  for (const r of results) {
    if (!studentMap.has(r.studentId)) {
      studentMap.set(r.studentId, { id: r.studentId, name: `Student #${r.studentId}`, rollNo: "—", admissionNo: "—", isActive: false });
    }
  }

  const rows = [...studentMap.values()].map((student) => {
    let total = 0;
    let maxTotal = 0;
    let entered = 0;
    let absentCount = 0;
    const failedSubjects: string[] = [];

    const marks = counted.map((subject) => {
      const r = resultByKey.get(`${student.id}:${subject.id}`);
      if (!r) return { subjectId: subject.id, entered: false as const };
      entered += 1;
      maxTotal += r.maxMarks;
      if (r.isAbsent) {
        absentCount += 1;
        failedSubjects.push(subject.name);
        return { subjectId: subject.id, entered: true as const, isAbsent: true, marksObtained: 0, maxMarks: r.maxMarks, percentage: 0, passed: false };
      }
      total += r.marksObtained;
      const p = pct(r.marksObtained, r.maxMarks);
      const passed = r.maxMarks > 0 && (r.marksObtained / r.maxMarks) * 100 >= passPercentage;
      if (!passed) failedSubjects.push(subject.name);
      return { subjectId: subject.id, entered: true as const, isAbsent: false, marksObtained: r.marksObtained, maxMarks: r.maxMarks, percentage: p, passed };
    });

    let status: ResultStatus;
    if (entered === 0) status = "NOT_ENTERED";
    else if (absentCount === entered && entered === counted.length) status = "ABSENT";
    else if (entered < counted.length) status = "PENDING";
    else status = failedSubjects.length > 0 ? "FAIL" : "PASS";

    return {
      studentId: student.id,
      name: student.name,
      rollNo: student.rollNo,
      admissionNo: student.admissionNo,
      isActive: student.isActive,
      marks,
      total,
      maxTotal,
      percentage: maxTotal > 0 ? pct(total, maxTotal) : null,
      absentSubjects: absentCount,
      failedSubjects,
      status,
      rank: null as number | null,
    };
  });

  // Standard competition ranking among PASS/FAIL students.
  const rankable = rows.filter((r) => r.status === "PASS" || r.status === "FAIL").sort((a, b) => b.total - a.total);
  rankable.forEach((r, i) => {
    r.rank = i > 0 && rankable[i - 1].total === r.total ? rankable[i - 1].rank : i + 1;
  });

  const statusOrder: Record<ResultStatus, number> = { PASS: 0, FAIL: 0, PENDING: 1, ABSENT: 2, NOT_ENTERED: 3 };
  rows.sort(
    (a, b) =>
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      statusOrder[a.status] - statusOrder[b.status] ||
      a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })
  );

  const subjectStats = counted.map((subject) => {
    const entries = results.filter((r) => r.subjectId === subject.id);
    const appeared = entries.filter((r) => !r.isAbsent);
    const percentages = appeared.map((r) => (r.maxMarks > 0 ? (r.marksObtained / r.maxMarks) * 100 : 0));
    const passedCount = appeared.filter((r) => r.maxMarks > 0 && (r.marksObtained / r.maxMarks) * 100 >= passPercentage).length;
    const best = percentages.length ? Math.max(...percentages) : null;
    const toppers =
      best === null
        ? []
        : appeared
            .filter((r) => (r.maxMarks > 0 ? (r.marksObtained / r.maxMarks) * 100 : 0) === best)
            .map((r) => ({ studentId: r.studentId, name: studentMap.get(r.studentId)!.name, marksObtained: r.marksObtained, maxMarks: r.maxMarks }));
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      entered: entries.length,
      appeared: appeared.length,
      absent: entries.length - appeared.length,
      passed: passedCount,
      failed: appeared.length - passedCount,
      passRate: appeared.length ? round1((passedCount / appeared.length) * 100) : null,
      highestPercentage: best === null ? null : round1(best),
      lowestPercentage: percentages.length ? round1(Math.min(...percentages)) : null,
      averagePercentage: percentages.length ? round1(percentages.reduce((a, b) => a + b, 0) / percentages.length) : null,
      toppers,
    };
  });

  const ranked = rows.filter((r) => r.rank !== null);
  const rankedPct = ranked.map((r) => r.percentage ?? 0);
  const count = (s: ResultStatus) => rows.filter((r) => r.status === s).length;

  return {
    passPercentage,
    subjects: counted,
    summary: {
      totalStudents: rows.length,
      appeared: ranked.length,
      passed: count("PASS"),
      failed: count("FAIL"),
      absent: count("ABSENT"),
      pending: count("PENDING"),
      notEntered: count("NOT_ENTERED"),
      passRate: ranked.length ? round1((count("PASS") / ranked.length) * 100) : null,
      averagePercentage: rankedPct.length ? round1(rankedPct.reduce((a, b) => a + b, 0) / rankedPct.length) : null,
      highestPercentage: rankedPct.length ? Math.max(...rankedPct) : null,
      lowestPercentage: rankedPct.length ? Math.min(...rankedPct) : null,
    },
    toppers: ranked.filter((r) => (r.rank ?? 99) <= 3),
    subjectStats,
    students: rows,
  };
};

// subjectIds set = a subject teacher's view: only their subjects, and no class-wide ranks
// or toppers (a rank computed from one subject would be misleading as a "class rank").
export const getExamAnalysis = async (examId: number, subjectIds?: number[]) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { session: { select: { name: true } }, classSection: { select: { id: true, className: true, section: true } } },
  });
  if (!exam) return null;

  const [subjects, students, results] = await Promise.all([
    prisma.subject.findMany({ where: { classSectionId: exam.classSectionId }, select: { id: true, name: true } }),
    prisma.student.findMany({
      where: { classSectionId: exam.classSectionId, isActive: true },
      select: { id: true, name: true, rollNo: true, admissionNo: true, isActive: true },
    }),
    prisma.examResult.findMany({
      where: { examId, ...(subjectIds ? { subjectId: { in: subjectIds } } : {}) },
      select: {
        studentId: true,
        subjectId: true,
        marksObtained: true,
        maxMarks: true,
        isAbsent: true,
        student: { select: { id: true, name: true, rollNo: true, admissionNo: true, isActive: true } },
        subject: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Include students/subjects referenced by results even if no longer on the roster.
  const studentById = new Map(students.map((s: any) => [s.id, s]));
  const subjectById = new Map(subjects.map((s: any) => [s.id, s]));
  for (const r of results as any[]) {
    if (!studentById.has(r.studentId)) studentById.set(r.studentId, r.student);
    if (!subjectById.has(r.subjectId)) subjectById.set(r.subjectId, r.subject);
  }

  const allowedSubjects = [...subjectById.values()].filter((s: any) => !subjectIds || subjectIds.includes(s.id));
  const analysis = computeExamAnalysis({
    passPercentage: exam.passPercentage,
    subjects: allowedSubjects as any,
    students: [...studentById.values()] as any,
    results: (results as any[]).map((r) => ({
      studentId: r.studentId,
      subjectId: r.subjectId,
      marksObtained: r.marksObtained,
      maxMarks: r.maxMarks,
      isAbsent: r.isAbsent,
    })),
  });
  if (subjectIds) {
    analysis.toppers = [];
    for (const s of analysis.students) s.rank = null;
  }

  return {
    scope: (subjectIds ? "SUBJECT" : "FULL") as "SUBJECT" | "FULL",
    exam: {
      id: exam.id,
      name: exam.name,
      sessionName: exam.session?.name ?? null,
      classSection: exam.classSection,
      isLocked: exam.isLocked,
      lockedAt: exam.lockedAt,
    },
    ...analysis,
  };
};
