import { useAppSelector } from "./store";

// Who may do what. Mirrors backend/src/config/permissions.ts (keep both in step): the server
// enforces it, the screens use it to hide what a role can't do.
//
//   SUPER_ADMIN  owner / trust: everything, and the only one who changes money rules
//   ADMIN        school office: admissions, records, fee counter, day-to-day setup
//   PRINCIPAL    academic head: sees everything, runs academics, approves and publishes;
//                reads fee reports but never handles money or fee settings
//   ACCOUNTANT   fees and accounts: collects, bills, day book, expenses; views students
const SA = "SUPER_ADMIN";
const AD = "ADMIN";
const PR = "PRINCIPAL";
const AC = "ACCOUNTANT";

export const PERMISSIONS = {
  dashboard: [SA, AD, PR, AC],

  "students.view": [SA, AD, PR, AC],
  "students.edit": [SA, AD],
  "families.view": [SA, AD, PR, AC],
  "families.edit": [SA, AD],
  "staff.view": [SA, AD, PR],
  "leaves.manage": [SA, AD, PR],
  certificates: [SA, AD, PR],

  "academics.view": [SA, AD, PR, AC],
  "academics.edit": [SA, AD, PR],
  "classes.delete": [SA],
  attendance: [SA, AD, PR],
  homework: [SA, AD, PR],
  "exams.coordinate": [SA, AD, PR],
  "exams.publish": [SA, PR],
  "exams.schemes": [SA, PR],

  notices: [SA, AD, PR],
  calendar: [SA, AD, PR],
  website: [SA, AD, PR],

  "fees.view": [SA, AD, PR, AC],
  "fees.collect": [SA, AD, AC],
  "fees.configure": [SA],
  "fees.waive": [SA],
  accounts: [SA, AD, AC],
  "transport.view": [SA, AD, PR, AC],
  "transport.edit": [SA, AD],

  // Screens only (the server checks these through the rules above)
  settings: [SA, AD, PR],
  "leave.own": [AD, PR, AC], // apply for one's own leave from the office console
  owner: [SA], // backups, admission report, construction, sessions setup, staff records
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: string | undefined, permission: Permission) => !!role && (PERMISSIONS[permission] as readonly string[]).includes(role);

// const can = useCan(); can("fees.collect")
export const useCan = () => {
  const role = useAppSelector((s) => s.auth.user?.role);
  return (permission: Permission) => can(role, permission);
};

// Roles that sign in to the office console (/admin).
export const OFFICE_ROLES = [SA, AD, PR, AC];

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  PRINCIPAL: "Principal",
  ACCOUNTANT: "Accountant",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
};
