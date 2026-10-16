import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";

const staffWithUser = {
  include: {
    user: {
      include: {
        parent: {
          include: {
            children: true,
          },
        },
      },
    },
  },
} as const;

export const listStaff = () => prisma.staff.findMany(staffWithUser);

export const getStaffById = (id: number) =>
  prisma.staff.findUnique({ where: { id }, ...staffWithUser });

export const ACCOUNT_REQUIRED_ROLES = [
  "TEACHER",
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "COORDINATOR",
  "ADMIN_STAFF",
  "OFFICE_STAFF",
];

export const isAccountRequiredRole = (role?: string) => {
  if (!role) return true;
  return ACCOUNT_REQUIRED_ROLES.includes(role);
};

export const createStaff = (data: {
  email?: string;
  passwordHash: string;
  name: string;
  qualifications?: string;
  contact?: string;
  staffCategory?: any;
}) => {
  const category = data.staffCategory || "TEACHER";
  const needsAccount = isAccountRequiredRole(category);
  const email =
    data.email && data.email.trim()
      ? data.email.trim()
      : `${category.toLowerCase()}.${Date.now()}@school.internal`;

  return prisma.staff.create({
    data: {
      staffCategory: category,
      qualifications: data.qualifications,
      contact: data.contact,
      user: {
        create: {
          email,
          passwordHash: data.passwordHash,
          role: category === "ADMIN_STAFF" ? Role.ADMIN : Role.TEACHER,
          name: data.name,
          isActive: needsAccount,
        },
      },
    },
    ...staffWithUser,
  });
};

export const updateStaff = (
  id: number,
  data: { name?: string; email?: string; qualifications?: string; contact?: string; staffCategory?: any }
) => {
  const updateData: Prisma.StaffUpdateInput = {
    qualifications: data.qualifications,
    contact: data.contact,
  };
  if (data.staffCategory) {
    updateData.staffCategory = data.staffCategory;
  }
  const userUpdate: any = {};
  if (data.name !== undefined) userUpdate.name = data.name;
  if (data.email !== undefined) userUpdate.email = data.email;

  if (Object.keys(userUpdate).length > 0) {
    updateData.user = { update: userUpdate };
  }
  return prisma.staff.update({ where: { id }, data: updateData, ...staffWithUser });
};

export const setStaffActive = async (id: number, isActive: boolean) => {
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id } });
  return prisma.user.update({ where: { id: staff.userId }, data: { isActive } });
};

export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

export const findStaffByUserId = (userId: number) => prisma.staff.findUnique({ where: { userId } });
