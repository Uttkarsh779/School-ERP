import { prisma } from "../../config/prisma";

export const listExamsForClassSection = (classSectionId?: number) =>
  prisma.exam.findMany({
    where: classSectionId ? { classSectionId } : undefined,
    include: { session: true, classSection: true, lockedByUser: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });

export const listExamsForClassSections = (classSectionIds: number[]) =>
  prisma.exam.findMany({
    where: { classSectionId: { in: classSectionIds } },
    include: { session: true, classSection: true, lockedByUser: { select: { id: true, name: true } } },
    orderBy: { id: "desc" },
  });

export const getExamById = (id: number) => prisma.exam.findUnique({ where: { id } });

// All results already entered for an exam (student x subject) — used to pre-fill
// the marks-entry grid on reopen, and as the admin/teacher "class-wise" results view.
export const getResultsForExam = (examId: number, subjectIds?: number[]) =>
  prisma.examResult.findMany({ where: { examId, ...(subjectIds ? { subjectId: { in: subjectIds } } : {}) } });

// Saves one mark and records the change in ExamResultAudit, in one transaction. An
// unchanged value is a no-op (no write, no audit row) so re-saving a grid doesn't flood
// the history.
export const saveExamResultWithAudit = (data: {
  examId: number;
  studentId: number;
  subjectId: number;
  marksObtained: number;
  maxMarks: number;
  isAbsent: boolean;
  enteredByUserId: number;
}) =>
  prisma.$transaction(async (tx: any) => {
    const key = { examId: data.examId, studentId: data.studentId, subjectId: data.subjectId };
    const existing = await tx.examResult.findUnique({ where: { examId_studentId_subjectId: key } });
    if (
      existing &&
      existing.marksObtained === data.marksObtained &&
      existing.maxMarks === data.maxMarks &&
      existing.isAbsent === data.isAbsent
    ) {
      return { changed: false };
    }

    await tx.examResult.upsert({
      where: { examId_studentId_subjectId: key },
      create: data,
      update: {
        marksObtained: data.marksObtained,
        maxMarks: data.maxMarks,
        isAbsent: data.isAbsent,
        enteredByUserId: data.enteredByUserId,
      },
    });
    await tx.examResultAudit.create({
      data: {
        ...key,
        action: existing ? "UPDATE" : "CREATE",
        oldMarks: existing?.marksObtained ?? null,
        oldMaxMarks: existing?.maxMarks ?? null,
        oldIsAbsent: existing?.isAbsent ?? null,
        newMarks: data.marksObtained,
        newMaxMarks: data.maxMarks,
        newIsAbsent: data.isAbsent,
        changedByUserId: data.enteredByUserId,
      },
    });
    return { changed: true };
  });

export const setExamLock = (examId: number, locked: boolean, userId: number) =>
  prisma.exam.update({
    where: { id: examId },
    data: locked
      ? { isLocked: true, lockedAt: new Date(), lockedByUserId: userId }
      : { isLocked: false, lockedAt: null, lockedByUserId: null },
    include: { session: true, classSection: true, lockedByUser: { select: { id: true, name: true } } },
  });

export const listExamResultAudit = async (examId: number, subjectIds?: number[]) => {
  const rows = await prisma.examResultAudit.findMany({
    where: { examId, ...(subjectIds ? { subjectId: { in: subjectIds } } : {}) },
    orderBy: { changedAt: "desc" },
    take: 500,
    include: { changedByUser: { select: { id: true, name: true } } },
  });
  // ExamResultAudit stores plain ids (history must survive roster changes) — attach names.
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: [...new Set(rows.map((r: any) => r.studentId))] as number[] } }, select: { id: true, name: true, rollNo: true } }),
    prisma.subject.findMany({ where: { id: { in: [...new Set(rows.map((r: any) => r.subjectId))] as number[] } }, select: { id: true, name: true } }),
  ]);
  const studentById = new Map(students.map((s: any) => [s.id, s]));
  const subjectById = new Map(subjects.map((s: any) => [s.id, s]));
  return rows.map((r: any) => ({
    ...r,
    studentName: (studentById.get(r.studentId) as any)?.name ?? `Student #${r.studentId}`,
    rollNo: (studentById.get(r.studentId) as any)?.rollNo ?? null,
    subjectName: (subjectById.get(r.subjectId) as any)?.name ?? `Subject #${r.subjectId}`,
  }));
};

export const createExam = (data: { sessionId: number; name: string; classSectionId: number; passPercentage?: number }) =>
  prisma.exam.create({ data, include: { session: true } });

export const upsertExamResult = (data: {
  examId: number;
  studentId: number;
  subjectId: number;
  marksObtained: number;
  maxMarks: number;
  isAbsent?: boolean;
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
      isAbsent: data.isAbsent ?? false,
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
    isAbsent: r.isAbsent,
    passed: !r.isAbsent && r.maxMarks > 0 && (r.marksObtained / r.maxMarks) * 100 >= exam.passPercentage,
  }));
  const total = subjects.reduce((sum: number, s: any) => sum + s.marksObtained, 0);
  const maxTotal = subjects.reduce((sum: number, s: any) => sum + s.maxMarks, 0);
  const percentage = maxTotal === 0 ? 0 : Math.round((total / maxTotal) * 1000) / 10;

  return {
    examId: exam.id,
    examName: exam.name,
    passPercentage: exam.passPercentage,
    studentId,
    subjects,
    total,
    maxTotal,
    percentage,
  };
};
