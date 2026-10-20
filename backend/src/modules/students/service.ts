import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import { hashPassword } from "../../utils/password";
import type { Gender, StudentCategory } from "../../generated/prisma/enums";
import { syncCurrentEnrollment } from "../sessions/enrollmentService";

export const listStudents = (classSectionId?: number) =>
  prisma.student.findMany({
    where: classSectionId ? { classSectionId } : undefined,
    include: { classSection: true },
    orderBy: [{ classSectionId: "asc" }, { rollNo: "asc" }],
  });

// Bus route with its vehicle(s) — what families need: bus number, driver and phone.
const transportRouteInclude = {
  include: { vehicles: { select: { id: true, vehicleNo: true, driverName: true, driverContact: true, capacity: true } } },
} as const;

export const getStudentById = (id: number) =>
  prisma.student.findUnique({
    where: { id },
    include: { classSection: true, parents: { include: { parent: true } }, transportRoute: transportRouteInclude },
  });

export const getStudentByUserId = (userId: number) =>
  prisma.student.findUnique({ where: { userId }, include: { classSection: true, transportRoute: transportRouteInclude } });

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

// Starting password for a new student's login: date of birth as DDMMYYYY (what the family
// knows), or the admission number when no DOB is on file. The admin can reset it later.
export const defaultStudentPassword = (admissionNo: string, dob?: Date | null) => {
  if (!dob || Number.isNaN(new Date(dob).getTime())) return admissionNo;
  const d = new Date(dob);
  return `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;
};

// Every student gets a login at admission: they sign in with their admission number.
export const createStudent = async (
  data: {
    name: string;
    rollNo: string;
    classSectionId: number;
    admissionNo: string;
  } & StudentProfileFields
) => {
  const passwordHash = await hashPassword(defaultStudentPassword(data.admissionNo, data.dob));
  return prisma.$transaction(async (tx: any) => {
    const user = await tx.user.create({
      data: { email: syntheticEmail(data.admissionNo), passwordHash, role: Role.STUDENT, name: data.name },
    });
    const student = await tx.student.create({ data: { ...data, userId: user.id } });
    await syncCurrentEnrollment(tx, student.id);
    return student;
  });
};

export const updateStudent = async (
  id: number,
  data: {
    name?: string;
    rollNo?: string;
    classSectionId?: number;
    admissionNo?: string;
  } & StudentProfileFields
) => {
  const student = await prisma.student.update({ where: { id }, data });
  // Class/roll changes are reflected in this session's enrollment history row.
  if (data.classSectionId !== undefined || data.rollNo !== undefined) await syncCurrentEnrollment(prisma, id);
  return student;
};

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
