import { prisma } from "../../config/prisma";
import { getStudentDueSummary } from "../fees/feeChargeService";
import { getExamAnalysis } from "../exams/analysisService";
import { percentage } from "../attendance/reportService";

// Everything the student dashboard + profile need, for the logged-in student only:
// profile extras (class teacher, session, guardians, transport), today's timetable,
// attendance (this month / overall / recent days), fee dues (same calculation as the Fees
// page), open homework and the latest exam result.
//
// Rank is shown only once an exam is LOCKED by an admin (marks final) — before that the
// result is labelled provisional and carries no rank, since late entries could reorder it.

const istToday = (now = new Date()) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isoDay = date.getUTCDay();
  return { date, monthStart: new Date(Date.UTC(y, m - 1, 1)), dayOfWeek: isoDay === 0 ? 7 : isoDay };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const getStudentDashboard = async (userId: number) => {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      classSection: {
        include: {
          session: { select: { id: true, name: true } },
          classTeacher: { select: { user: { select: { name: true } } } },
        },
      },
      parents: { include: { parent: { select: { name: true, contact: true, email: true } } } },
      transportAssignments: {
        where: { status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        take: 1,
        include: { village: { select: { name: true } } },
      },
    },
  });
  if (!student) return { hasStudentProfile: false as const };

  const today = istToday();
  const classSectionId = student.classSectionId;

  const [slots, monthRecords, overall, recentRecords, homework, exams] = await Promise.all([
    prisma.timetableSlot.findMany({
      where: { classSectionId, dayOfWeek: today.dayOfWeek },
      orderBy: { periodNumber: "asc" },
      include: { subject: { select: { name: true } }, staff: { select: { user: { select: { name: true } } } } },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { studentId: student.id, date: { gte: today.monthStart, lte: today.date } },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({ by: ["status"], where: { studentId: student.id }, _count: { _all: true } }),
    prisma.attendance.findMany({
      where: { studentId: student.id },
      orderBy: { date: "desc" },
      take: 10,
      select: { date: true, status: true },
    }),
    prisma.assignment.findMany({
      where: { classSectionId, endDate: { gte: today.date } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { subject: { select: { name: true } } },
    }),
    // Most recent exams of the class that already have marks for this student.
    prisma.exam.findMany({
      where: { classSectionId, resultsPublished: true, results: { some: { studentId: student.id } } },
      orderBy: { id: "desc" },
      take: 1,
      select: { id: true },
    }),
  ]);

  const counts = (rows: any[]) => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } as Record<string, number>;
    for (const r of rows) c[r.status] += r._count._all;
    const marked = c.PRESENT + c.ABSENT + c.LATE + c.LEAVE;
    return { ...c, marked, percentage: percentage(c.PRESENT, marked) };
  };

  // Fees — reuse the Fees page's own calculation so the numbers always match it.
  let fees: {
    totalOutstanding: number;
    totalAdvanceAvailable: number;
    overdueCount: number;
    nextDue: { label: string; dueDate: string; amount: number } | null;
  } | null = null;
  try {
    const due = await getStudentDueSummary(student.id);
    const open = (due.charges as any[]).filter((c) => c.outstandingAmount > 0);
    const next = open.slice().sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    fees = {
      totalOutstanding: due.totalOutstanding,
      totalAdvanceAvailable: due.totalAdvanceAvailable,
      overdueCount: open.filter((c) => new Date(c.dueDate) < today.date).length,
      nextDue: next
        ? {
            label: `${next.feeHead?.name ?? "Fee"} · ${MONTHS[next.billingMonth - 1] ?? ""} ${next.billingYear}`,
            dueDate: new Date(next.dueDate).toISOString(),
            amount: next.outstandingAmount,
          }
        : null,
    };
  } catch {
    fees = null; // the dashboard still renders; the Fees page shows the details
  }

  let latestResult: {
    examId: number;
    examName: string;
    isFinal: boolean;
    total: number;
    maxTotal: number;
    percentage: number | null;
    status: string;
    rank: number | null;
    rankedCount: number | null;
    failedSubjects: string[];
  } | null = null;
  if (exams.length) {
    const analysis = await getExamAnalysis(exams[0].id);
    const mine = analysis?.students.find((s) => s.studentId === student.id);
    if (analysis && mine) {
      const isFinal = analysis.exam.isLocked;
      latestResult = {
        examId: analysis.exam.id,
        examName: analysis.exam.name,
        isFinal,
        total: mine.total,
        maxTotal: mine.maxTotal,
        percentage: mine.percentage,
        status: mine.status,
        rank: isFinal ? mine.rank : null,
        rankedCount: isFinal ? analysis.summary.appeared : null,
        failedSubjects: mine.failedSubjects,
      };
    }
  }

  const cs: any = student.classSection;
  const transport: any = (student as any).transportAssignments?.[0];

  return {
    hasStudentProfile: true as const,
    today: today.date.toISOString().slice(0, 10),
    profileExtras: {
      sessionName: cs?.session?.name ?? null,
      classTeacherName: cs?.classTeacher?.user?.name ?? null,
      guardians: ((student as any).parents ?? []).map((link: any) => ({
        name: link.parent?.name ?? "—",
        relationship: link.relationshipType ?? null,
        contact: link.parent?.contact ?? null,
        email: link.parent?.email ?? null,
        isPrimary: link.isPrimary,
      })),
      transport: transport
        ? { villageName: transport.village?.name ?? null, startDate: transport.startDate, policy: transport.policy }
        : null,
    },
    todaySchedule: slots.map((s: any) => ({
      id: s.id,
      periodNumber: s.periodNumber,
      subjectName: s.subject?.name ?? null,
      teacherName: s.staff?.user?.name ?? null,
      room: s.room ?? null,
    })),
    attendance: {
      month: counts(monthRecords as any[]),
      overall: counts(overall as any[]),
      recent: (recentRecords as any[]).map((r) => ({ date: r.date.toISOString().slice(0, 10), status: r.status })),
    },
    fees,
    homework: (homework as any[]).map((a) => ({
      id: a.id,
      title: a.title,
      subjectName: a.subject?.name ?? null,
      dueDate: a.dueDate,
    })),
    latestResult,
  };
};
