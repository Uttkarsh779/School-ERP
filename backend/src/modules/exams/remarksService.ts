import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { getExamAnalysis } from "./analysisService";

// Report-card remarks (CBSE style): per student per exam, the class teacher writes a remark
// and A/B/C co-scholastic grades. Admin publishes the results — only then do students see
// their report card. Publishing also locks the marks (results are final once published).

export const CO_SCHOLASTIC = ["workEducation", "artEducation", "healthPhysical", "discipline"] as const;
const GRADES = new Set(["A", "B", "C"]);

type RemarkRow = {
  studentId: number;
  remark?: string | null;
  workEducation?: string | null;
  artEducation?: string | null;
  healthPhysical?: string | null;
  discipline?: string | null;
};

// Pure validation — unit tested.
export const parseRemarkRows = (rows: unknown): RemarkRow[] => {
  if (!Array.isArray(rows) || rows.length === 0) throw httpError(400, "Nothing to save");
  return rows.map((r: any) => {
    const studentId = Number(r?.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) throw httpError(400, "Each row needs a student");
    const remark = typeof r.remark === "string" ? r.remark.trim() : "";
    if (remark.length > 400) throw httpError(400, "A remark can be at most 400 characters");
    const out: RemarkRow = { studentId, remark: remark || null };
    for (const k of CO_SCHOLASTIC) {
      const v = r[k] === null || r[k] === undefined || r[k] === "" ? null : String(r[k]).toUpperCase();
      if (v !== null && !GRADES.has(v)) throw httpError(400, "Co-scholastic grades must be A, B or C");
      out[k] = v;
    }
    return out;
  });
};

export const assertCanWriteRemarks = async (actor: { id: number; role: string }, classSectionId: number) => {
  if (actor.role === "SUPER_ADMIN" || actor.role === "ADMIN") return;
  if (actor.role !== "TEACHER") throw httpError(403, "Forbidden");
  const staff = await prisma.staff.findUnique({ where: { userId: actor.id }, select: { id: true } });
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { classTeacherId: true } });
  if (!staff || cs?.classTeacherId !== staff.id) throw httpError(403, "Only the class teacher writes report-card remarks");
};

export const getRemarksSheet = async (actor: { id: number; role: string }, examId: number) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { classSection: { select: { className: true, section: true } } } });
  if (!exam) throw httpError(404, "Exam not found");
  await assertCanWriteRemarks(actor, exam.classSectionId);

  const [students, remarks, analysis] = await Promise.all([
    prisma.student.findMany({ where: { classSectionId: exam.classSectionId, isActive: true }, orderBy: { rollNo: "asc" }, select: { id: true, name: true, rollNo: true } }),
    prisma.examStudentRemark.findMany({ where: { examId } }),
    getExamAnalysis(examId),
  ]);
  const byStudent = new Map(remarks.map((r: any) => [r.studentId, r]));
  const results = new Map((analysis?.students ?? []).map((s) => [s.studentId, s]));
  return {
    exam: {
      id: exam.id,
      name: exam.name,
      classSection: `${exam.classSection.className} - ${exam.classSection.section}`,
      resultsPublished: exam.resultsPublished,
      isLocked: exam.isLocked,
    },
    rows: students.map((s: any) => {
      const r: any = byStudent.get(s.id);
      const res: any = results.get(s.id);
      return {
        studentId: s.id,
        name: s.name,
        rollNo: s.rollNo,
        result: res ? { percentage: res.percentage, status: res.status, rank: res.rank } : null,
        remark: r?.remark ?? "",
        workEducation: r?.workEducation ?? "",
        artEducation: r?.artEducation ?? "",
        healthPhysical: r?.healthPhysical ?? "",
        discipline: r?.discipline ?? "",
      };
    }),
  };
};

export const saveRemarks = async (actor: { id: number; role: string }, examId: number, rawRows: unknown) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  await assertCanWriteRemarks(actor, exam.classSectionId);
  if (exam.resultsPublished) throw httpError(409, "Results are published. Ask an admin to unpublish before changing remarks.");
  const rows = parseRemarkRows(rawRows);

  const valid = new Set(
    (await prisma.student.findMany({ where: { classSectionId: exam.classSectionId, id: { in: rows.map((r) => r.studentId) } }, select: { id: true } })).map(
      (s: any) => s.id
    )
  );
  if (rows.some((r) => !valid.has(r.studentId))) throw httpError(400, "Some students aren't in this exam's class");

  await prisma.$transaction(
    rows.map((r) =>
      prisma.examStudentRemark.upsert({
        where: { examId_studentId: { examId, studentId: r.studentId } },
        create: { examId, ...r, updatedByUserId: actor.id },
        update: { ...r, updatedByUserId: actor.id },
      })
    )
  );
  return { saved: rows.length };
};

export const setResultsPublished = async (actor: { id: number }, examId: number, published: boolean) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  return prisma.exam.update({
    where: { id: examId },
    data: published
      ? {
          resultsPublished: true,
          publishedAt: new Date(),
          // Published results are final: lock marks if not already locked.
          ...(exam.isLocked ? {} : { isLocked: true, lockedAt: new Date(), lockedByUserId: actor.id }),
        }
      : { resultsPublished: false, publishedAt: null },
    include: { session: true, classSection: true, lockedByUser: { select: { id: true, name: true } } },
  });
};

export const getStudentRemark = (examId: number, studentId: number) =>
  prisma.examStudentRemark.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { remark: true, workEducation: true, artEducation: true, healthPhysical: true, discipline: true, updatedByUser: { select: { name: true } } },
  });
