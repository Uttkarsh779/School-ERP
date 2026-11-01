import { prisma } from "../../config/prisma";
import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection, isTeacherLinkedToClassSection, listClassSectionsForTeacher } from "../classSections/service";
import { isTeacherAssignedToSubject, listAllocatedSubjectIds } from "../subjects/service";
import { getStudentById, getStudentByUserId } from "../students/service";
import { getParentByUserId } from "../parents/service";
import {
  createExam,
  getExamById,
  getReportCardData,
  getResultsForExam,
  listExamResultAudit,
  listExamsForClassSection,
  listExamsForClassSections,
  saveExamResultWithAudit,
  setExamLock,
} from "./service";
import { getExamAnalysis } from "./analysisService";
import { getPrintableReportCards } from "./printService";
import { getRemarksSheet, getStudentRemark, saveRemarks, setResultsPublished } from "./remarksService";
import { onResultsPublished } from "../notifications/events";
import { createPlannedExam } from "./planService";
import { listDateSheets } from "./admitCardService";
import { assertCoordinator, assertPublisher, isCoordinator } from "./permissions";

// What part of a class's marks the caller may SEE:
//   FULL    - admins, and the class teacher (all subjects of their class)
//   SUBJECT - a subject teacher: only the subjects allocated to them in this class
//   null    - no access
type ExamScope = { mode: "FULL" } | { mode: "SUBJECT"; subjectIds: number[] } | null;

const getExamScope = async (req: CustomRequest, classSectionId: number): Promise<ExamScope> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return { mode: "FULL" };
  if (role !== "TEACHER" || !req.user) return null;
  const staff = await findStaffByUserId(req.user.id);
  if (!staff || !(await isTeacherLinkedToClassSection(staff.id, classSectionId))) return null;
  if (await isClassTeacherOfSection(staff.id, classSectionId)) return { mode: "FULL" };
  return { mode: "SUBJECT", subjectIds: await listAllocatedSubjectIds(staff.id, classSectionId) };
};

// SUPER_ADMIN/ADMIN see any class; TEACHER if class teacher OR they teach a subject
// in this class; STUDENT only their own class; PARENT only a linked child's class.
// A student's current class plus the classes of earlier sessions (after promotion their
// old exams and report cards stay visible to them and their parents).
const classIdsOfStudents = async (students: Array<{ id: number; classSectionId: number } | null | undefined>) => {
  const list = students.filter(Boolean) as Array<{ id: number; classSectionId: number }>;
  if (list.length === 0) return [];
  const history = await prisma.studentEnrollment.findMany({ where: { studentId: { in: list.map((s) => s.id) } }, select: { classSectionId: true } });
  return [...new Set([...list.map((s) => s.classSectionId), ...history.map((h: any) => h.classSectionId)])];
};

const canViewClassExams = async (req: CustomRequest, classSectionId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (!req.user) return false;

  if (role === "TEACHER") {
    const staff = await findStaffByUserId(req.user.id);
    return !!staff && (await isTeacherLinkedToClassSection(staff.id, classSectionId));
  }
  if (role === "STUDENT") {
    const student = await getStudentByUserId(req.user.id);
    return (await classIdsOfStudents([student])).includes(classSectionId);
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(req.user.id);
    return (await classIdsOfStudents((parent?.children ?? []).map((link: any) => link.student))).includes(classSectionId);
  }
  return false;
};

// Same viewer rules as canViewClassExams, resolved against a single student instead
// of a class section — used by the report-card endpoint (a student/parent only ever
// asks about themselves/their own linked child).
const canViewStudentExamResult = async (req: CustomRequest, studentId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (!req.user) return false;

  if (role === "STUDENT") {
    const student = await getStudentByUserId(req.user.id);
    return student?.id === studentId;
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(req.user.id);
    return !!parent?.children.some((link: any) => link.studentId === studentId);
  }
  // A full report card spans every subject, so among teachers only the class teacher sees it.
  if (role === "TEACHER") {
    const student = await getStudentById(studentId);
    if (!student) return false;
    const staff = await findStaffByUserId(req.user.id);
    return !!staff && (await isClassTeacherOfSection(staff.id, student.classSectionId));
  }
  return false;
};

// Class sections whose exams the caller may list (same rules as canViewClassExams).
const viewableClassSectionIds = async (req: CustomRequest): Promise<number[] | "ALL"> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "ALL";
  if (!req.user) return [];
  if (role === "TEACHER") {
    const staff = await findStaffByUserId(req.user.id);
    return staff ? (await listClassSectionsForTeacher(staff.id)).map((cs: any) => cs.id) : [];
  }
  if (role === "STUDENT") {
    const student = await getStudentByUserId(req.user.id);
    return classIdsOfStudents([student]);
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(req.user.id);
    return classIdsOfStudents((parent?.children ?? []).map((link: any) => link.student));
  }
  return [];
};

