import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection, isTeacherLinkedToClassSection } from "../classSections/service";
import { isTeacherAssignedToSubject } from "../subjects/service";
import { getStudentById, getStudentByUserId } from "../students/service";
import { getParentByUserId } from "../parents/service";
import {
  createExam,
  getExamById,
  getReportCardData,
  getResultsForExam,
  listExamsForClassSection,
  upsertExamResult,
} from "./service";

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
  if (role === "TEACHER") {
    const student = await getStudentById(studentId);
    if (!student) return false;
    const staff = await findStaffByUserId(req.user.id);
    return !!staff && (await isTeacherLinkedToClassSection(staff.id, student.classSectionId));
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
  const { sessionId, name, classSectionId } = req.body;
  if (!sessionId || !name || !classSectionId) {
    res
      .status(400)
      .json({ success: false, message: "sessionId, name and classSectionId are required" });
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

  if (!(await canViewClassResultsGrid(req, exam.classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const results = await getResultsForExam(examId);
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
  const isClassTeacher = await isClassTeacherOfSection(staff.id, exam.classSectionId);

  if (!isClassTeacher && !(await isTeacherLinkedToClassSection(staff.id, exam.classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden: You are not assigned to this class section" });
    return;
  }

  const enteredByUserId = req.user!.id;

  const rows = results as Array<{
    studentId: number;
    subjectId: number;
    marksObtained: number;
    maxMarks: number;
  }>;
  const outcomes: Array<{ studentId: number; subjectId: number; success: boolean; message: string }> = [];

  for (const row of rows) {
    try {
      if (row.marksObtained == null || row.maxMarks == null || !row.subjectId) {
        outcomes.push({
          studentId: row.studentId,
          subjectId: row.subjectId,
          success: false,
          message: "subjectId, marksObtained and maxMarks are required",
        });
        continue;
      }

      if (!isClassTeacher) {
        const allowedForSubject = staffId ? await isTeacherAssignedToSubject(staffId, Number(row.subjectId)) : false;
        if (!allowedForSubject) {
          outcomes.push({
            studentId: row.studentId,
            subjectId: row.subjectId,
            success: false,
            message: "You aren't assigned to teach this subject",
          });
          continue;
        }
      }

      await upsertExamResult({
        examId,
        studentId: Number(row.studentId),
        subjectId: Number(row.subjectId),
        marksObtained: Number(row.marksObtained),
        maxMarks: Number(row.maxMarks),
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

  const reportCard = await getReportCardData(examId, studentId);
  if (!reportCard) {
    res.status(404).json({ success: false, message: "Exam not found" });
    return;
  }

  res.status(200).json({ success: true, data: reportCard });
};
