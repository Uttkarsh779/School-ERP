import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Detailed monthly attendance reporting (admin): a class-wise overview for a month, and a
// per-class register with every student's day-by-day status.
//
// Definitions, shared by both reports:
// - A "working day" for a class is a date on which attendance was marked for at least one
//   student of that class. Days nobody marked (holidays, Sundays, not-yet-marked) aren't
//   counted against anyone.
// - Attendance % = PRESENT / days marked for that student — the same formula the existing
//   defaulters report uses, so the two never disagree.

type StatusCounts = { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number };

const emptyCounts = (): StatusCounts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 });

export const percentage = (present: number, marked: number) =>
  marked === 0 ? null : Math.round((present / marked) * 1000) / 10;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// Parses ?year=&month= into the month's first/last day (UTC midnight, matching the
// @db.Date column). Pure — unit tested.
export const parseMonth = (query: Record<string, unknown>) => {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw httpError(400, "year must be a valid year");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw httpError(400, "month must be between 1 and 12");
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { year, month, from, to, daysInMonth: to.getUTCDate() };
};

// Class-wise overview for one month. Defaults to the current academic session's classes.
export const getMonthlyClassOverview = async (query: Record<string, unknown>) => {
  const { year, month, from, to } = parseMonth(query);

  let sessionId: number | undefined;
  if (typeof query.sessionId === "string" && query.sessionId !== "") {
    sessionId = Number(query.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) throw httpError(400, "sessionId must be a number");
  } else {
    const current = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
    sessionId = current?.id;
  }

  const classSections = await prisma.classSection.findMany({
    where: sessionId ? { sessionId } : undefined,
    include: {
      session: { select: { id: true, name: true } },
      _count: { select: { students: { where: { isActive: true } } } },
    },
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  const ids = classSections.map((c: any) => c.id);

  const dateWhere = { date: { gte: from, lte: to } };
  const [byStatus, byDay] = ids.length
    ? await Promise.all([
        prisma.attendance.groupBy({
          by: ["classSectionId", "status"],
          where: { classSectionId: { in: ids }, ...dateWhere },
          _count: { _all: true },
        }),
        prisma.attendance.groupBy({
          by: ["classSectionId", "date"],
          where: { classSectionId: { in: ids }, ...dateWhere },
        }),
      ])
    : [[], []];

  const countsById = new Map<number, StatusCounts>();
  for (const row of byStatus as Array<{ classSectionId: number; status: keyof StatusCounts; _count: { _all: number } }>) {
    const counts = countsById.get(row.classSectionId) ?? emptyCounts();
    counts[row.status] += row._count._all;
    countsById.set(row.classSectionId, counts);
  }
  const daysById = new Map<number, number>();
  for (const row of byDay as Array<{ classSectionId: number }>) {
    daysById.set(row.classSectionId, (daysById.get(row.classSectionId) ?? 0) + 1);
  }

  const classes = classSections
    .map((c: any) => {
      const counts = countsById.get(c.id) ?? emptyCounts();
      const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.LEAVE;
      return {
        classSectionId: c.id,
        className: c.className,
        section: c.section,
        sessionName: c.session?.name ?? null,
        studentCount: c._count.students,
        workingDays: daysById.get(c.id) ?? 0,
        counts,
        marked,
        percentage: percentage(counts.PRESENT, marked),
      };
    })
    .sort(
      (a: any, b: any) =>
        a.className.localeCompare(b.className, undefined, { numeric: true }) || a.section.localeCompare(b.section)
    );

  const totals = classes.reduce(
    (acc: StatusCounts, c: any) => {
      (Object.keys(acc) as (keyof StatusCounts)[]).forEach((k) => (acc[k] += c.counts[k]));
      return acc;
    },
    emptyCounts()
  );
  const totalMarked = totals.PRESENT + totals.ABSENT + totals.LATE + totals.LEAVE;

  return {
    year,
    month,
    sessionId: sessionId ?? null,
    summary: {
      classCount: classes.length,
      classesWithData: classes.filter((c: any) => c.marked > 0).length,
      studentCount: classes.reduce((sum: number, c: any) => sum + c.studentCount, 0),
      counts: totals,
      percentage: percentage(totals.PRESENT, totalMarked),
    },
    classes,
  };
};

// Per-class register for one month: every student (active roster + anyone with a record
// in this class that month, e.g. since transferred/deactivated) with their daily status.
export const getMonthlyClassRegister = async (classSectionId: number, query: Record<string, unknown>) => {
  if (!Number.isInteger(classSectionId) || classSectionId <= 0) throw httpError(400, "Invalid class section id");
  const { year, month, from, to, daysInMonth } = parseMonth(query);

  const classSection = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: {
      session: { select: { id: true, name: true } },
      classTeacher: { select: { user: { select: { name: true } } } },
    },
  });
  if (!classSection) throw httpError(404, "Class section not found");

  const [records, roster] = await Promise.all([
    prisma.attendance.findMany({
      where: { classSectionId, date: { gte: from, lte: to } },
      select: {
        studentId: true,
        date: true,
        status: true,
        student: { select: { id: true, name: true, rollNo: true, admissionNo: true, isActive: true } },
      },
    }),
    prisma.student.findMany({
      where: { classSectionId, isActive: true },
      select: { id: true, name: true, rollNo: true, admissionNo: true, isActive: true },
    }),
  ]);

  const students = new Map<
    number,
    {
      studentId: number;
      name: string;
      rollNo: string;
      admissionNo: string;
      isActive: boolean;
      counts: StatusCounts;
      days: Record<string, string>;
    }
  >();
  const addStudent = (s: { id: number; name: string; rollNo: string; admissionNo: string; isActive: boolean }) => {
    if (!students.has(s.id)) {
      students.set(s.id, {
        studentId: s.id,
        name: s.name,
        rollNo: s.rollNo,
        admissionNo: s.admissionNo,
        isActive: s.isActive,
        counts: emptyCounts(),
        days: {},
      });
    }
    return students.get(s.id)!;
  };

  roster.forEach(addStudent);
  const workingDays = new Set<string>();
  for (const r of records as Array<{ date: Date; status: keyof StatusCounts; student: any }>) {
    const entry = addStudent(r.student);
    const key = dayKey(r.date);
    entry.days[key] = r.status;
    entry.counts[r.status] += 1;
    workingDays.add(key);
  }

  const dayTotals: Record<string, StatusCounts> = {};
  for (const key of workingDays) dayTotals[key] = emptyCounts();

  const rows = [...students.values()]
    .map((s) => {
      for (const [key, status] of Object.entries(s.days)) dayTotals[key][status as keyof StatusCounts] += 1;
      const marked = s.counts.PRESENT + s.counts.ABSENT + s.counts.LATE + s.counts.LEAVE;
      return {
        ...s,
        marked,
        notMarked: workingDays.size - marked,
        percentage: percentage(s.counts.PRESENT, marked),
      };
    })
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  const totals = rows.reduce((acc, r) => {
    (Object.keys(acc) as (keyof StatusCounts)[]).forEach((k) => (acc[k] += r.counts[k]));
    return acc;
  }, emptyCounts());
  const totalMarked = totals.PRESENT + totals.ABSENT + totals.LATE + totals.LEAVE;

  return {
    year,
    month,
    daysInMonth,
    classSection: {
      id: classSection.id,
      className: classSection.className,
      section: classSection.section,
      sessionName: classSection.session?.name ?? null,
      classTeacherName: classSection.classTeacher?.user?.name ?? null,
    },
    workingDays: [...workingDays].sort(),
    dayTotals,
    summary: {
      studentCount: rows.length,
      counts: totals,
      percentage: percentage(totals.PRESENT, totalMarked),
    },
    students: rows,
  };
};
