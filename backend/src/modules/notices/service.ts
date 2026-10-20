import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";
import { findStaffByUserId } from "../staff/service";
import { listClassSectionsForTeacher } from "../classSections/service";
import { getStudentByUserId } from "../students/service";
import { getParentByUserId } from "../parents/service";
import { httpError } from "../../utils/httpError";

export const createNotice = (data: {
  title: string;
  body: string;
  targetRole?: Role;
  targetClassSectionId?: number;
  postedByUserId: number;
  isImportant?: boolean;
  attachmentUrl?: string | null;
}) =>
  prisma.notice.create({
    data: {
      title: data.title,
      body: data.body,
      targetRole: data.targetRole,
      targetClassSectionId: data.targetClassSectionId,
      postedByUserId: data.postedByUserId,
      isImportant: data.isImportant ?? false,
      attachmentUrl: data.attachmentUrl ?? null,
    },
  });

export const deleteNotice = (id: number) => prisma.notice.delete({ where: { id } });

// ---------------------------------------------------------------------------
// Teacher notices: a teacher can post to the classes they teach (class teacher, subject
// allocation or timetable) in the current session. Class-targeted notices reach the whole
// class: its students, their parents and the class teacher.
// ---------------------------------------------------------------------------

type Actor = { id: number; role: Role };
const URL_RE = /^https:\/\/[^\s<>"']+$/i;

// Pure validation of the shared fields (unit tested).
export const parseNoticeFields = (body: Record<string, unknown>) => {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (title.length < 3) throw httpError(400, "Title must be at least 3 characters");
  if (title.length > 150) throw httpError(400, "Title must be at most 150 characters");
  if (text.length < 3) throw httpError(400, "Write the notice text");
  if (text.length > 5000) throw httpError(400, "Notice text must be at most 5000 characters");
  let attachmentUrl: string | null = null;
  if (body.attachmentUrl !== undefined && body.attachmentUrl !== null && body.attachmentUrl !== "") {
    if (typeof body.attachmentUrl !== "string" || body.attachmentUrl.length > 1000 || !URL_RE.test(body.attachmentUrl)) {
      throw httpError(400, "Attachment must be an uploaded file link");
    }
    attachmentUrl = body.attachmentUrl;
  }
  if (body.isImportant !== undefined && typeof body.isImportant !== "boolean") throw httpError(400, "isImportant must be true or false");
  return { title, body: text, attachmentUrl, isImportant: body.isImportant === true };
};

export const parseClassSectionIds = (raw: unknown) => {
  if (!Array.isArray(raw) || raw.length === 0) throw httpError(400, "Choose at least one class");
  if (raw.length > 20) throw httpError(400, "Choose at most 20 classes");
  const ids = [...new Set(raw.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw httpError(400, "Invalid class");
  return ids;
};

export const listTeacherNoticeClasses = async (userId: number) => {
  const staff = await findStaffByUserId(userId);
  if (!staff) return [];
  const classes = await prisma.classSection.findMany({
    where: {
      session: { isCurrent: true },
      OR: [
        { classTeacherId: staff.id },
        { subjects: { some: { teacherSubjects: { some: { staffId: staff.id } } } } },
        { timetableSlots: { some: { staffId: staff.id } } },
      ],
    },
    select: { id: true, className: true, section: true, classTeacherId: true, _count: { select: { students: { where: { isActive: true } } } } },
    orderBy: [{ className: "asc" }, { section: "asc" }],
  });
  return classes.map((c: any) => ({
    id: c.id,
    className: c.className,
    section: c.section,
    isClassTeacher: c.classTeacherId === staff.id,
    studentCount: c._count.students,
  }));
};

// Admins: existing audience rules (role and/or one class). Teachers: one notice per chosen class.
export const createNoticesForActor = async (actor: Actor, body: Record<string, unknown>) => {
  const fields = parseNoticeFields(body ?? {});
  if (actor.role === "TEACHER") {
    const ids = parseClassSectionIds(body.classSectionIds);
    const allowed = new Set((await listTeacherNoticeClasses(actor.id)).map((c: any) => c.id));
    if (ids.some((id) => !allowed.has(id))) throw httpError(403, "You can only send notices to classes you teach");
    return prisma.$transaction(
      ids.map((targetClassSectionId) => prisma.notice.create({ data: { ...fields, targetClassSectionId, postedByUserId: actor.id } }))
    );
  }
  const targetRole = body.targetRole ? String(body.targetRole) : undefined;
  if (targetRole && !["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"].includes(targetRole)) {
    throw httpError(400, `Invalid targetRole "${targetRole}"`);
  }
  const targetClassSectionId = body.targetClassSectionId ? Number(body.targetClassSectionId) : undefined;
  if (targetClassSectionId !== undefined && (!Number.isInteger(targetClassSectionId) || targetClassSectionId <= 0)) throw httpError(400, "Invalid class");
  if (targetClassSectionId && !(await prisma.classSection.findUnique({ where: { id: targetClassSectionId }, select: { id: true } }))) {
    throw httpError(404, "Class not found");
  }
  const notice = await createNotice({ ...fields, targetRole: targetRole as Role | undefined, targetClassSectionId, postedByUserId: actor.id });
  return [notice];
};

// Teachers may delete only their own notices; admins any.
export const deleteNoticeForActor = async (actor: Actor, id: number) => {
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid notice id");
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) throw httpError(404, "Notice not found");
  if (actor.role === "TEACHER" && notice.postedByUserId !== actor.id) throw httpError(403, "You can only delete notices you posted");
  await prisma.notice.delete({ where: { id } });
};

export const listSentNotices = async (userId: number) => {
  const notices = await prisma.notice.findMany({ where: { postedByUserId: userId }, orderBy: { postedAt: "desc" }, take: 200 });
  return attachPostedBy(await attachClassSectionLabels(notices));
};

// "Posted by" name + role for every notice (no Prisma relation, so a manual lookup).
const attachPostedBy = async (notices: any[]) => {
  const ids = [...new Set(notices.map((n) => n.postedByUserId))];
  if (ids.length === 0) return notices;
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } });
  const byId = new Map(users.map((u: any) => [u.id, u]));
  return notices.map((n) => {
    const u: any = byId.get(n.postedByUserId);
    return { ...n, postedBy: u ? { name: u.name, role: u.role } : null };
  });
};

