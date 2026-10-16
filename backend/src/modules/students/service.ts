import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import type { Gender, StudentCategory } from "../../generated/prisma/enums";

export const listStudents = (classSectionId?: number) =>
  prisma.student.findMany({
    where: classSectionId ? { classSectionId } : undefined,
    include: { classSection: true },
    orderBy: [{ classSectionId: "asc" }, { rollNo: "asc" }],
  });

export const getStudentById = (id: number) =>
  prisma.student.findUnique({ where: { id }, include: { classSection: true, parents: { include: { parent: true } } } });

export const getStudentByUserId = (userId: number) =>
  prisma.student.findUnique({ where: { userId }, include: { classSection: true } });

// Shared shape for the optional profile fields on both create and update — keeps the
// two functions from drifting out of sync as fields get added.
export interface StudentProfileFields {
  dob?: Date;
  gender?: Gender;
  bloodGroup?: string;
  photoUrl?: string;
  fatherName?: string;
  fatherContact?: string;
  motherName?: string;
  motherContact?: string;
  aadharNumber?: string;
  apaarId?: string;
  category?: StudentCategory;
  address?: string;
  contactNumber?: string;
  nationality?: string;
  previousSchool?: string;
  admissionDate?: Date;
}

export const createStudent = (
  data: {
    name: string;
    rollNo: string;
    classSectionId: number;
    admissionNo: string;
  } & StudentProfileFields
) => prisma.student.create({ data });

export const updateStudent = (
  id: number,
  data: {
    name?: string;
    rollNo?: string;
    classSectionId?: number;
    admissionNo?: string;
  } & StudentProfileFields
) => prisma.student.update({ where: { id }, data });

export const setStudentActive = (id: number, isActive: boolean) =>
  prisma.student.update({ where: { id }, data: { isActive } });

export const findClassSection = (className: string, section: string, sessionId: number) =>
  prisma.classSection.findFirst({ where: { className, section, sessionId } });

// A student logs in via either their email or their admission number — this resolves
// the admission-number path down to the linked User (if a login has been set up for them).
export const getStudentByAdmissionNo = (admissionNo: string) =>
  prisma.student.findUnique({ where: { admissionNo }, include: { user: true } });

// Fallback synthetic email so every User row still satisfies the unique/required
// email column even when a student has no real email of their own (common for
// young children) — they still log in with their admission number, not this value.
const syntheticEmail = (admissionNo: string) =>
  `${admissionNo.toLowerCase().replace(/[^a-z0-9]/g, "-")}@students.rrsintl.local`;

// Creates or updates the login for an existing student record.
export const setStudentCredentials = async (
  studentId: number,
  data: { email?: string; passwordHash: string }
) => {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const email = data.email || syntheticEmail(student.admissionNo);

  if (student.userId) {
    return prisma.user.update({
      where: { id: student.userId },
      data: { email, passwordHash: data.passwordHash },
    });
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: data.passwordHash, role: Role.STUDENT, name: student.name },
  });
  await prisma.student.update({ where: { id: studentId }, data: { userId: user.id } });
  return user;
};
