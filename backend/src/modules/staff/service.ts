import { signOutEverywhere } from "../auth/tokens";
import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import type { Prisma } from "../../generated/prisma/client";
import { httpError } from "../../utils/httpError";
import { hashPassword } from "../../utils/password";
import { validateNewPassword } from "../profile/service";
import { createAuditLog } from "../fees/ledgerService";
import type { StaffDetails } from "./details";

const staffWithUser = {
  include: {
    user: true,
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
  "ACCOUNTANT",
];

// Designation (Staff.staffCategory) is the job title, for HR and ID cards. Login role
// (User.role) is what the person can do in the software; see config/permissions.ts. They're
// set separately: a new designation never changes anyone's access.
export const STAFF_LOGIN_ROLES: Role[] = [Role.TEACHER, Role.ADMIN, Role.PRINCIPAL, Role.ACCOUNTANT];

// allowSuperAdmin: an existing staff member may be made Super Admin from their profile (the
// limits below still apply); a brand-new staff member can't be created as one.
export const parseLoginRole = (value: unknown, { allowSuperAdmin = false } = {}): Role | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (allowSuperAdmin && value === Role.SUPER_ADMIN) return Role.SUPER_ADMIN;
  if (!STAFF_LOGIN_ROLES.includes(value as Role)) throw httpError(400, "Choose a valid login role");
  return value as Role;
};

// The school runs with at most two Super Admins (so one can cover for the other), and never
// fewer than one active Super Admin, so nobody can lock the school out of its own settings.
export const MAX_SUPER_ADMINS = 2;
const activeSuperAdminCount = (excludeUserId?: number) =>
  prisma.user.count({ where: { role: Role.SUPER_ADMIN, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) } });

export const assertCanAddSuperAdmin = async () => {
  if ((await activeSuperAdminCount()) >= MAX_SUPER_ADMINS) {
    throw httpError(400, `There are already ${MAX_SUPER_ADMINS} Super Admins. Change one of them to another role first.`);
  }
};

// Called before a Super Admin loses that access (new role, deactivated, or a no-login designation).
export const assertNotLastSuperAdmin = async (userId: number) => {
  if ((await activeSuperAdminCount(userId)) === 0) {
    throw httpError(400, "This is the only active Super Admin. Make someone else Super Admin first.");
  }
};

// The usual login role for a designation: only a starting point for a new staff member.
export const loginRoleFor = (category: string): Role =>
  category === "PRINCIPAL"
    ? Role.PRINCIPAL
    : category === "ACCOUNTANT"
      ? Role.ACCOUNTANT
      : category === "ADMIN_STAFF" || category === "OFFICE_STAFF"
        ? Role.ADMIN
        : Role.TEACHER;

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
  loginRole?: Role;
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
          role: data.loginRole ?? loginRoleFor(category),
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
  data: { name?: string; email?: string; qualifications?: string; contact?: string; staffCategory?: any; loginRole?: Role; details?: StaffDetails; isExamCoordinator?: boolean },
  actorId: number
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
  const current = await prisma.staff.findUnique({ where: { id }, include: { user: { select: { role: true, isActive: true } } } });
  if (!current) throw httpError(404, "Staff not found");
  const isSuperAdmin = current.user.role === Role.SUPER_ADMIN;
  if (data.staffCategory) {
    updateData.staffCategory = data.staffCategory;
    // Whether someone signs in at all still follows the designation (drivers and guards don't).
    userUpdate.isActive = current.isActive && isAccountRequiredRole(data.staffCategory);
    if (isSuperAdmin && current.user.isActive && !userUpdate.isActive) await assertNotLastSuperAdmin(current.userId);
  }
  const roleChange = data.loginRole && data.loginRole !== current.user.role ? data.loginRole : null;
  if (roleChange) {
    if (roleChange === Role.SUPER_ADMIN) {
      if (!current.user.isActive && userUpdate.isActive !== true) throw httpError(400, "This staff member's login is off; turn it on before making them Super Admin");
      await assertCanAddSuperAdmin();
    }
    if (isSuperAdmin) await assertNotLastSuperAdmin(current.userId);
    userUpdate.role = roleChange;
  }
  if (data.name !== undefined) userUpdate.name = data.name;
  if (data.email !== undefined) userUpdate.email = data.email;

  if (Object.keys(userUpdate).length > 0) {
    updateData.user = { update: userUpdate };
  }
  const updated = await prisma.staff.update({ where: { id }, data: updateData, ...staffWithUser });
  if (roleChange) {
    await createAuditLog({ action: "CHANGE_LOGIN_ROLE", entityType: "User", entityId: current.userId, userId: actorId, oldValues: { role: current.user.role }, newValues: { role: roleChange } });
  }
  return updated;
};

// Employment status. The login is enabled only for roles that sign in.
export const setStaffActive = async (id: number, isActive: boolean) => {
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id }, include: { user: { select: { role: true, isActive: true } } } });
  const loginOn = isActive && isAccountRequiredRole(staff.staffCategory);
  if (staff.user.role === Role.SUPER_ADMIN) {
    if (staff.user.isActive && !loginOn) await assertNotLastSuperAdmin(staff.userId);
    if (!staff.user.isActive && loginOn) await assertCanAddSuperAdmin();
  }
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
  await prisma.user.update({ where: { id: staff.userId }, data: { passwordHash: await hashPassword(password as string), ...signOutEverywhere } });
  return { email: staff.user.email };
};

export const findStaffByUserId = (userId: number) => prisma.staff.findUnique({ where: { userId } });
