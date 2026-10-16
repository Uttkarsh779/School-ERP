import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";
import { findStaffByUserId } from "../staff/service";
import { listClassSectionsForTeacher } from "../classSections/service";
import { getStudentByUserId } from "../students/service";
import { getParentByUserId } from "../parents/service";

export const createNotice = (data: {
  title: string;
  body: string;
  targetRole?: Role;
  targetClassSectionId?: number;
  postedByUserId: number;
}) =>
  prisma.notice.create({
    data: {
      title: data.title,
      body: data.body,
      targetRole: data.targetRole,
      targetClassSectionId: data.targetClassSectionId,
      postedByUserId: data.postedByUserId,
    },
  });

export const deleteNotice = (id: number) => prisma.notice.delete({ where: { id } });

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
  return attachClassSectionLabels(notices);
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

  return attachClassSectionLabels(notices);
};
