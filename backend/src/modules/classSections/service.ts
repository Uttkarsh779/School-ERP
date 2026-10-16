import { prisma } from "../../config/prisma";

export const listClassSections = (sessionId?: number) =>
  prisma.classSection.findMany({
    where: sessionId ? { sessionId } : undefined,
    include: { classTeacher: { include: { user: true } }, _count: { select: { students: true } } },
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });

export const createClassSection = (data: {
  sessionId: number;
  className: string;
  section: string;
  classTeacherId?: number;
}) => prisma.classSection.create({ data });

export const updateClassSection = (
  id: number,
  data: { className?: string; section?: string; classTeacherId?: number | null }
) => prisma.classSection.update({ where: { id }, data });

export const getClassSectionById = (id: number) => prisma.classSection.findUnique({ where: { id } });

// A teacher's own class section(s) — either classes they're the class teacher of
// (used for attendance/dashboard) OR classes where they're assigned to teach a
// subject (used for exams — a subject teacher isn't necessarily the class teacher).
export const listClassSectionsForTeacher = (staffId: number) =>
  prisma.classSection.findMany({
    where: {
      OR: [
        { classTeacherId: staffId },
        { subjects: { some: { teacherSubjects: { some: { staffId } } } } },
        { timetableSlots: { some: { staffId } } },
      ],
    },
    include: { _count: { select: { students: true } } },
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });

export const isClassTeacherOfSection = async (staffId: number, classSectionId: number): Promise<boolean> => {
  const classSection = await getClassSectionById(classSectionId);
  return classSection?.classTeacherId === staffId;
};

export const isTeacherLinkedToClassSection = async (staffId: number, classSectionId: number): Promise<boolean> => {
  if (await isClassTeacherOfSection(staffId, classSectionId)) return true;
  const subjectLink = await prisma.subject.findFirst({
    where: { classSectionId, teacherSubjects: { some: { staffId } } },
  });
  if (subjectLink !== null) return true;

  const slotLink = await prisma.timetableSlot.findFirst({
    where: { classSectionId, staffId },
  });
  return slotLink !== null;
};

export const deleteClassSection = async (id: number) => {
  const studentCount = await prisma.student.count({ where: { classSectionId: id } });
  if (studentCount > 0) {
    throw new Error(`Cannot delete: ${studentCount} student(s) are currently enrolled in this class section.`);
  }

  const subjectCount = await prisma.subject.count({ where: { classSectionId: id } });
  if (subjectCount > 0) {
    throw new Error(`Cannot delete: ${subjectCount} subject(s) are configured for this class section.`);
  }

  const feeStructureCount = await prisma.feeStructure.count({ where: { classSectionId: id } });
  if (feeStructureCount > 0) {
    throw new Error(`Cannot delete: ${feeStructureCount} fee structure(s) are associated with this class section.`);
  }

  const timetableCount = await prisma.timetableSlot.count({ where: { classSectionId: id } });
  if (timetableCount > 0) {
    throw new Error(`Cannot delete: ${timetableCount} timetable slot(s) are scheduled for this class section.`);
  }

  return prisma.classSection.delete({ where: { id } });
};
