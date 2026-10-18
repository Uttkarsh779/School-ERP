import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";
import { httpError } from "../../utils/httpError";

// Leave requests.
// - Student leave: applied from the student portal; decided by the student's class teacher
//   (or an admin). On approval, each day in the range (except Sundays) is marked LEAVE in
//   attendance — a day already marked PRESENT/LATE is left alone (the student came in).
// - Staff leave: applied by a staff member for themselves; decided by an admin (never by
//   the same person).

type Actor = { id: number; role: Role };
const DAY = 86_400_000;
const MAX_DAYS = 30;

const parseDay = (v: unknown, field: string) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw httpError(400, `${field} must be a date (YYYY-MM-DD)`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw httpError(400, `${field} is not a valid date`);
  return d;
};

const todayUTC = () => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Pure validation of a leave application — unit tested.
export const parseLeaveInput = (body: Record<string, unknown>, now = todayUTC()) => {
  const fromDate = parseDay(body.fromDate, "From date");
  const toDate = parseDay(body.toDate, "To date");
  if (toDate < fromDate) throw httpError(400, "To date can't be before the from date");
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY) + 1;
  if (days > MAX_DAYS) throw httpError(400, `A single request can cover at most ${MAX_DAYS} days`);
  if (fromDate.getTime() < now.getTime() - 7 * DAY) throw httpError(400, "Leave can be applied at most 7 days after it started");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5) throw httpError(400, "Please give a reason (at least 5 characters)");
  if (reason.length > 500) throw httpError(400, "Reason must be at most 500 characters");
  return { fromDate, toDate, reason, days };
};

const include = {
  student: { select: { id: true, name: true, rollNo: true, admissionNo: true, classSectionId: true, classSection: { select: { className: true, section: true } } } },
  staff: { select: { id: true, staffCategory: true, user: { select: { name: true } } } },
  requestedByUser: { select: { id: true, name: true } },
  decidedByUser: { select: { id: true, name: true } },
};

const shape = (r: any) => ({
  id: r.id,
  kind: r.studentId ? "STUDENT" : "STAFF",
  fromDate: r.fromDate,
  toDate: r.toDate,
  days: Math.round((new Date(r.toDate).getTime() - new Date(r.fromDate).getTime()) / DAY) + 1,
  reason: r.reason,
  status: r.status,
  createdAt: r.createdAt,
  decidedAt: r.decidedAt,
  decisionNote: r.decisionNote,
  decidedBy: r.decidedByUser?.name ?? null,
  student: r.student
    ? {
        id: r.student.id,
        name: r.student.name,
        rollNo: r.student.rollNo,
        admissionNo: r.student.admissionNo,
        classSection: r.student.classSection ? `${r.student.classSection.className} - ${r.student.classSection.section}` : null,
      }
    : null,
  staff: r.staff ? { id: r.staff.id, name: r.staff.user?.name ?? "—", category: r.staff.staffCategory } : null,
});

export const applyForLeave = async (actor: Actor, body: Record<string, unknown>) => {
  const input = parseLeaveInput(body);
  let target: { studentId?: number; staffId?: number };
  if (actor.role === "STUDENT") {
    const s = await prisma.student.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!s) throw httpError(400, "Your student record isn't linked yet");
    target = { studentId: s.id };
  } else {
    const staff = await prisma.staff.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!staff) throw httpError(400, "Only students and staff members can apply for leave");
    target = { staffId: staff.id };
  }

  // No overlapping pending/approved request for the same person.
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      ...target,
      status: { in: ["PENDING", "APPROVED"] },
      fromDate: { lte: input.toDate },
      toDate: { gte: input.fromDate },
    },
  });
  if (overlap) throw httpError(409, "You already have a leave request covering some of these days");

  const created = await prisma.leaveRequest.create({
    data: { ...target, fromDate: input.fromDate, toDate: input.toDate, reason: input.reason, requestedByUserId: actor.id },
    include,
  });
  return shape(created);
};

