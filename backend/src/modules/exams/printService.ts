import { prisma } from "../../config/prisma";
import { getExamAnalysis } from "./analysisService";

// Everything a printed report card needs, for one student or the whole class: student
// details, marks per subject, result, the class teacher's remark, co-scholastic
// grades and attendance for the session. Rank only appears once results are final.
export const getPrintableReportCards = async (examId: number, studentId?: number) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      session: { select: { id: true, name: true } },
      classSection: { select: { id: true, className: true, section: true, classTeacher: { select: { user: { select: { name: true } } } } } },
    },
  });
  if (!exam) return null;

  const analysis = await getExamAnalysis(examId);
  if (!analysis) return null;

  const rows = studentId ? analysis.students.filter((s) => s.studentId === studentId) : analysis.students.filter((s) => s.status !== "NOT_ENTERED");
  const ids = rows.map((r) => r.studentId);

  const [students, enrollments, remarks, attendance] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, admissionNo: true, rollNo: true, dob: true, gender: true, fatherName: true, motherName: true, photoUrl: true },
    }),
    // Roll number in the exam's session (it can change after promotion).
    prisma.studentEnrollment.findMany({ where: { studentId: { in: ids }, sessionId: exam.sessionId }, select: { studentId: true, rollNo: true } }),
    prisma.examStudentRemark.findMany({
      where: { examId, studentId: { in: ids } },
      select: { studentId: true, remark: true, workEducation: true, artEducation: true, healthPhysical: true, discipline: true },
    }),
    // Class sections belong to one session, so this is the session's attendance.
    prisma.attendance.groupBy({
      by: ["studentId", "status"],
      where: { studentId: { in: ids }, classSectionId: exam.classSectionId },
      _count: { _all: true },
    }),
  ]);

  const studentById = new Map(students.map((s: any) => [s.id, s]));
  const rollBySession = new Map(enrollments.filter((e: any) => e.rollNo).map((e: any) => [e.studentId, e.rollNo]));
  const remarkById = new Map(remarks.map((r: any) => [r.studentId, r]));
  const attendanceById = new Map<number, { present: number; workingDays: number }>();
  for (const a of attendance as any[]) {
    const row = attendanceById.get(a.studentId) ?? { present: 0, workingDays: 0 };
    row.workingDays += a._count._all;
    if (a.status === "PRESENT" || a.status === "LATE") row.present += a._count._all;
    attendanceById.set(a.studentId, row);
  }

  const isFinal = exam.resultsPublished || exam.isLocked;
  const subjectName = new Map(analysis.subjects.map((s) => [s.id, s.name]));

  const cards = rows
    .map((r) => {
      const s: any = studentById.get(r.studentId);
      const remark: any = remarkById.get(r.studentId);
      return {
        student: {
          id: r.studentId,
          name: s?.name ?? r.name,
          admissionNo: s?.admissionNo ?? r.admissionNo,
          rollNo: rollBySession.get(r.studentId) ?? s?.rollNo ?? r.rollNo,
          dob: s?.dob ?? null,
          gender: s?.gender ?? null,
          fatherName: s?.fatherName ?? null,
          motherName: s?.motherName ?? null,
          photoUrl: s?.photoUrl ?? null,
        },
        subjects: r.marks.map((m: any) => ({
          subjectName: subjectName.get(m.subjectId) ?? "—",
          entered: m.entered,
          isAbsent: m.isAbsent ?? false,
          marksObtained: m.marksObtained ?? null,
          maxMarks: m.maxMarks ?? null,
          percentage: m.percentage ?? null,
          passed: m.passed ?? null,
        })),
        total: r.total,
        maxTotal: r.maxTotal,
        percentage: r.percentage,
        status: r.status,
        failedSubjects: r.failedSubjects,
        rank: null, // no rank on report cards (school policy); it stays in the staff analysis
        remark: remark?.remark ?? null,
        coScholastic: {
          workEducation: remark?.workEducation ?? null,
          artEducation: remark?.artEducation ?? null,
          healthPhysical: remark?.healthPhysical ?? null,
          discipline: remark?.discipline ?? null,
        },
        attendance: attendanceById.get(r.studentId) ?? null,
      };
    })
    .sort((a, b) => String(a.student.rollNo).localeCompare(String(b.student.rollNo), undefined, { numeric: true }));

  return {
    exam: { id: exam.id, name: exam.name, passPercentage: exam.passPercentage, isFinal, resultsPublished: exam.resultsPublished },
    sessionName: exam.session?.name ?? null,
    classSection: { className: exam.classSection.className, section: exam.classSection.section },
    classTeacher: exam.classSection.classTeacher?.user?.name ?? null,
    rankedCount: null,
    classAverage: analysis.summary.averagePercentage,
    cards,
  };
};
