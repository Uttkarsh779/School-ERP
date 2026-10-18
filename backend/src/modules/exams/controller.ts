import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection, isTeacherLinkedToClassSection } from "../classSections/service";
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
  saveExamResultWithAudit,
  setExamLock,
} from "./service";
import { getExamAnalysis } from "./analysisService";
import { getRemarksSheet, getStudentRemark, saveRemarks, setResultsPublished } from "./remarksService";

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
    return student?.classSectionId === classSectionId;
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(req.user.id);
    return !!parent?.children.some((link: any) => link.student?.classSectionId === classSectionId);
  }
  return false;
};

// Full class-wise results grid — staff-only (a student seeing classmates' marks would
// be a privacy problem, so this deliberately excludes STUDENT/PARENT even though they
// can view their own single report card via getReportCard below).
const canViewClassResultsGrid = async (req: CustomRequest, classSectionId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (role !== "TEACHER" || !req.user) return false;
  const staff = await findStaffByUserId(req.user.id);
  return !!staff && (await isTeacherLinkedToClassSection(staff.id, classSectionId));
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

export const getExams = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;

  if (classSectionId && !(await canViewClassExams(req, classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const exams = await listExamsForClassSection(classSectionId);
  res.status(200).json({ success: true, data: exams });
};

// Admin can create an exam for any class; a teacher only for a class they're linked
// to (class teacher or subject teacher there) — e.g. a subject teacher setting up
// their own unit test for a class doesn't need to go through the admin.
export const postExam = async (req: CustomRequest, res: Response): Promise<void> => {
  const { sessionId, name, classSectionId, passPercentage } = req.body;
  if (!sessionId || !name || !classSectionId) {
    res
      .status(400)
      .json({ success: false, message: "sessionId, name and classSectionId are required" });
    return;
  }

  // Optional — defaults to 33% (the column default) when omitted.
  const passMark = passPercentage === undefined || passPercentage === "" ? undefined : Number(passPercentage);
  if (passMark !== undefined && (!Number.isFinite(passMark) || passMark < 0 || passMark > 100)) {
    res.status(400).json({ success: false, message: "passPercentage must be between 0 and 100" });
    return;
  }

  if (!(await canViewClassResultsGrid(req, Number(classSectionId)))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const exam = await createExam({
    sessionId: Number(sessionId),
    name,
    classSectionId: Number(classSectionId),
    passPercentage: passMark,
  });
  res.status(201).json({ success: true, data: exam });
};

// Every result already saved for this exam — used to pre-fill the marks-entry grid on
// reopen, and as the staff-only "class-wise" results view (see canViewClassResultsGrid).
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
      message: "Marks for this exam are locked. Ask an administrator to unlock it to make corrections.",
    });
    return;
  }

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
      // An absent row only needs maxMarks; it's stored with marksObtained = 0.
      if (row.isAbsent) row.marksObtained = 0;
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
  // Students (and parents) see a report card only after the admin publishes the results.
  const role = req.user!.role;
  if ((role === "STUDENT" || role === "PARENT") && !exam.resultsPublished) {
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
      rank: isFinal ? mine?.rank ?? null : null,
      rankedCount: isFinal ? analysis?.summary.appeared ?? null : null,
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
  const exam = await setResultsPublished(req.user!, Number(req.params.id), req.body.published);
  res.json({ success: true, message: req.body.published ? "Results published" : "Results unpublished", data: exam });
};
