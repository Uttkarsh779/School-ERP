import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { AttendanceStatus } from "../../generated/prisma/enums";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";
import { getStudentById } from "../students/service";
import { isParentLinkedToStudent } from "../parents/service";
import {
  getAttendanceForClassDate,
  getClassAttendanceRecords,
  getStudentAttendanceRecords,
  upsertAttendanceEntry,
} from "./service";

// SUPER_ADMIN/ADMIN can manage any class; a TEACHER only the class section they're
// the assigned class teacher for.
const canManageClassAttendance = async (req: CustomRequest, classSectionId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (role !== "TEACHER" || !req.user) return false;
  const staff = await findStaffByUserId(req.user.id);
  if (!staff) return false;
  return isClassTeacherOfSection(staff.id, classSectionId);
};

// SUPER_ADMIN/ADMIN can view any student; a TEACHER only for their own class section's
// students; a PARENT only for their own linked children.
const canViewStudentAttendance = async (req: CustomRequest, studentId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (!req.user) return false;

  const student = await getStudentById(studentId);
  if (!student) return false;

  if (role === "TEACHER") {
    const staff = await findStaffByUserId(req.user.id);
    if (!staff) return false;
    return isClassTeacherOfSection(staff.id, student.classSectionId);
  }

  if (role === "PARENT") {
    return isParentLinkedToStudent(req.user.id, studentId);
  }

  if (role === "STUDENT") {
    return student.userId === req.user.id;
  }

  return false;
};

const summarize = (records: Array<{ status: AttendanceStatus }>) => {
  const total = records.length;
  const present = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
  const percentage = total === 0 ? 0 : Math.round((present / total) * 1000) / 10;
  return { total, present, percentage };
};

// Marks attendance for one class/date across multiple students in one call. Each
// entry is processed independently (like the CSV import) so one bad studentId
// doesn't block the rest of the class from being marked.
export const postMarkAttendance = async (req: CustomRequest, res: Response): Promise<void> => {
  const { classSectionId, date, entries } = req.body;
  if (!classSectionId || !date || !Array.isArray(entries) || entries.length === 0) {
    res
      .status(400)
      .json({ success: false, message: "classSectionId, date and entries[] are required" });
    return;
  }

  const allowed = await canManageClassAttendance(req, Number(classSectionId));
  if (!allowed) {
    res
      .status(403)
      .json({ success: false, message: "You are not the class teacher for this class section" });
    return;
  }

  const parsedDate = new Date(date);
  const results: Array<{ studentId: number; success: boolean; message: string }> = [];

  for (const entry of entries as Array<{ studentId: number; status: string }>) {
    try {
      if (!Object.values(AttendanceStatus).includes(entry.status as AttendanceStatus)) {
        results.push({ studentId: entry.studentId, success: false, message: "Invalid status" });
        continue;
      }
      await upsertAttendanceEntry(
        Number(classSectionId),
        parsedDate,
        Number(entry.studentId),
        entry.status as AttendanceStatus,
        req.user!.id
      );
      results.push({ studentId: entry.studentId, success: true, message: "Marked" });
    } catch (error) {
      results.push({ studentId: entry.studentId, success: false, message: "Could not mark this student" });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.status(200).json({
    success: true,
    message: `Marked ${successCount}/${entries.length} students`,
    data: results,
  });
};

export const getClassAttendance = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.params.classSectionId);
  const date = req.query.date as string | undefined;
  if (!date) {
    res.status(400).json({ success: false, message: "date query param is required" });
    return;
  }

  const allowed = await canManageClassAttendance(req, classSectionId);
  if (!allowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const records = await getAttendanceForClassDate(classSectionId, new Date(date));
  res.status(200).json({ success: true, data: records });
};

export const getStudentSummary = async (req: CustomRequest, res: Response): Promise<void> => {
  const studentId = Number(req.params.studentId);
  const { from, to } = req.query as { from?: string; to?: string };

  const allowed = await canViewStudentAttendance(req, studentId);
  if (!allowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const records = await getStudentAttendanceRecords(
    studentId,
    from ? new Date(from) : undefined,
    to ? new Date(to) : undefined
  );
  res.status(200).json({ success: true, data: { records, ...summarize(records) } });
};

// Admin-only: students in a class section whose attendance % is below the given threshold.
export const getDefaulters = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.query.classSectionId);
  const threshold = req.query.threshold ? Number(req.query.threshold) : 75;
  if (!classSectionId) {
    res.status(400).json({ success: false, message: "classSectionId query param is required" });
    return;
  }

  const records = await getClassAttendanceRecords(classSectionId);
  const byStudent = new Map<number, { student: unknown; records: any[] }>();
  for (const record of records) {
    const entry = byStudent.get(record.studentId) ?? { student: record.student, records: [] as any[] };
    entry.records.push(record);
    byStudent.set(record.studentId, entry);
  }

  const defaulters = Array.from(byStudent.entries())
    .map(([studentId, entry]) => ({ studentId, student: entry.student, ...summarize(entry.records) }))
    .filter((entry) => entry.percentage < threshold);

  res.status(200).json({ success: true, data: defaulters });
};

// Admin-only: per-student attendance status counts for a given class section and month.
export const getMonthlyReport = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.query.classSectionId);
  const year = Number(req.query.year);
  const month = Number(req.query.month); // 1-12
  if (!classSectionId || !year || !month) {
    res
      .status(400)
      .json({ success: false, message: "classSectionId, year and month query params are required" });
    return;
  }

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  const records = await getClassAttendanceRecords(classSectionId, from, to);

  const byStudent = new Map<number, { student: unknown; counts: Record<string, number> }>();
  for (const record of records) {
    const defaultCounts: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    const entry = byStudent.get(record.studentId) ?? {
      student: record.student,
      counts: defaultCounts,
    };
    const statusKey = String(record.status);
    entry.counts[statusKey] = (entry.counts[statusKey] || 0) + 1;
    byStudent.set(record.studentId, entry);
  }

  const report = Array.from(byStudent.entries()).map(([studentId, entry]) => ({ studentId, ...entry }));
  res.status(200).json({ success: true, data: report });
};