export const getExams = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;

  if (classSectionId && !(await canViewClassExams(req, classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  if (classSectionId) {
    res.status(200).json({ success: true, data: await listExamsForClassSection(classSectionId) });
    return;
  }

  // No class given: admins see every exam, everyone else only the classes they belong to.
  const ids = await viewableClassSectionIds(req);
  const exams = ids === "ALL" ? await listExamsForClassSection() : await listExamsForClassSections(ids);
  res.status(200).json({ success: true, data: exams });
};

// Date sheets of the exams the caller may see (same rules as the exam list): a student their
// own class, a teacher their classes, admins any class (or one with ?classSectionId=).
export const getDateSheets = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;
  if (classSectionId && !(await canViewClassExams(req, classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const ids = await viewableClassSectionIds(req);
  const classIds = classSectionId
    ? [classSectionId]
    : ids === "ALL"
      ? (await prisma.classSection.findMany({ where: { session: { isCurrent: true } }, select: { id: true } })).map((c: any) => c.id)
      : ids;
  res.json({ success: true, data: await listDateSheets(classIds) });
};

// Creating an exam for one class goes through the exam plan (coordinator only); teachers
// create class tests instead (planService.createClassTest).
export const postExam = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, classSectionId, type, term, admitCard, marksDeadline } = req.body ?? {};
  const result = await createPlannedExam(req.user!, { name, type, term, admitCard, marksDeadline, classSectionIds: [classSectionId] });
  res.status(201).json({ success: true, data: result });
};

// Marks-entry progress per subject: how many students have a mark (or AB) saved. Admins
// and the class teacher see every subject (with its teacher), a subject teacher only theirs.
export const getExamProgress = async (req: CustomRequest, res: Response): Promise<void> => {
  const exam = await getExamById(Number(req.params.id));
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }
  const scope = await getExamScope(req, exam.classSectionId);
  if (!scope) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const staff = req.user?.role === "TEACHER" ? await findStaffByUserId(req.user.id) : null;
  const [subjects, totalStudents, counts] = await Promise.all([
    prisma.subject.findMany({
      where: { classSectionId: exam.classSectionId, ...(scope.mode === "SUBJECT" ? { id: { in: scope.subjectIds } } : {}) },
      include: { teacherSubjects: { include: { staff: { select: { id: true, user: { select: { name: true } } } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.student.count({ where: { classSectionId: exam.classSectionId, isActive: true } }),
    prisma.examResult.groupBy({ by: ["subjectId"], where: { examId: exam.id, student: { isActive: true } }, _count: { _all: true } }),
  ]);
  const entered = new Map<number, number>(counts.map((c: any) => [c.subjectId, c._count._all]));
  res.json({
    success: true,
    data: {
      examId: exam.id,
      totalStudents,
      isClassTeacher: scope.mode === "FULL",
      subjects: subjects.map((s: any) => ({
        subjectId: s.id,
        name: s.name,
        teachers: s.teacherSubjects.map((t: any) => t.staff?.user?.name).filter(Boolean),
        isMine: !!staff && s.teacherSubjects.some((t: any) => t.staffId === staff.id),
        entered: Math.min(entered.get(s.id) ?? 0, totalStudents),
      })),
    },
  });
};

// Every result already saved for this exam — used to pre-fill the marks-entry grid on
// reopen. A subject teacher only gets their own subjects (see getExamScope).
export const getExamResults = async (req: CustomRequest, res: Response): Promise<void> => {
  const examId = Number(req.params.id);
  const exam = await getExamById(examId);
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  const scope = await getExamScope(req, exam.classSectionId);
  if (!scope) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const results = await getResultsForExam(examId, scope.mode === "SUBJECT" ? scope.subjectIds : undefined);
  res.status(200).json({ success: true, data: results });
};

// Bulk marks entry for one exam. Each result row is authorized AND processed
// independently (like the attendance mark-many/CSV-import patterns elsewhere in this
// codebase): a class teacher can enter any subject; a subject teacher who isn't the
// class teacher can only enter the subject(s) they're assigned to teach — one bad or
// unauthorized row doesn't sink the whole batch.
export const postExamResults = async (req: CustomRequest, res: Response): Promise<void> => {
  const examId = Number(req.params.id);
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ success: false, message: "results[] is required" });
    return;
  }

  const exam = await getExamById(examId);
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  if (exam.isLocked) {
    res.status(409).json({
      success: false,
      message: "Marks for this exam are locked. Ask the exam coordinator to unlock it to make corrections.",
    });
    return;
  }
  if (exam.marksDeadline && exam.marksDeadline < new Date() && !(await isCoordinator(req.user!))) {
    res.status(409).json({ success: false, message: "The marks-entry deadline for this exam has passed. Ask the exam coordinator to extend it." });
    return;
  }
  // Max marks are set per subject for the exam (not typed per student).
  const examSubjects = new Map<number, number>((await prisma.examSubject.findMany({ where: { examId } })).map((s: any) => [s.subjectId, s.maxMarks]));

  const role = req.user!.role;
  if (role !== "TEACHER") {
    res.status(403).json({
      success: false,
      message: "Forbidden: Admins have read-only access. Only assigned subject teachers can enter or modify marks.",
    });
    return;
  }

  const staff = await findStaffByUserId(req.user!.id);
  if (!staff) {
    res.status(403).json({ success: false, message: "Forbidden: Staff profile not found" });
    return;
  }

  const staffId = staff.id;

  if (!(await isTeacherLinkedToClassSection(staff.id, exam.classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden: You are not assigned to this class section" });
    return;
  }

  const enteredByUserId = req.user!.id;

  const rows = results as Array<{
    studentId: number;
    subjectId: number;
    marksObtained: number;
    maxMarks: number;
    isAbsent?: boolean;
  }>;
  const outcomes: Array<{ studentId: number; subjectId: number; success: boolean; message: string }> = [];

  for (const row of rows) {
    try {
      // An absent row is stored with marksObtained = 0. Max marks come from the exam.
      if (row.isAbsent) row.marksObtained = 0;
      const subjectMax = examSubjects.get(Number(row.subjectId));
      if (subjectMax === undefined || (exam.subjectId && exam.subjectId !== Number(row.subjectId))) {
        outcomes.push({ studentId: row.studentId, subjectId: row.subjectId, success: false, message: "This subject has no paper in this exam" });
        continue;
      }
      row.maxMarks = subjectMax;
      if (row.marksObtained == null || row.maxMarks == null || !row.subjectId) {
        outcomes.push({
          studentId: row.studentId,
          subjectId: row.subjectId,
          success: false,
          message: "subjectId, marksObtained and maxMarks are required",
        });
        continue;
      }

      const obtained = Number(row.marksObtained);
      const max = Number(row.maxMarks);
      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(obtained) || obtained < 0 || obtained > max) {
        outcomes.push({
          studentId: row.studentId,
          subjectId: row.subjectId,
          success: false,
          message: "Marks must be between 0 and the max marks, and max marks must be above 0",
        });
        continue;
      }

      // Only the teacher allocated to the subject may enter it - the class teacher included
      // (they can view every subject of their class, but edit only the ones they teach).
      if (!(await isTeacherAssignedToSubject(staffId, Number(row.subjectId)))) {
        outcomes.push({
          studentId: row.studentId,
          subjectId: row.subjectId,
          success: false,
          message: "You aren't the allocated teacher for this subject",
        });
        continue;
      }

      await saveExamResultWithAudit({
        examId,
        studentId: Number(row.studentId),
        subjectId: Number(row.subjectId),
        marksObtained: Number(row.marksObtained),
        maxMarks: Number(row.maxMarks),
        isAbsent: !!row.isAbsent,
        enteredByUserId,
      });
      outcomes.push({ studentId: row.studentId, subjectId: row.subjectId, success: true, message: "Saved" });
    } catch (error) {
      outcomes.push({
        studentId: row.studentId,
        subjectId: row.subjectId,
        success: false,
        message: "Could not save this result",
      });
    }
  }

  const successCount = outcomes.filter((o) => o.success).length;
  res.status(200).json({
    success: true,
    message: `Saved ${successCount}/${rows.length} results`,
    data: outcomes,
  });
};

export const getReportCard = async (req: CustomRequest, res: Response): Promise<void> => {
  const examId = Number(req.params.id);
  const studentId = Number(req.params.studentId);

  const allowed = await canViewStudentExamResult(req, studentId);
  if (!allowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const exam = await getExamById(examId);
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }
  // Students (and parents) see marks only after publishing, except class tests (visible at once).
  const role = req.user!.role;
  if ((role === "STUDENT" || role === "PARENT") && !exam.resultsPublished && exam.type !== "CLASS_TEST") {
    res.status(403).json({ success: false, message: "Results for this exam haven't been published yet." });
    return;
  }

  const reportCard = await getReportCardData(examId, studentId);
  if (!reportCard) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  // Rank is shown once results are final (published or locked).
  const analysis = await getExamAnalysis(examId);
  const mine = analysis?.students.find((s) => s.studentId === studentId);
  const isFinal = exam.resultsPublished || exam.isLocked;
  const remark = await getStudentRemark(examId, studentId);
  res.status(200).json({
    success: true,
    data: {
      ...reportCard,
      isFinal,
      resultsPublished: exam.resultsPublished,
      status: mine?.status ?? null,
      failedSubjects: mine?.failedSubjects ?? [],
      // No rank on report cards (school policy); ranks stay in the staff result analysis.
      rank: null,
      rankedCount: null,
      remarks: remark
        ? {
            remark: remark.remark,
            classTeacher: remark.updatedByUser?.name ?? null,
            coScholastic: {
              workEducation: remark.workEducation,
              artEducation: remark.artEducation,
              healthPhysical: remark.healthPhysical,
              discipline: remark.discipline,
            },
          }
        : null,
    },
  });
};

// Printable report cards. With ?studentId= the same viewers as the on-screen report card;
// without it, the whole class — admins and the class teacher only.
export const getReportCardsPrint = async (req: CustomRequest, res: Response): Promise<void> => {
  const examId = Number(req.params.id);
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;

  const exam = await getExamById(examId);
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  if (studentId) {
    if (!(await canViewStudentExamResult(req, studentId))) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
    const role = req.user!.role;
    if ((role === "STUDENT" || role === "PARENT") && !exam.resultsPublished && exam.type !== "CLASS_TEST") {
      res.status(403).json({ success: false, message: "Results for this exam haven't been published yet." });
      return;
    }
  } else if ((await getExamScope(req, exam.classSectionId))?.mode !== "FULL") {
    res.status(403).json({ success: false, message: "Only admins and the class teacher can print the whole class's report cards." });
    return;
  }

  const data = await getPrintableReportCards(examId, studentId);
  if (!data) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }
  res.status(200).json({ success: true, data });
};

// Merit list, ranks, toppers and subject-wise statistics for one exam. Staff only — same
// rule as the class results grid (a student must not see classmates' marks).
export const getExamAnalysisHandler = async (req: CustomRequest, res: Response): Promise<void> => {
  const examId = Number(req.params.id);
  const exam = await getExamById(examId);
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  const scope = await getExamScope(req, exam.classSectionId);
  if (!scope) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const analysis = await getExamAnalysis(examId, scope.mode === "SUBJECT" ? scope.subjectIds : undefined);
  res.status(200).json({ success: true, data: analysis });
};

// Admin-only: lock (teachers can no longer edit) or unlock an exam's marks.
export const patchExamLock = async (req: CustomRequest, res: Response): Promise<void> => {
  const { locked } = req.body ?? {};
  if (typeof locked !== "boolean") {
    res.status(400).json({ success: false, message: "locked (boolean) is required" });
    return;
  }
  const exam = await getExamById(Number(req.params.id));
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }
  await assertCoordinator(req.user!);
  // After publishing, only the publisher (Super Admin / Principal) can reopen marks.
  if (!locked && exam.resultsPublished) await assertPublisher(req.user!);
  const updated = await setExamLock(exam.id, locked, req.user!.id);
  res.status(200).json({ success: true, message: locked ? "Marks locked" : "Marks unlocked", data: updated });
};

// Change history of an exam's marks - same visibility as the marks themselves.
export const getExamAudit = async (req: CustomRequest, res: Response): Promise<void> => {
  const exam = await getExamById(Number(req.params.id));
  if (!exam) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }
  const scope = await getExamScope(req, exam.classSectionId);
  if (!scope) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const rows = await listExamResultAudit(exam.id, scope.mode === "SUBJECT" ? scope.subjectIds : undefined);
  res.status(200).json({ success: true, data: rows });
};

// Class teacher (or admin): the remarks sheet for an exam, with each student's result.
export const getExamRemarks = async (req: CustomRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await getRemarksSheet(req.user!, Number(req.params.id)) });
};

export const putExamRemarks = async (req: CustomRequest, res: Response): Promise<void> => {
  res.json({ success: true, message: "Remarks saved", data: await saveRemarks(req.user!, Number(req.params.id), req.body?.rows) });
};

// Admin: publish / unpublish results (publishing also locks the marks).
export const patchExamPublish = async (req: CustomRequest, res: Response): Promise<void> => {
  if (typeof req.body?.published !== "boolean") {
    res.status(400).json({ success: false, message: "published (boolean) is required" });
    return;
  }
  await assertPublisher(req.user!);
  const exam = await setResultsPublished(req.user!, Number(req.params.id), req.body.published);
  if (req.body.published) onResultsPublished(exam.id);
  res.json({ success: true, message: req.body.published ? "Results published" : "Results unpublished", data: exam });
};
