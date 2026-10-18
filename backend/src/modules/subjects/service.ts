import { prisma } from "../../config/prisma";

const withTeacher = {
  include: { teacherSubjects: { include: { staff: { include: { user: true } } } } },
} as const;

export const listSubjects = (classSectionId: number) =>
  prisma.subject.findMany({ where: { classSectionId }, orderBy: { name: "asc" }, ...withTeacher });

// Subjects a teacher sees for a class: the class teacher sees every subject (view-only for
// the ones they don't teach); anyone else sees only the subjects allocated to them.
export const listSubjectsForTeacher = async (classSectionId: number, staffId: number) => {
  const classSection = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { classTeacherId: true } });
  return prisma.subject.findMany({
    where: {
      classSectionId,
      ...(classSection?.classTeacherId === staffId ? {} : { teacherSubjects: { some: { staffId } } }),
    },
    orderBy: { name: "asc" },
    ...withTeacher,
  });
};

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

// The subject allocation (Subjects screen) is the single source of truth for who may enter
// a subject's marks. The timetable is deliberately NOT consulted: it also holds
// substitutions and stale periods, which must not grant marks access.
export const isTeacherAssignedToSubject = async (staffId: number, subjectId: number): Promise<boolean> => {
  const link = await prisma.teacherSubject.findFirst({ where: { staffId, subjectId } });
  return link !== null;
};

// Subject ids in a class allocated to this teacher.
export const listAllocatedSubjectIds = async (staffId: number, classSectionId: number): Promise<number[]> => {
  const links = await prisma.teacherSubject.findMany({
    where: { staffId, subject: { classSectionId } },
    select: { subjectId: true },
  });
  return links.map((l: { subjectId: number }) => l.subjectId);
};

// Allocated teacher (staffId) of a subject, or null when nobody is allocated.
export const getAllocatedStaffId = async (subjectId: number): Promise<number | null> => {
  const link = await prisma.teacherSubject.findFirst({ where: { subjectId }, select: { staffId: true } });
  return link?.staffId ?? null;
};
