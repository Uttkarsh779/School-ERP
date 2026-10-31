import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import { httpError } from "../../utils/httpError";
import { hashPassword } from "../../utils/password";
import { validateNewPassword } from "../profile/service";
import type { StaffDetails } from "./details";

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

// Employee code, Aadhaar and PAN are unique: say which one clashes instead of a raw DB error.
const assertUniqueDetails = async (details: StaffDetails, exceptId?: number) => {
  const checks = [
    ["employeeCode", "employee code"],
    ["aadhaarNumber", "Aadhaar number"],
    ["panNumber", "PAN"],
  ] as const;
  for (const [field, label] of checks) {
    const value = details[field];
    if (!value) continue;
    const other = await prisma.staff.findFirst({ where: { [field]: value, ...(exceptId ? { id: { not: exceptId } } : {}) }, include: { user: true } });
    if (other) throw httpError(409, `Another staff member (${other.user.name}) already has this ${label}`);
  }
};

const nextEmployeeCode = async (id: number) => {
  for (let n = id; ; n++) {
    const code = `EMP-${String(n).padStart(4, "0")}`;
    if (!(await prisma.staff.findUnique({ where: { employeeCode: code } }))) return code;
  }
};

export const createStaff = async (data: {
  email?: string;
  passwordHash: string;
  name: string;
  qualifications?: string;
  contact?: string;
  staffCategory?: any;
  details?: StaffDetails;
}) => {
  await assertUniqueDetails(data.details ?? {});
  const category = data.staffCategory || "TEACHER";
  const needsAccount = isAccountRequiredRole(category);
  const email =
    data.email && data.email.trim()
      ? data.email.trim()
      : `${category.toLowerCase()}.${Date.now()}@school.internal`;

  const staff = await prisma.staff.create({
    data: {
      ...data.details,
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
  // No code given: EMP-0001 style from the record number.
  if (staff.employeeCode) return staff;
  return prisma.staff.update({ where: { id: staff.id }, data: { employeeCode: await nextEmployeeCode(staff.id) }, ...staffWithUser });
};

export const updateStaff = async (
  id: number,
  data: { name?: string; email?: string; qualifications?: string; contact?: string; staffCategory?: any; details?: StaffDetails; isExamCoordinator?: boolean }
) => {
  const details = data.details ?? {};
  await assertUniqueDetails(details, id);
  if (details.employeeCode === null) throw httpError(400, "Employee code can't be empty");
  const updateData: Prisma.StaffUpdateInput = {
    ...details,
    ...(data.isExamCoordinator !== undefined ? { isExamCoordinator: data.isExamCoordinator } : {}),
    qualifications: data.qualifications,
    contact: data.contact,
  };
  const userUpdate: any = {};
  if (data.staffCategory) {
    updateData.staffCategory = data.staffCategory;
    // Login access follows the role: a staff member moved to a no-login role loses it.
    const current = await prisma.staff.findUniqueOrThrow({ where: { id } });
    userUpdate.isActive = current.isActive && isAccountRequiredRole(data.staffCategory);
  }
  if (data.name !== undefined) userUpdate.name = data.name;
  if (data.email !== undefined) userUpdate.email = data.email;

  if (Object.keys(userUpdate).length > 0) {
    updateData.user = { update: userUpdate };
  }
  return prisma.staff.update({ where: { id }, data: updateData, ...staffWithUser });
};

// Employment status. The login is enabled only for roles that sign in.
export const setStaffActive = async (id: number, isActive: boolean) => {
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id } });
  return prisma.staff.update({
    where: { id },
    data: { isActive, user: { update: { isActive: isActive && isAccountRequiredRole(staff.staffCategory) } } },
    ...staffWithUser,
  });
};

export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });

// Super Admin sets a new password for a staff member who forgot theirs (there's no email
// reset). The staff member should change it from My Profile after signing in.
export const resetStaffPassword = async (id: number, password: unknown) => {
  validateNewPassword(password);
  const staff = await prisma.staff.findUnique({ where: { id }, include: { user: true } });
  if (!staff) throw httpError(404, "Staff not found");
  if (staff.user.role === Role.SUPER_ADMIN) throw httpError(400, "A Super Admin's password can only be changed from their own profile");
  await prisma.user.update({ where: { id: staff.userId }, data: { passwordHash: await hashPassword(password as string) } });
  return { email: staff.user.email };
};

export const findStaffByUserId = (userId: number) => prisma.staff.findUnique({ where: { userId } });
