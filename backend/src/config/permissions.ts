import { authorizeRoles } from "../middleware/auth";

// Who may do what, in one place. Routes use allow("…"); the screens hide what a role can't
// do from the same table (frontend/src/store/permissions.ts mirrors it — keep both in step).
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
  "students.edit": [SA, AD], // admit, edit, photos, logins, mark left
  "families.view": [SA, AD, PR, AC],
  "families.edit": [SA, AD],
  "staff.view": [SA, AD, PR], // staff create/edit stay Super Admin only
  "leaves.manage": [SA, AD, PR], // every leave request; approve or reject
  certificates: [SA, AD, PR], // TC, bonafide, character … and the register

  "academics.view": [SA, AD, PR, AC], // sessions, classes, subjects (lists)
  "academics.edit": [SA, AD, PR], // classes, subjects, subject teachers, timetable
  "classes.delete": [SA],
  attendance: [SA, AD, PR], // mark and correct any class, reports
  homework: [SA, AD, PR],
  "exams.coordinate": [SA, AD, PR], // plus teachers ticked "Exam coordinator" (exams/permissions.ts)
  "exams.publish": [SA, PR],
  "exams.schemes": [SA, PR], // assessment schemes: weightage, periodic tests, grading

  notices: [SA, AD, PR], // post to everyone, delete any
  calendar: [SA, AD, PR],
  website: [SA, AD, PR],

  "fees.view": [SA, AD, PR, AC], // overview, dues, bills, ledgers, receipts, reports
  "fees.collect": [SA, AD, AC], // take payments, generate bills, extend due dates, late-fee and small-balance waivers
  "fees.configure": [SA], // fee heads, structures, late-fee rules, billing settings, transport fares
  "fees.waive": [SA], // any other waiver or discount
  accounts: [SA, AD, AC], // expense and income vouchers (voiding is Super Admin)
  "transport.view": [SA, AD, PR, AC],
  "transport.edit": [SA, AD],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: string | undefined, permission: Permission) =>
  !!role && (PERMISSIONS[permission] as readonly string[]).includes(role);

// Route guard: allow("fees.collect"), or allow("fees.view", "STUDENT") to add roles whose
// access is narrowed to their own records inside the handler.
export const allow = (permission: Permission, ...extra: string[]) => authorizeRoles([...PERMISSIONS[permission], ...extra]);

// Office roles see school-wide records on every route they can reach (teachers, students
// and parents are narrowed to their own classes / child).
export const SCHOOL_WIDE = [SA, AD, PR, AC];
export const isSchoolWide = (role: string | undefined) => !!role && SCHOOL_WIDE.includes(role);
