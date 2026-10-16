import { prisma } from "../../config/prisma";

export const listExamsForClassSection = (classSectionId?: number) =>
  prisma.exam.findMany({
    where: classSectionId ? { classSectionId } : undefined,
    include: { session: true, classSection: true },
    orderBy: { id: "desc" },
  });

export const getExamById = (id: number) => prisma.exam.findUnique({ where: { id } });

// All results already entered for an exam (student x subject) — used to pre-fill
// the marks-entry grid on reopen, and as the admin/teacher "class-wise" results view.
export const getResultsForExam = (examId: number) =>
  prisma.examResult.findMany({ where: { examId } });

export const createExam = (data: { sessionId: number; name: string; classSectionId: number }) =>
  prisma.exam.create({ data, include: { session: true } });

export const upsertExamResult = (data: {
  examId: number;
  studentId: number;
  subjectId: number;
  marksObtained: number;
  maxMarks: number;
  enteredByUserId: number;
}) =>
  prisma.examResult.upsert({
    where: {
      examId_studentId_subjectId: {
        examId: data.examId,
        studentId: data.studentId,
        subjectId: data.subjectId,
      },
    },
    create: data,
    update: {
      marksObtained: data.marksObtained,
      maxMarks: data.maxMarks,
      enteredByUserId: data.enteredByUserId,
    },
  });

// A single student's full result set for one exam — every ExamResult row for
// examId+studentId, with subject names, rolled up into a report-card shape
// (total/maxTotal/percentage) so the frontend doesn't have to.
export const getReportCardData = async (examId: number, studentId: number) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return null;

  const results = await prisma.examResult.findMany({
    where: { examId, studentId },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });

  const subjects = results.map((r: any) => ({
    subjectId: r.subjectId,
    subjectName: r.subject.name,
    marksObtained: r.marksObtained,
    maxMarks: r.maxMarks,
  }));
  const total = subjects.reduce((sum: number, s: any) => sum + s.marksObtained, 0);
  const maxTotal = subjects.reduce((sum: number, s: any) => sum + s.maxMarks, 0);
  const percentage = maxTotal === 0 ? 0 : Math.round((total / maxTotal) * 1000) / 10;

  return {
    examId: exam.id,
    examName: exam.name,
    studentId,
    subjects,
    total,
    maxTotal,
    percentage,
  };
};
