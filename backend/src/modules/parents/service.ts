import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";

const parentWithChildren = {
  include: { user: true, children: { include: { student: { include: { classSection: true } } } } },
} as const;

export const listParents = () => prisma.parentGuardian.findMany(parentWithChildren);

export const getParentById = (id: number) =>
  prisma.parentGuardian.findUnique({ where: { id }, ...parentWithChildren });

export const getParentByUserId = (userId: number) =>
  prisma.parentGuardian.findUnique({ where: { userId }, ...parentWithChildren });

export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const createParentWithChildren = (data: {
  name: string;
  contact?: string;
  email?: string;
  address?: string;
  studentIds: number[];
}) =>
  prisma.parentGuardian.create({
    data: {
      name: data.name,
      contact: data.contact,
      email: data.email,
      address: data.address,
      children: data.studentIds.length
        ? { create: data.studentIds.map((studentId) => ({ studentId, relationshipType: "Guardian" })) }
        : undefined,
    },
    ...parentWithChildren,
  });

export const linkChild = (parentId: number, studentId: number) =>
  prisma.parentStudent.create({ data: { parentId, studentId } });

export const unlinkChild = (parentId: number, studentId: number) =>
  prisma.parentStudent.delete({ where: { parentId_studentId: { parentId, studentId } } });

// Is the logged-in parent (by their User id) actually linked to this student?
// Used to authorize a parent viewing their own child's attendance/grades/fees.
export const isParentLinkedToStudent = async (userId: number, studentId: number): Promise<boolean> => {
  const link = await prisma.parentStudent.findFirst({
    where: { studentId, parent: { userId } },
  });
  return link !== null;
};
