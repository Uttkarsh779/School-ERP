import { signOutEverywhere } from "../auth/tokens";
import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
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
    include: { classSection: true, transportRoute: transportRouteInclude },
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

// Aadhaar and APAAR ID are unique per student (no two children share one). Blank means
// "not given" (null). findIdConflict powers the form's live warning; checkUniqueIds refuses
// the save, naming the student who already has the number.
export const ID_LABELS = { aadharNumber: "Aadhaar number", apaarId: "APAAR ID" } as const;
type IdKey = keyof typeof ID_LABELS;
const cleanId = (v: unknown) => String(v ?? "").replace(/\s+/g, "");

// Aadhaar: 12 digits, never starting with 0 or 1.
export const aadhaarFormatError = (value: unknown): string | null => {
  const v = cleanId(value);
  if (!v) return null;
  if (!/^\d{12}$/.test(v)) return "Aadhaar number must be exactly 12 digits";
  if (/^[01]/.test(v)) return "Aadhaar number can't start with 0 or 1. Check the number.";
  return null;
};

export const findIdConflict = async (key: IdKey, value: unknown, exceptId?: number) => {
  const v = cleanId(value);
  if (!v) return null;
  const other = await prisma.student.findFirst({
    where: { [key]: v, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, admissionNo: true, isActive: true, classSection: { select: { className: true, section: true } } },
  });
  if (!other) return null;
  return {
    id: other.id,
    name: other.name,
    admissionNo: other.admissionNo,
    className: other.classSection ? `${other.classSection.className} - ${other.classSection.section}` : null,
    isActive: other.isActive,
  };
};

export const idConflictMessage = (key: IdKey, o: { name: string; admissionNo: string; className: string | null; isActive: boolean }) =>
  `This ${ID_LABELS[key]} is already on the record of ${o.name} (Adm ${o.admissionNo}${o.className ? `, ${o.className}` : ""}${o.isActive ? "" : ", left the school"}). Two children can't have the same ${ID_LABELS[key]}. Check the number.`;

const checkUniqueIds = async (data: StudentProfileFields & { admissionNo?: string }, exceptId?: number) => {
  for (const key of Object.keys(ID_LABELS) as IdKey[]) {
    if (data[key] === undefined) continue;
    const v = cleanId(data[key]);
    (data as any)[key] = v || null;
    const formatError = key === "aadharNumber" ? aadhaarFormatError(v) : null;
    if (formatError) throw httpError(400, formatError);
    const other = await findIdConflict(key, v, exceptId);
    if (other) throw httpError(409, idConflictMessage(key, other));
  }
  if (data.admissionNo) {
    const other = await prisma.student.findFirst({ where: { admissionNo: data.admissionNo, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { name: true } });
    if (other) throw httpError(409, `Admission number ${data.admissionNo} is already used by ${other.name}`);
  }
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
  await checkUniqueIds(data);
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
  await checkUniqueIds(data, id);
  const student = await prisma.student.update({ where: { id }, data });
  // Class/roll changes are reflected in this session's enrollment history row.
  if (data.classSectionId !== undefined || data.rollNo !== undefined) await syncCurrentEnrollment(prisma, id);
  return student;
};

// Student photo (passport-style, set by the office). Only images uploaded through the ERP
// (Cloudinary) are accepted; null removes it.
export const setStudentPhoto = async (id: number, photoUrl: unknown) => {
  if (photoUrl !== null && (typeof photoUrl !== "string" || !/^https:\/\/res\.cloudinary\.com\//.test(photoUrl) || photoUrl.length > 500)) {
    throw httpError(400, "Upload the photo through the ERP first");
  }
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) throw httpError(404, "Student not found");
  return prisma.student.update({ where: { id }, data: { photoUrl: photoUrl as string | null }, select: { id: true, photoUrl: true } });
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
      data: { email, passwordHash: data.passwordHash, ...signOutEverywhere },
    });
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: data.passwordHash, role: Role.STUDENT, name: student.name },
  });
  await prisma.student.update({ where: { id: studentId }, data: { userId: user.id } });
  return user;
};

// The admission number to suggest for a new student, continuing the school's own pattern:
// "ADM" + year of admission + running number for that year (ADM2026018 -> ADM2026019). If the
// numbers don't follow that pattern, the most recent one is counted up instead (A-0457 -> A-0458).
// Only a suggestion: the office can change it, and it's checked for clashes again on save.
const YEAR_SEQ = /^([A-Za-z\-\/]*)(\d{4})(\d{3,})$/;
export const suggestNextAdmissionNo = async (year = Number(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 4))) => {
  const latest = await prisma.student.findFirst({ orderBy: { id: "desc" }, select: { admissionNo: true } });
  if (!latest) return `ADM${year}001`;
  const taken = async (n: string) => !!(await prisma.student.findUnique({ where: { admissionNo: n }, select: { id: true } }));

  const m = latest.admissionNo.match(YEAR_SEQ);
  if (m) {
    const [, prefix, , seqDigits] = m;
    const sameYear = await prisma.student.findMany({ where: { admissionNo: { startsWith: `${prefix}${year}` } }, select: { admissionNo: true } });
    const maxSeq = sameYear.reduce((max, s) => {
      const mm = s.admissionNo.match(YEAR_SEQ);
      return mm && mm[1] === prefix && Number(mm[2]) === year ? Math.max(max, Number(mm[3])) : max;
    }, 0);
    for (let seq = maxSeq + 1; seq < maxSeq + 1000; seq++) {
      const candidate = `${prefix}${year}${String(seq).padStart(seqDigits.length, "0")}`;
      if (!(await taken(candidate))) return candidate;
    }
  }

  // Fallback: count up the trailing number of the most recent admission number.
  const t = latest.admissionNo.match(/^(.*?)(\d+)$/);
  if (!t) return "";
  for (let n = Number(t[2]) + 1; n < Number(t[2]) + 1000; n++) {
    const candidate = `${t[1]}${String(n).padStart(t[2].length, "0")}`;
    if (!(await taken(candidate))) return candidate;
  }
  return "";
};
