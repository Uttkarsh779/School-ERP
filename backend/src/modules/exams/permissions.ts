import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Who may do what in the exam module:
//  - Exam coordinator: admins, and teachers the Super Admin has given the permission. Plans
//    exams for many classes, date sheets, admit cards, marks deadlines, locks marks, sets the
//    final weightage.
//  - Publisher: the Super Admin and the Principal. Publishes exam marks and term/final
//    results, and is the only one who can change things after publishing.

type Actor = { id: number; role: string };

const staffOf = (userId: number) => prisma.staff.findUnique({ where: { userId }, select: { id: true, isExamCoordinator: true, staffCategory: true, isActive: true } });

export const isCoordinator = async (actor: Actor) => {
  if (actor.role === "SUPER_ADMIN" || actor.role === "ADMIN") return true;
  if (actor.role !== "TEACHER") return false;
  const staff = await staffOf(actor.id);
  return !!staff?.isActive && (staff.isExamCoordinator || staff.staffCategory === "PRINCIPAL");
};

export const canPublish = async (actor: Actor) => {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role !== "TEACHER") return false;
  const staff = await staffOf(actor.id);
  return !!staff?.isActive && staff.staffCategory === "PRINCIPAL";
};

export const assertCoordinator = async (actor: Actor) => {
  if (!(await isCoordinator(actor))) throw httpError(403, "Only the exam coordinator can do this");
};

export const assertPublisher = async (actor: Actor) => {
  if (!(await canPublish(actor))) throw httpError(403, "Only the Super Admin or the Principal can publish results");
};

export const examPermissions = async (actor: Actor) => ({ coordinator: await isCoordinator(actor), publisher: await canPublish(actor) });
