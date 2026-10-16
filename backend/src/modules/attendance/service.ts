import { prisma } from "../../config/prisma";
import type { AttendanceStatus } from "../../generated/prisma/enums";

export const upsertAttendanceEntry = (
  classSectionId: number,
  date: Date,
  studentId: number,
  status: AttendanceStatus,
  markedByUserId: number
) =>
  prisma.attendance.upsert({
    where: { studentId_date: { studentId, date } },
    create: { studentId, classSectionId, date, status, markedByUserId },
    update: { status, markedByUserId },
  });

export const getAttendanceForClassDate = (classSectionId: number, date: Date) =>
  prisma.attendance.findMany({
    where: { classSectionId, date },
    include: { student: true },
    orderBy: { student: { rollNo: "asc" } },
  });

export const getStudentAttendanceRecords = (studentId: number, from?: Date, to?: Date) =>
  prisma.attendance.findMany({
    where: { studentId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

export const getClassAttendanceRecords = (classSectionId: number, from?: Date, to?: Date) =>
  prisma.attendance.findMany({
    where: { classSectionId, date: { gte: from, lte: to } },
    include: { student: true },
  });
