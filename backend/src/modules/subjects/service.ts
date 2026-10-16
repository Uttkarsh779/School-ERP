import { prisma } from "../../config/prisma";

const withTeacher = {
  include: { teacherSubjects: { include: { staff: { include: { user: true } } } } },
} as const;

export const listSubjects = (classSectionId: number) =>
  prisma.subject.findMany({ where: { classSectionId }, orderBy: { name: "asc" }, ...withTeacher });

export const listSubjectsForTeacher = (classSectionId: number, staffId: number) =>
  prisma.subject.findMany({
    where: {
      classSectionId,
      OR: [
        { teacherSubjects: { some: { staffId } } },
        { timetableSlots: { some: { staffId } } },
      ],
    },
    orderBy: { name: "asc" },
    ...withTeacher,
  });

export const createSubject = (classSectionId: number, name: string) =>
  prisma.subject.create({ data: { classSectionId, name }, ...withTeacher });

// One teacher per subject is enough for a school this size — assigning a new
// teacher replaces any existing assignment rather than piling up rows in the
// (technically many-to-many) TeacherSubject join table.
export const assignTeacherToSubject = async (subjectId: number, staffId: number) => {
  await prisma.teacherSubject.deleteMany({ where: { subjectId } });
  await prisma.teacherSubject.create({ data: { subjectId, staffId } });
  return prisma.subject.findUniqueOrThrow({ where: { id: subjectId }, ...withTeacher });
};

export const unassignTeacherFromSubject = async (subjectId: number) => {
  await prisma.teacherSubject.deleteMany({ where: { subjectId } });
  return prisma.subject.findUniqueOrThrow({ where: { id: subjectId }, ...withTeacher });
};

export const isTeacherAssignedToSubject = async (staffId: number, subjectId: number): Promise<boolean> => {
  const link = await prisma.teacherSubject.findFirst({ where: { staffId, subjectId } });
  if (link !== null) return true;

  const slot = await prisma.timetableSlot.findFirst({ where: { staffId, subjectId } });
  return slot !== null;
};
