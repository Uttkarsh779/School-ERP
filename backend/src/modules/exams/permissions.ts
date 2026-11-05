import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { can } from "../../config/permissions";

// Who may do what in the exam module:
//  - Exam coordinator: the office, the Principal, and teachers the Super Admin has ticked. Plans
//    exams for many classes, date sheets, admit cards, marks deadlines, locks marks, sets the
//    final weightage.
//  - Publisher: the Super Admin and the Principal. Publishes exam marks and term/final
//    results, and is the only one who can change things after publishing.
//  - Assessment schemes (weightage, periodic tests, grading): the Super Admin and the Principal.

type Actor = { id: number; role: string };

const staffOf = (userId: number) => prisma.staff.findUnique({ where: { userId }, select: { isExamCoordinator: true, isActive: true } });

export const isCoordinator = async (actor: Actor) => {
  if (can(actor.role, "exams.coordinate")) return true;
  if (actor.role !== "TEACHER") return false;
  const staff = await staffOf(actor.id);
  return !!staff?.isActive && staff.isExamCoordinator;
};

export const canPublish = async (actor: Actor) => can(actor.role, "exams.publish");
export const canEditSchemes = (actor: Actor) => can(actor.role, "exams.schemes");

export const assertCoordinator = async (actor: Actor) => {
  if (!(await isCoordinator(actor))) throw httpError(403, "Only the exam coordinator can do this");
};

export const assertPublisher = async (actor: Actor) => {
  if (!(await canPublish(actor))) throw httpError(403, "Only the Super Admin or the Principal can publish results");
};

export const assertSchemeEditor = (actor: Actor) => {
  if (!canEditSchemes(actor)) throw httpError(403, "Only the Super Admin or the Principal can change assessment schemes");
};

export const examPermissions = async (actor: Actor) => ({
  coordinator: await isCoordinator(actor),
  publisher: await canPublish(actor),
  schemes: canEditSchemes(actor),
});
