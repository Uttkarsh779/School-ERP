import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";

// Student health record: one profile per student (allergies, conditions, medicines, doctor,
// emergency contact), plus checkups (height, weight, eyesight) and vaccinations.
//  - Office and Principal see and edit all of it.
//  - Teachers of the class see a short alert only (healthAlertFor), read-only.
//  - Families see their own record on the student login, without the office notes.
// The audit log records which fields changed and who changed them, not the health details.

const PROFILE_FIELDS = [
  "allergies",
  "conditions",
  "medicines",
  "emergencyMedicine",
  "dietary",
  "disability",
  "doctorName",
  "doctorPhone",
  "emergencyName",
  "emergencyRelation",
  "emergencyPhone",
  "officeNotes",
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];
const PHONE_FIELDS: ProfileField[] = ["doctorPhone", "emergencyPhone"];

const text = (v: unknown, max = 500) => {
  const t = typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ") : "";
  return t ? t.slice(0, max) : null;
};

const assertStudent = async (studentId: number) => {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, bloodGroup: true } });
  if (!s) throw httpError(404, "Student not found");
  return s;
};

const ist = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const parseDay = (v: unknown, label: string, required: boolean) => {
  if (v === undefined || v === null || v === "") {
    if (required) throw httpError(400, `${label} is required`);
    return null;
  }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw httpError(400, `${label} isn't a valid date`);
  if (v > ist()) throw httpError(400, `${label} can't be in the future`);
  return new Date(`${v}T00:00:00.000Z`);
};
const parseMeasure = (v: unknown, label: string, min: number, max: number) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${label} should be between ${min} and ${max}`);
  return Math.round(n * 10) / 10;
};

const bmi = (heightCm: number | null, weightKg: number | null) =>
  heightCm && weightKg ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10 : null;

const checkupView = (c: any) => {
  const h = c.heightCm === null ? null : Number(c.heightCm);
  const w = c.weightKg === null ? null : Number(c.weightKg);
  return {
    id: c.id,
    checkupDate: c.checkupDate,
    heightCm: h,
    weightKg: w,
    bmi: bmi(h, w),
    visionLeft: c.visionLeft,
    visionRight: c.visionRight,
    dental: c.dental,
    notes: c.notes,
  };
};
const vaccinationView = (v: any) => ({ id: v.id, vaccine: v.vaccine, dose: v.dose, givenOn: v.givenOn, notes: v.notes });

const emptyProfile = () => Object.fromEntries(PROFILE_FIELDS.map((f) => [f, null])) as Record<ProfileField, string | null>;

// Full record. Families (forFamily) don't see the office notes.
export const getStudentHealth = async (studentId: number, opts: { forFamily?: boolean } = {}) => {
  const student = await assertStudent(studentId);
  const [profile, checkups, vaccinations] = await Promise.all([
    prisma.studentHealth.findUnique({ where: { studentId } }),
    prisma.healthCheckup.findMany({ where: { studentId }, orderBy: [{ checkupDate: "desc" }, { id: "desc" }] }),
    prisma.vaccination.findMany({ where: { studentId }, orderBy: [{ givenOn: "desc" }, { id: "desc" }] }),
  ]);
  const p: Record<string, unknown> = { ...emptyProfile(), ...(profile ? Object.fromEntries(PROFILE_FIELDS.map((f) => [f, profile[f]])) : {}) };
  if (opts.forFamily) delete p.officeNotes;
  return {
    bloodGroup: student.bloodGroup,
    profile: p,
    updatedAt: profile?.updatedAt ?? null,
    checkups: checkups.map(checkupView),
    vaccinations: vaccinations.map(vaccinationView),
  };
};

export const saveStudentHealth = async (actorId: number, studentId: number, body: Record<string, unknown>) => {
  await assertStudent(studentId);
  const data = {} as Record<ProfileField, string | null>;
  for (const f of PROFILE_FIELDS) {
    if (!(f in body)) continue;
    const v = text(body[f], f === "officeNotes" ? 2000 : 500);
    if (v && PHONE_FIELDS.includes(f)) {
      const digits = v.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
      if (!/^\d{10}$/.test(digits) && !/^0\d{9,11}$/.test(digits)) throw httpError(400, `${f === "doctorPhone" ? "Doctor's" : "Emergency contact"} phone should be a 10-digit mobile or a landline with STD code`);
      data[f] = digits;
    } else data[f] = v;
  }
  const before = await prisma.studentHealth.findUnique({ where: { studentId } });
  const merged = { ...(before ?? emptyProfile()), ...data };
  if (merged.emergencyPhone && !merged.emergencyName) throw httpError(400, "Add the emergency contact's name");

  const changed = PROFILE_FIELDS.filter((f) => f in data && (before?.[f] ?? null) !== data[f]);
  if (!changed.length) return getStudentHealth(studentId);

  await prisma.studentHealth.upsert({
    where: { studentId },
    create: { studentId, ...data, updatedByUserId: actorId },
    update: { ...data, updatedByUserId: actorId },
  });
  await createAuditLog({ action: before ? "UPDATE" : "CREATE", entityType: "StudentHealth", entityId: studentId, userId: actorId, newValues: { changedFields: changed } });
  return getStudentHealth(studentId);
};

export const addCheckup = async (actorId: number, studentId: number, body: Record<string, unknown>) => {
  await assertStudent(studentId);
  const row = {
    checkupDate: parseDay(body.checkupDate, "Checkup date", true)!,
    heightCm: parseMeasure(body.heightCm, "Height (cm)", 40, 220),
    weightKg: parseMeasure(body.weightKg, "Weight (kg)", 5, 200),
    visionLeft: text(body.visionLeft, 20),
    visionRight: text(body.visionRight, 20),
    dental: text(body.dental, 200),
    notes: text(body.notes, 500),
  };
  if (row.heightCm === null && row.weightKg === null && !row.visionLeft && !row.visionRight && !row.dental && !row.notes) {
    throw httpError(400, "Enter at least one reading");
  }
  const c = await prisma.healthCheckup.create({ data: { studentId, ...row, recordedByUserId: actorId } });
  await createAuditLog({ action: "CREATE", entityType: "HealthCheckup", entityId: c.id, userId: actorId, newValues: { studentId } });
  return checkupView(c);
};

export const deleteCheckup = async (actorId: number, id: number) => {
  const c = await prisma.healthCheckup.findUnique({ where: { id } });
  if (!c) throw httpError(404, "Checkup not found");
  await prisma.healthCheckup.delete({ where: { id } });
  await createAuditLog({ action: "DELETE", entityType: "HealthCheckup", entityId: id, userId: actorId, oldValues: { studentId: c.studentId, checkupDate: c.checkupDate } });
  return { id };
};

export const addVaccination = async (actorId: number, studentId: number, body: Record<string, unknown>) => {
  await assertStudent(studentId);
  const vaccine = text(body.vaccine, 80);
  if (!vaccine) throw httpError(400, "Which vaccine?");
  const v = await prisma.vaccination.create({
    data: { studentId, vaccine, dose: text(body.dose, 40), givenOn: parseDay(body.givenOn, "Date given", false), notes: text(body.notes, 300), recordedByUserId: actorId },
  });
  await createAuditLog({ action: "CREATE", entityType: "Vaccination", entityId: v.id, userId: actorId, newValues: { studentId, vaccine } });
  return vaccinationView(v);
};

export const deleteVaccination = async (actorId: number, id: number) => {
  const v = await prisma.vaccination.findUnique({ where: { id } });
  if (!v) throw httpError(404, "Vaccination not found");
  await prisma.vaccination.delete({ where: { id } });
  await createAuditLog({ action: "DELETE", entityType: "Vaccination", entityId: id, userId: actorId, oldValues: { studentId: v.studentId, vaccine: v.vaccine } });
  return { id };
};

// What a teacher needs to keep a child safe in class or on a trip — nothing else.
export type HealthAlert = { allergies: string | null; conditions: string | null; emergencyMedicine: string | null; dietary: string | null };
const ALERT_FIELDS = ["allergies", "conditions", "emergencyMedicine", "dietary"] as const;

export const healthAlertsFor = async (studentIds: number[]) => {
  const map = new Map<number, HealthAlert>();
  if (!studentIds.length) return map;
  const rows = await prisma.studentHealth.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, allergies: true, conditions: true, emergencyMedicine: true, dietary: true },
  });
  for (const r of rows) if (ALERT_FIELDS.some((f) => r[f]?.trim())) map.set(r.studentId, { allergies: r.allergies, conditions: r.conditions, emergencyMedicine: r.emergencyMedicine, dietary: r.dietary });
  return map;
};
