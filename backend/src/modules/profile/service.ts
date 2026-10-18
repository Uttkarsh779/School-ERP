import { prisma } from "../../config/prisma";
import { comparePassword, hashPassword } from "../../utils/password";
import { httpError } from "../../utils/httpError";

// "My profile" for the logged-in user (any role): view, edit basic details, change password.
// Staff (teachers / admins with a staff record) can edit name, contact, qualifications,
// address and their profile photo. Students' records are managed by the school office, so
// they can only change their password here.

const PHONE_RE = /^[+]?[\d\s-]{7,15}$/;
// Photos must be our own Cloudinary uploads (the upload endpoint returns these URLs).
const PHOTO_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

export const getMyProfile = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      staff: {
        select: {
          id: true,
          staffCategory: true,
          contact: true,
          qualifications: true,
          address: true,
          photoUrl: true,
          classesAsClassTeacher: { select: { id: true, className: true, section: true } },
          subjects: { select: { subject: { select: { name: true, classSection: { select: { className: true, section: true } } } } } },
        },
      },
      student: { select: { id: true, admissionNo: true, photoUrl: true, classSection: { select: { className: true, section: true } } } },
    },
  });
  if (!user) throw httpError(404, "Account not found");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    memberSince: user.createdAt,
    photoUrl: user.staff?.photoUrl ?? user.student?.photoUrl ?? null,
    canEditDetails: Boolean(user.staff) || user.role === "SUPER_ADMIN" || user.role === "ADMIN",
    canEditPhoto: Boolean(user.staff),
    staff: user.staff
      ? {
          id: user.staff.id,
          staffCategory: user.staff.staffCategory,
          contact: user.staff.contact,
          qualifications: user.staff.qualifications,
          address: user.staff.address,
          classTeacherOf: user.staff.classesAsClassTeacher.map((c: any) => `${c.className} - ${c.section}`),
          teaches: user.staff.subjects.map((s: any) => `${s.subject.name} (${s.subject.classSection.className} - ${s.subject.classSection.section})`),
        }
      : null,
    student: user.student
      ? {
          id: user.student.id,
          admissionNo: user.student.admissionNo,
          classSection: user.student.classSection ? `${user.student.classSection.className} - ${user.student.classSection.section}` : null,
        }
      : null,
  };
};

// Pure validation of the editable fields — unit tested.
export const parseProfileUpdate = (body: Record<string, unknown>) => {
  const out: { name?: string; contact?: string | null; qualifications?: string | null; address?: string | null; photoUrl?: string | null } = {};
  const text = (v: unknown, field: string, max: number) => {
    if (v === null || v === "") return null;
    if (typeof v !== "string") throw httpError(400, `${field} must be text`);
    const t = v.trim();
    if (t.length > max) throw httpError(400, `${field} must be at most ${max} characters`);
    return t || null;
  };
  if (body.name !== undefined) {
    const name = text(body.name, "Name", 80);
    if (!name || name.length < 2) throw httpError(400, "Name must be at least 2 characters");
    out.name = name;
  }
  if (body.contact !== undefined) {
    const c = text(body.contact, "Contact number", 20);
    if (c && !PHONE_RE.test(c)) throw httpError(400, "Enter a valid phone number");
    out.contact = c;
  }
  if (body.qualifications !== undefined) out.qualifications = text(body.qualifications, "Qualifications", 300);
  if (body.address !== undefined) out.address = text(body.address, "Address", 300);
  if (body.photoUrl !== undefined) {
    const p = text(body.photoUrl, "Photo", 500);
    if (p && !PHOTO_RE.test(p)) throw httpError(400, "Upload the photo through the profile page");
    out.photoUrl = p;
  }
  return out;
};

export const updateMyProfile = async (userId: number, body: Record<string, unknown>) => {
  const update = parseProfileUpdate(body);
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staff: true } });
  if (!user) throw httpError(404, "Account not found");

  const staffFields = ["contact", "qualifications", "address", "photoUrl"] as const;
  const touchesStaff = staffFields.some((f) => update[f] !== undefined);
  if (user.role === "STUDENT" || user.role === "PARENT") {
    throw httpError(403, "Your details are managed by the school office. Please contact them for changes.");
  }
  if (touchesStaff && !user.staff) {
    throw httpError(400, "Only staff profiles have contact, qualification, address and photo fields");
  }

  await prisma.$transaction(async (tx: any) => {
    if (update.name) await tx.user.update({ where: { id: userId }, data: { name: update.name } });
    if (touchesStaff && user.staff) {
      await tx.staff.update({
        where: { id: user.staff.id },
        data: Object.fromEntries(staffFields.filter((f) => update[f] !== undefined).map((f) => [f, update[f]])),
      });
    }
  });
  return getMyProfile(userId);
};

// Password rules: 8+ characters with at least one letter and one number.
export const validateNewPassword = (password: unknown) => {
  if (typeof password !== "string" || password.length < 8) throw httpError(400, "New password must be at least 8 characters");
  if (password.length > 72) throw httpError(400, "New password is too long");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw httpError(400, "New password needs at least one letter and one number");
};

export const changeMyPassword = async (userId: number, currentPassword: unknown, newPassword: unknown) => {
  if (typeof currentPassword !== "string" || !currentPassword) throw httpError(400, "Enter your current password");
  validateNewPassword(newPassword);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError(404, "Account not found");
  if (!(await comparePassword(currentPassword, user.passwordHash))) throw httpError(400, "Current password is incorrect");
  if (await comparePassword(newPassword as string, user.passwordHash)) throw httpError(400, "New password must be different from the current one");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword as string) } });
};