export const listMyLeaves = async (actor: Actor) => {
  const where =
    actor.role === "STUDENT"
      ? { student: { userId: actor.id } }
      : { staff: { userId: actor.id } };
  return (await prisma.leaveRequest.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 100 })).map(shape);
};

// Student leave requests for the classes this teacher is class teacher of.
export const listClassLeaves = async (actor: Actor) => {
  const staff = await prisma.staff.findUnique({ where: { userId: actor.id }, select: { id: true } });
  if (!staff) return [];
  const rows = await prisma.leaveRequest.findMany({
    where: { student: { classSection: { classTeacherId: staff.id } } },
    include,
    orderBy: [{ status: "asc" }, { fromDate: "desc" }],
    take: 200,
  });
  return rows.map(shape);
};

// Admin: everything, optionally filtered.
export const listAllLeaves = async (filters: { kind?: string; status?: string }) => {
  const where: Record<string, unknown> = {};
  if (filters.kind === "STUDENT") where.studentId = { not: null };
  if (filters.kind === "STAFF") where.staffId = { not: null };
  if (filters.status && ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(filters.status)) where.status = filters.status;
  return (await prisma.leaveRequest.findMany({ where, include, orderBy: [{ status: "asc" }, { fromDate: "desc" }], take: 300 })).map(shape);
};

export const decideLeave = async (actor: Actor, id: number, approved: boolean, note?: string) => {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { student: { select: { id: true, classSectionId: true, classSection: { select: { classTeacherId: true } } } }, staff: { select: { userId: true } } },
  });
  if (!leave) throw httpError(404, "Leave request not found");
  if (leave.status !== "PENDING") throw httpError(409, "This request has already been decided");

  const isAdmin = actor.role === "SUPER_ADMIN" || actor.role === "ADMIN";
  if (leave.studentId) {
    if (!isAdmin) {
      const staff = await prisma.staff.findUnique({ where: { userId: actor.id }, select: { id: true } });
      if (!staff || leave.student?.classSection?.classTeacherId !== staff.id) {
        throw httpError(403, "Only this student's class teacher or an admin can decide this request");
      }
    }
  } else {
    if (!isAdmin) throw httpError(403, "Staff leave is decided by an admin");
    if (leave.staff?.userId === actor.id) throw httpError(403, "You can't decide your own leave request");
  }

  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;

  return prisma.$transaction(async (tx: any) => {
    // Guard in the write itself against two people deciding at once.
    const { count } = await tx.leaveRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: approved ? "APPROVED" : "REJECTED", decidedByUserId: actor.id, decidedAt: new Date(), decisionNote: cleanNote },
    });
    if (count === 0) throw httpError(409, "This request has already been decided");

    let attendanceMarked = 0;
    if (approved && leave.student) {
      for (let t = leave.fromDate.getTime(); t <= leave.toDate.getTime(); t += DAY) {
        const date = new Date(t);
        if (date.getUTCDay() === 0) continue; // Sunday
        const existing = await tx.attendance.findUnique({ where: { studentId_date: { studentId: leave.student.id, date } } });
        if (existing && (existing.status === "PRESENT" || existing.status === "LATE")) continue;
        await tx.attendance.upsert({
          where: { studentId_date: { studentId: leave.student.id, date } },
          create: { studentId: leave.student.id, classSectionId: leave.student.classSectionId, date, status: "LEAVE", markedByUserId: actor.id },
          update: { status: "LEAVE", markedByUserId: actor.id },
        });
        attendanceMarked += 1;
      }
    }
    const updated = await tx.leaveRequest.findUnique({ where: { id }, include });
    return { ...shape(updated), attendanceMarked };
  });
};

export const cancelLeave = async (actor: Actor, id: number) => {
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave || leave.requestedByUserId !== actor.id) throw httpError(404, "Leave request not found");
  const { count } = await prisma.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (count === 0) throw httpError(409, "Only a pending request can be cancelled");
  return shape(await prisma.leaveRequest.findUnique({ where: { id }, include }));
};
