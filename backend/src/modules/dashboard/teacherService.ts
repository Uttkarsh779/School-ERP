import { prisma } from "../../config/prisma";
import { findStaffByUserId } from "../staff/service";
import { listClassSectionsForTeacher } from "../classSections/service";
import { listTimetableForStaff } from "../timetable/service";
import { percentage } from "../attendance/reportService";

// Everything the teacher dashboard shows, scoped to the logged-in teacher:
// - classes they teach (class teacher OR subject/timetable teacher — same rule as /class-sections/mine)
// - today's attendance status + this month's % for classes they're CLASS teacher of
//   (only class teachers can mark attendance, see attendance/controller.ts)
// - today's timetable periods
// - recent exams with marks-entry progress for the subjects THIS teacher can enter
// - homework they've set that's still open
// - students below the attendance threshold this month in their class-teacher classes

const LOW_ATTENDANCE_THRESHOLD = 75; // matches the admin Defaulters / monthly report default

// IST calendar date parts — "today" for a school in India regardless of server timezone.
const istToday = (now = new Date()) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d)); // UTC midnight, matches @db.Date columns
  const isoDay = date.getUTCDay(); // 0 Sun … 6 Sat
  return {
    date,
    monthStart: new Date(Date.UTC(y, m - 1, 1)),
    dayOfWeek: isoDay === 0 ? 7 : isoDay, // timetable uses 1 (Mon) … 6 (Sat)
  };
};

