import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { findStaffByUserId } from "../staff/service";
import { listAllocatedSubjectIds } from "../subjects/service";
import { getStudentHistory } from "../students/historyService";
import { getExamAnalysis } from "../exams/analysisService";
import { percentage } from "../attendance/reportService";

// "My Students" for teachers.
// - Class teacher of a class: full view of its students (contacts, attendance, all marks).
// - Subject teacher: roster of the classes they teach, with marks for their own subjects only.
// Teachers never see fees or government ID numbers (office-only data).

export type TeacherAccess = { staffId: number; mode: "CLASS_TEACHER" | "SUBJECT"; subjectIds: number[] };

export const resolveTeacherAccess = async (userId: number, classSectionId: number): Promise<TeacherAccess | null> => {
  const staff = await findStaffByUserId(userId);
  if (!staff) return null;
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { classTeacherId: true } });
  if (!cs) return null;
  if (cs.classTeacherId === staff.id) return { staffId: staff.id, mode: "CLASS_TEACHER", subjectIds: [] };
  const subjectIds = await listAllocatedSubjectIds(staff.id, classSectionId);
  const onTimetable = await prisma.timetableSlot.findFirst({ where: { classSectionId, staffId: staff.id }, select: { id: true } });
  if (subjectIds.length === 0 && !onTimetable) return null;
  return { staffId: staff.id, mode: "SUBJECT", subjectIds };
};

const istMonthStart = () => {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

export const getClassRoster = async (userId: number, classSectionId: number) => {
  const access = await resolveTeacherAccess(userId, classSectionId);
  if (!access) throw httpError(403, "You don't teach this class");

  const [classSection, students] = await Promise.all([
    prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: { id: true, className: true, section: true, classTeacher: { select: { user: { select: { name: true } } } } },
    }),
    prisma.student.findMany({
      where: { classSectionId, isActive: true },
      orderBy: { rollNo: "asc" },
      select: {
        id: true, name: true, rollNo: true, admissionNo: true, gender: true, photoUrl: true,
        fatherName: true, fatherContact: true, motherContact: true, contactNumber: true,
      },
    }),
  ]);
  const ids = students.map((s: any) => s.id);

  const [monthRows, overallRows, latestExam] = await Promise.all([
    ids.length
      ? prisma.attendance.groupBy({ by: ["studentId", "status"], where: { studentId: { in: ids }, date: { gte: istMonthStart() } }, _count: { _all: true } })
      : [],
    ids.length ? prisma.attendance.groupBy({ by: ["studentId", "status"], where: { studentId: { in: ids } }, _count: { _all: true } }) : [],
    prisma.exam.findFirst({ where: { classSectionId, results: { some: {} } }, orderBy: { id: "desc" }, select: { id: true, name: true } }),
  ]);

  const tally = (rows: any[]) => {
    const m = new Map<number, { present: number; marked: number }>();
    for (const r of rows) {
      const v = m.get(r.studentId) ?? { present: 0, marked: 0 };
      v.marked += r._count._all;
      if (r.status === "PRESENT") v.present += r._count._all;
      m.set(r.studentId, v);
    }
    return m;
  };
  const month = tally(monthRows as any[]);
  const overall = tally(overallRows as any[]);

  // Latest exam result per student — subject teachers see only their own subjects' score.
  let examByStudent = new Map<number, { percentage: number | null; status: string; rank: number | null }>();
  if (latestExam) {
    const scope = access.mode === "SUBJECT" ? access.subjectIds : undefined;
    const analysis = scope && scope.length === 0 ? null : await getExamAnalysis(latestExam.id, scope);
    if (analysis) {
      examByStudent = new Map(
        analysis.students.map((s) => [s.studentId, { percentage: s.percentage, status: s.status, rank: access.mode === "CLASS_TEACHER" ? s.rank : null }])
      );
    }
  }

  return {
    classSection: classSection
      ? { id: classSection.id, label: `${classSection.className} - ${classSection.section}`, classTeacher: classSection.classTeacher?.user?.name ?? null }
      : null,
    access: access.mode,
    latestExam: latestExam ? { id: latestExam.id, name: latestExam.name } : null,
    students: students.map((s: any) => {
      const mo = month.get(s.id);
      const ov = overall.get(s.id);
      return {
        id: s.id,
        name: s.name,
        rollNo: s.rollNo,
        admissionNo: s.admissionNo,
        gender: s.gender,
        photoUrl: s.photoUrl,
        fatherName: s.fatherName,
        contact: s.contactNumber || s.fatherContact || s.motherContact || null,
        attendanceMonth: mo ? percentage(mo.present, mo.marked) : null,
        attendanceOverall: ov ? percentage(ov.present, ov.marked) : null,
        latestExam: examByStudent.get(s.id) ?? null,
      };
    }),
  };
};

export const getStudentOverviewForTeacher = async (userId: number, studentId: number) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      classSection: { select: { id: true, className: true, section: true } },
      parents: { include: { parent: { select: { name: true, contact: true, email: true } } } },
    },
  });
  if (!student) throw httpError(404, "Student not found");
  const access = await resolveTeacherAccess(userId, student.classSectionId);
  if (!access) throw httpError(403, "You don't teach this student's class");

  const history = await getStudentHistory(studentId);
  const isClassTeacher = access.mode === "CLASS_TEACHER";

  // Subject teachers: only exams' marks for their own subjects, no ranks/totals across subjects.
  const exams = (history?.exams ?? []).map((e: any) =>
    isClassTeacher
      ? e
      : {
          examId: e.examId,
          examName: e.examName,
          sessionName: e.sessionName,
          className: e.className,
          isLocked: e.isLocked,
          passPercentage: e.passPercentage,
          subjects: e.subjects.filter((s: any) => access.subjectIds.includes(s.subjectId)),
        }
  );

  return {
    access: access.mode,
    profile: {
      id: student.id,
      name: student.name,
      rollNo: student.rollNo,
      admissionNo: student.admissionNo,
      classSection: `${student.classSection.className} - ${student.classSection.section}`,
      photoUrl: student.photoUrl,
      gender: student.gender,
      dob: student.dob,
      bloodGroup: student.bloodGroup,
      // Contact details help a class teacher reach the family; subject teachers get the basics.
      fatherName: student.fatherName,
      motherName: student.motherName,
      fatherContact: isClassTeacher ? student.fatherContact : null,
      motherContact: isClassTeacher ? student.motherContact : null,
      contactNumber: isClassTeacher ? student.contactNumber : null,
      address: isClassTeacher ? student.address : null,
      guardians: isClassTeacher
        ? student.parents.map((p: any) => ({ name: p.parent?.name, relationship: p.relationshipType, contact: p.parent?.contact, email: p.parent?.email }))
        : [],
    },
    attendance: history?.attendance ?? null,
    exams: exams.filter((e: any) => isClassTeacher || e.subjects.length > 0),
  };
};