type NoticeRow = { targetClassSectionId: number | null };

// Attaches a lightweight { id, className, section } label for notices targeted at a
// specific class section. Notice has no Prisma relation to ClassSection —
// targetClassSectionId is a plain nullable int, not a foreign-key relation field — so this
// is a manual lookup rather than a Prisma `include`. Doing it here (rather than making the
// frontend call /class-sections) matters because that endpoint is admin-only, and every
// role needs to read this label off their own notices.
const attachClassSectionLabels = async <T extends NoticeRow>(
  notices: T[]
): Promise<any[]> => {
  const ids = [...new Set(notices.map((n: any) => n.targetClassSectionId).filter((id): id is number => id !== null))];
  if (ids.length === 0) {
    return notices.map((n: any) => ({ ...n, targetClassSection: null }));
  }

  const classSections = await prisma.classSection.findMany({
    where: { id: { in: ids } },
    select: { id: true, className: true, section: true },
  });
  const byId = new Map(classSections.map((cs: any) => [cs.id, cs]));

  return notices.map((n: any) => ({
    ...n,
    targetClassSection: n.targetClassSectionId !== null ? byId.get(n.targetClassSectionId) ?? null : null,
  }));
};

// SUPER_ADMIN/ADMIN see every notice, unfiltered.
export const listNoticesForAdmin = async () => {
  const notices = await prisma.notice.findMany({ orderBy: { postedAt: "desc" } });
  return attachPostedBy(await attachClassSectionLabels(notices));
};

// Resolves the calling user's own class section id(s) so listNoticesForUser can match
// class-targeted notices — a TEACHER via the class(es) they're the assigned class teacher
// of, a STUDENT via their own class, a PARENT via any of their linked children's classes.
const getOwnClassSectionIds = async (userId: number, role: Role): Promise<number[]> => {
  if (role === "TEACHER") {
    const staff = await findStaffByUserId(userId);
    if (!staff) return [];
    const classSections = await listClassSectionsForTeacher(staff.id);
    return classSections.map((c: any) => c.id);
  }
  if (role === "STUDENT") {
    const student = await getStudentByUserId(userId);
    return student ? [student.classSectionId] : [];
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(userId);
    if (!parent) return [];
    return parent.children.map((link: any) => link.student.classSectionId);
  }
  return [];
};

// "Does this notice apply to me":
// - targetClassSectionId set -> only admins, the class's assigned teacher, students in
//   that class, and parents with a linked child in that class see it (targetRole, if also
//   set, doesn't further narrow this — a class-targeted notice is for the whole class).
// - targetClassSectionId null, targetRole set -> everyone with that role (admins are
//   handled separately by listNoticesForAdmin, which bypasses all filtering).
// - both null -> everyone.
export const listNoticesForUser = async (userId: number, role: Role) => {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return listNoticesForAdmin();
  }

  const ownClassSectionIds = await getOwnClassSectionIds(userId, role);

  const notices = await prisma.notice.findMany({
    where: {
      OR: [
        { targetRole: null, targetClassSectionId: null },
        { targetRole: role, targetClassSectionId: null },
        ...(ownClassSectionIds.length ? [{ targetClassSectionId: { in: ownClassSectionIds } }] : []),
      ],
    },
    orderBy: { postedAt: "desc" },
  });

  return attachPostedBy(await attachClassSectionLabels(notices));
};