export const getTeacherDashboard = async (userId: number) => {
  const staff = await findStaffByUserId(userId);
  if (!staff) {
    return { hasStaffProfile: false as const };
  }

  const today = istToday();
  const classes = await listClassSectionsForTeacher(staff.id);
  const classIds = classes.map((c: any) => c.id);
  const classTeacherIds = classes.filter((c: any) => c.classTeacherId === staff.id).map((c: any) => c.id);

  const [activeCounts, todayMarks, monthStatus, slots, teacherSubjects, exams, openHomework] = await Promise.all([
    classIds.length
      ? prisma.student.groupBy({ by: ["classSectionId"], where: { classSectionId: { in: classIds }, isActive: true }, _count: { _all: true } })
      : [],
    classTeacherIds.length
      ? prisma.attendance.groupBy({ by: ["classSectionId"], where: { classSectionId: { in: classTeacherIds }, date: today.date }, _count: { _all: true } })
      : [],
    classTeacherIds.length
      ? prisma.attendance.groupBy({
          by: ["classSectionId", "studentId", "status"],
          where: { classSectionId: { in: classTeacherIds }, date: { gte: today.monthStart, lte: today.date } },
          _count: { _all: true },
        })
      : [],
    listTimetableForStaff(staff.id),
    prisma.teacherSubject.findMany({ where: { staffId: staff.id }, select: { subjectId: true } }),
    classIds.length
      ? prisma.exam.findMany({
          where: { classSectionId: { in: classIds } },
          orderBy: { id: "desc" },
          take: 6,
          include: { session: { select: { name: true } }, classSection: { select: { id: true, className: true, section: true } } },
        })
      : [],
    prisma.assignment.findMany({
      where: { assignedById: staff.id, endDate: { gte: today.date } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        subject: { select: { name: true } },
        classSection: { select: { className: true, section: true } },
      },
    }),
  ]);

  const studentsByClass = new Map<number, number>((activeCounts as any[]).map((r) => [r.classSectionId, r._count._all]));
  const markedTodayByClass = new Map<number, number>((todayMarks as any[]).map((r) => [r.classSectionId, r._count._all]));

  // Month attendance per class, and per student (for the "needs attention" list).
  const classMonth = new Map<number, { present: number; marked: number }>();
  const studentMonth = new Map<number, { classSectionId: number; present: number; marked: number }>();
  for (const row of monthStatus as any[]) {
    const n = row._count._all;
    const c = classMonth.get(row.classSectionId) ?? { present: 0, marked: 0 };
    const s = studentMonth.get(row.studentId) ?? { classSectionId: row.classSectionId, present: 0, marked: 0 };
    c.marked += n;
    s.marked += n;
    if (row.status === "PRESENT") {
      c.present += n;
      s.present += n;
    }
    classMonth.set(row.classSectionId, c);
    studentMonth.set(row.studentId, s);
  }

  const classRows = classes.map((c: any) => {
    const isClassTeacher = c.classTeacherId === staff.id;
    const month = classMonth.get(c.id);
    const studentCount = studentsByClass.get(c.id) ?? 0;
    return {
      classSectionId: c.id,
      className: c.className,
      section: c.section,
      isClassTeacher,
      studentCount,
      // Attendance fields only apply where this teacher is the class teacher.
      attendanceMarkedToday: isClassTeacher ? (markedTodayByClass.get(c.id) ?? 0) > 0 : null,
      markedTodayCount: isClassTeacher ? markedTodayByClass.get(c.id) ?? 0 : null,
      monthAttendancePercentage: isClassTeacher && month ? percentage(month.present, month.marked) : null,
    };
  });

  // Students below threshold this month (class-teacher classes only).
  const lowIds = [...studentMonth.entries()]
    .map(([studentId, s]) => ({ studentId, ...s, pct: percentage(s.present, s.marked) }))
    .filter((s) => s.pct !== null && s.pct < LOW_ATTENDANCE_THRESHOLD)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
    .slice(0, 6);
  const lowStudents = lowIds.length
    ? await prisma.student.findMany({
        where: { id: { in: lowIds.map((s) => s.studentId) }, isActive: true },
        select: { id: true, name: true, rollNo: true },
      })
    : [];
  const lowById = new Map(lowStudents.map((s: any) => [s.id, s]));
  const classLabel = new Map(classes.map((c: any) => [c.id, `${c.className} - ${c.section}`]));

  // Marks-entry progress: expected = active students × subjects this teacher may enter
  // (every subject tested in the class when they're class teacher, otherwise their own).
  const mySubjectIds = new Set((teacherSubjects as any[]).map((t) => t.subjectId));
  const examIds = (exams as any[]).map((e) => e.id);
  const [resultRows, classSubjects] = examIds.length
    ? await Promise.all([
        prisma.examResult.groupBy({ by: ["examId", "subjectId"], where: { examId: { in: examIds } }, _count: { _all: true } }),
        prisma.subject.findMany({ where: { classSectionId: { in: classIds } }, select: { id: true, classSectionId: true } }),
      ])
    : [[], []];

  const examRows = (exams as any[]).map((exam) => {
    const isClassTeacher = exam.classSectionId && classTeacherIds.includes(exam.classSectionId);
    const subjectIds = (classSubjects as any[])
      .filter((s) => s.classSectionId === exam.classSectionId && (isClassTeacher || mySubjectIds.has(s.id)))
      .map((s) => s.id);
    const students = studentsByClass.get(exam.classSectionId) ?? 0;
    const expected = subjectIds.length * students;
    const entered = (resultRows as any[])
      .filter((r) => r.examId === exam.id && subjectIds.includes(r.subjectId))
      .reduce((sum, r) => sum + r._count._all, 0);
    return {
      examId: exam.id,
      name: exam.name,
      sessionName: exam.session?.name ?? null,
      classSectionId: exam.classSectionId,
      className: exam.classSection ? `${exam.classSection.className} - ${exam.classSection.section}` : null,
      expected,
      entered: Math.min(entered, expected),
    };
  });

  const todaySlots = (slots as any[])
    .filter((s) => s.dayOfWeek === today.dayOfWeek)
    .sort((a, b) => a.periodNumber - b.periodNumber)
    .map((s) => ({
      id: s.id,
      periodNumber: s.periodNumber,
      subjectName: s.subject?.name ?? null,
      className: s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : null,
      room: s.room ?? null,
    }));

  return {
    hasStaffProfile: true as const,
    today: today.date.toISOString().slice(0, 10),
    lowAttendanceThreshold: LOW_ATTENDANCE_THRESHOLD,
    summary: {
      classCount: classRows.length,
      classTeacherCount: classTeacherIds.length,
      studentCount: classRows.reduce((sum: number, c: any) => sum + c.studentCount, 0),
      attendanceMarkedToday: classRows.filter((c: any) => c.attendanceMarkedToday).length,
      periodsToday: todaySlots.length,
      openHomework: (openHomework as any[]).length,
    },
    classes: classRows,
    todaySchedule: todaySlots,
    exams: examRows,
    homework: (openHomework as any[]).map((a) => ({
      id: a.id,
      title: a.title,
      subjectName: a.subject?.name ?? null,
      className: a.classSection ? `${a.classSection.className} - ${a.classSection.section}` : null,
      dueDate: a.dueDate,
    })),
    lowAttendance: lowIds
      .filter((s) => lowById.has(s.studentId))
      .map((s) => ({
        studentId: s.studentId,
        name: (lowById.get(s.studentId) as any).name,
        rollNo: (lowById.get(s.studentId) as any).rollNo,
        className: classLabel.get(s.classSectionId) ?? null,
        classSectionId: s.classSectionId,
        percentage: s.pct,
        present: s.present,
        marked: s.marked,
      })),
  };
};
