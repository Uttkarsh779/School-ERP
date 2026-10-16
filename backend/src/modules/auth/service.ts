import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";

export const findUserByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email } });

export const createUser = (data: {
  email: string;
  passwordHash: string;
  role: Role;
  name: string;
}) => prisma.user.create({ data });
