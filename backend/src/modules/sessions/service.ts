import { prisma } from "../../config/prisma";

export const listSessions = () =>
  prisma.academicSession.findMany({ orderBy: { startDate: "desc" } });

export const getCurrentSession = () =>
  prisma.academicSession.findFirst({ where: { isCurrent: true } });

export const createSession = (data: { name: string; startDate: Date; endDate: Date }) =>
  prisma.academicSession.create({ data });

// Only one session can be "current" at a time. Two sequential statements rather than a
// wrapping transaction — this is an infrequent admin toggle, not a financial operation,
// so the (very unlikely) window between the two calls isn't worth the added complexity.
export const setCurrentSession = async (id: number) => {
  await prisma.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
  return prisma.academicSession.update({ where: { id }, data: { isCurrent: true } });
};
