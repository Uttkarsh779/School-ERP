import { prisma } from "../../config/prisma";
import { percentage } from "../attendance/reportService";

// Operational picture for the admin dashboard (ADMIN + SUPER_ADMIN), all from real data:
// today's attendance, this month's attendance, exam marks-entry progress, recent
// admissions, birthdays, and setup gaps / pending actions that block other features.
// Fee figures come from fees/overviewService (added by the caller).

const LOW_ATTENDANCE = 75; // same threshold as the attendance reports

const istToday = (now = new Date()) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  return { y, m, d, date: new Date(Date.UTC(y, m - 1, d)), monthStart: new Date(Date.UTC(y, m - 1, 1)) };
};

export const getAdminOperationalOverview = async () => {
  const today = istToday();
  const session = await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const classes = session
    ? await prisma.classSection.findMany({
        where: { sessionId: session.id },
        include: {
          classTeacher: { select: { user: { select: { name: true } } } },
          _count: { select: { students: { where: { isActive: true } } } },
        },
        orderBy: [{ className: "asc" }, { section: "asc" }],
      })
    : [];
  const classIds = classes.map((c: any) => c.id);
  const label = (c: any) => `${c.className} - ${c.section}`;

  const [todayRows, monthRows, exams, recentStudents, newThisMonth, dobRows, structures, subjectsNoTeacher, lateRuleCount, pendingRefunds] =
    await Promise.all([
      classIds.length
        ? prisma.attendance.groupBy({ by: ["classSectionId", "status"], where: { classSectionId: { in: classIds }, date: today.date }, _count: { _all: true } })
        : [],
      classIds.length
        ? prisma.attendance.groupBy({
            by: ["classSectionId", "status"],
            where: { classSectionId: { in: classIds }, date: { gte: today.monthStart, lte: today.date } },
            _count: { _all: true },
          })
        : [],
      session
        ? prisma.exam.findMany({
            where: { sessionId: session.id },
            orderBy: { id: "desc" },
            take: 6,
            include: { classSection: { select: { id: true, className: true, section: true } }, _count: { select: { results: true } } },
          })
        : [],
      prisma.student.findMany({
        where: { isActive: true },
        orderBy: [{ admissionDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, name: true, admissionNo: true, admissionDate: true, createdAt: true, classSection: { select: { className: true, section: true } } },
      }),
      prisma.student.count({
        where: {
          OR: [
            { admissionDate: { gte: today.monthStart } },
            { admissionDate: null, createdAt: { gte: today.monthStart } },
          ],
        },
      }),
      prisma.student.findMany({
        where: { isActive: true, dob: { not: null } },
        select: { id: true, name: true, dob: true, classSection: { select: { className: true, section: true } } },
      }),
      session ? prisma.feeStructure.findMany({ where: { sessionId: session.id }, select: { classSectionId: true } }) : [],
      classIds.length
        ? prisma.subject.findMany({
            where: { classSectionId: { in: classIds }, teacherSubjects: { none: {} } },
            select: { id: true, name: true, classSection: { select: { className: true, section: true } } },
          })
        : [],
      session ? prisma.lateFeeRule.count({ where: { sessionId: session.id } }) : 0,
      prisma.refund.count({ where: { status: { in: ["REFUND_REQUESTED", "REFUND_APPROVED"] } } }),
    ]);

  // ---- Attendance today
  const todayByClass = new Map<number, { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number }>();
  for (const r of todayRows as any[]) {
    const c = todayByClass.get(r.classSectionId) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    c[r.status as keyof typeof c] += r._count._all;
    todayByClass.set(r.classSectionId, c);
  }
  const todayTotals = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  for (const c of todayByClass.values()) (Object.keys(todayTotals) as (keyof typeof todayTotals)[]).forEach((k) => (todayTotals[k] += c[k]));
  const markedToday = todayTotals.PRESENT + todayTotals.ABSENT + todayTotals.LATE + todayTotals.LEAVE;
  const classesWithStudents = classes.filter((c: any) => c._count.students > 0);
  const notMarked = classesWithStudents
    .filter((c: any) => !todayByClass.has(c.id))
    .map((c: any) => ({ classSectionId: c.id, classSection: label(c), classTeacher: c.classTeacher?.user?.name ?? null, students: c._count.students }));

  // ---- Attendance this month
  const monthByClass = new Map<number, { present: number; marked: number }>();
  for (const r of monthRows as any[]) {
    const c = monthByClass.get(r.classSectionId) ?? { present: 0, marked: 0 };
    c.marked += r._count._all;
    if (r.status === "PRESENT") c.present += r._count._all;
    monthByClass.set(r.classSectionId, c);
  }
  let mPresent = 0;
  let mMarked = 0;
  const classMonth = classes
    .map((c: any) => {
      const v = monthByClass.get(c.id);
      if (v) {
        mPresent += v.present;
        mMarked += v.marked;
      }
      return { classSectionId: c.id, classSection: label(c), percentage: v ? percentage(v.present, v.marked) : null };
    })
    .filter((c) => c.percentage !== null);
  const lowClasses = classMonth.filter((c) => (c.percentage ?? 100) < LOW_ATTENDANCE).sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));

  // ---- Exams: marks entered vs expected (active students x class subjects)
  const examClassIds = [...new Set((exams as any[]).map((e) => e.classSectionId))];
  const subjectCounts = examClassIds.length
    ? await prisma.subject.groupBy({ by: ["classSectionId"], where: { classSectionId: { in: examClassIds } }, _count: { _all: true } })
    : [];
  const subjectsByClass = new Map<number, number>((subjectCounts as any[]).map((s) => [s.classSectionId, s._count._all]));
  const studentsByClass = new Map<number, number>(classes.map((c: any) => [c.id, c._count.students]));
  const examProgress = (exams as any[]).map((e) => {
    const expected = (subjectsByClass.get(e.classSectionId) ?? 0) * (studentsByClass.get(e.classSectionId) ?? 0);
    return {
      examId: e.id,
      name: e.name,
      classSection: e.classSection ? label(e.classSection) : "—",
      isLocked: e.isLocked,
      entered: Math.min(e._count.results, expected || e._count.results),
      expected,
    };
  });

  // ---- Birthdays today (IST)
  const birthdays = (dobRows as any[])
    .filter((s) => {
      const d = new Date(s.dob);
      return d.getUTCMonth() + 1 === today.m && d.getUTCDate() === today.d;
    })
    .slice(0, 8)
    .map((s) => ({ id: s.id, name: s.name, classSection: s.classSection ? label(s.classSection) : null }));

  // ---- Setup gaps (things that silently break other features)
  const hasGlobalStructure = (structures as any[]).some((s) => s.classSectionId === null);
  const structured = new Set((structures as any[]).map((s) => s.classSectionId));
  const classesWithoutFeeStructure = hasGlobalStructure ? [] : classesWithStudents.filter((c: any) => !structured.has(c.id)).map(label);
  const classesWithoutTeacher = classesWithStudents.filter((c: any) => !c.classTeacherId).map(label);

  return {
    today: today.date.toISOString().slice(0, 10),
    currentSession: session ? { id: session.id, name: session.name } : null,
    attendanceToday: {
      classesTotal: classesWithStudents.length,
      classesMarked: classesWithStudents.length - notMarked.length,
      counts: todayTotals,
      marked: markedToday,
      presentPercentage: percentage(todayTotals.PRESENT, markedToday),
      notMarked,
    },
    attendanceMonth: {
      percentage: percentage(mPresent, mMarked),
      lowClasses: lowClasses.slice(0, 5),
      lowThreshold: LOW_ATTENDANCE,
    },
    exams: examProgress,
    admissions: {
      newThisMonth,
      recent: (recentStudents as any[]).map((s) => ({
        id: s.id,
        name: s.name,
        admissionNo: s.admissionNo,
        date: s.admissionDate ?? s.createdAt,
        classSection: s.classSection ? label(s.classSection) : null,
      })),
    },
    birthdays,
    attention: {
      noCurrentSession: !session,
      classesWithoutFeeStructure,
      classesWithoutTeacher,
      subjectsWithoutTeacher: (subjectsNoTeacher as any[]).map((s) => `${s.name} (${label(s.classSection)})`),
      lateFeeRuleMissing: Boolean(session) && lateRuleCount === 0,
      pendingRefunds,
    },
  };
};
