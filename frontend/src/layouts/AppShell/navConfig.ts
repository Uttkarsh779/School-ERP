import type { ComponentProps } from "react";
import type { Icon } from "../../components/ui";
import { can, OFFICE_ROLES, type Permission } from "../../store/permissions";

export interface NavEntry {
  label: string;
  path: string;
  icon: ComponentProps<typeof Icon>["name"];
  end?: boolean;
  perm?: Permission; // office console: shown only to roles that have it (store/permissions.ts)
  group?: string; // menu heading this item sits under
}

// Office console (Super Admin, Admin, Principal, Accountant): one menu, each role sees the items
// its permissions allow. Pages reached from inside another page aren't listed: Academic Sessions
// (Settings), Certificate Register (Students), Concessions (Fees), Construction (Accounts).
const OFFICE_NAV: NavEntry[] = [
  { label: "Dashboard", path: "/admin", icon: "dashboard", end: true, perm: "dashboard" },

  { label: "Students", path: "/admin/students", icon: "graduationCap", group: "People", perm: "students.view" },
  { label: "Staff", path: "/admin/staff", icon: "users", group: "People", perm: "staff.view" },
  { label: "Leave Requests", path: "/admin/leaves", icon: "calendar", group: "People", perm: "leaves.manage" },
  { label: "Admission Report", path: "/admin/admission-report", icon: "fileText", group: "People", perm: "owner" },

  { label: "Class Sections", path: "/admin/class-sections", icon: "layers", group: "Academics", perm: "academics.edit" },
  { label: "Timetable", path: "/admin/timetable", icon: "calendar", group: "Academics", perm: "academics.edit" },
  { label: "Attendance", path: "/admin/attendance", icon: "clipboardCheck", group: "Academics", perm: "attendance" },
  { label: "Exams", path: "/admin/exams", icon: "graduationCap", group: "Academics", perm: "exams.coordinate" },
  { label: "Homework", path: "/admin/assignments", icon: "clipboardCheck", group: "Academics", perm: "homework" },

  { label: "Fees", path: "/admin/fees", icon: "building", group: "Finance", perm: "fees.view" },
  { label: "Expenses & Accounts", path: "/admin/accounts", icon: "wallet", group: "Finance", perm: "accounts" },

  { label: "Notices", path: "/admin/notices", icon: "bell", group: "Communication", perm: "dashboard" },
  { label: "School Calendar", path: "/admin/calendar", icon: "calendar", group: "Communication", perm: "dashboard" },
  { label: "My Leave", path: "/admin/my-leave", icon: "calendar", group: "Communication", perm: "leave.own" },

  { label: "Transport", path: "/admin/transport", icon: "building", group: "School", perm: "transport.edit" },
  { label: "Inventory", path: "/admin/inventory", icon: "box", group: "School", perm: "inventory.view" },
  { label: "Website", path: "/admin/cms", icon: "globe", group: "School", perm: "website" },
  { label: "Settings", path: "/admin/settings", icon: "settings", group: "School", perm: "settings" },
];

export const navByRole: Record<string, NavEntry[]> = {
  TEACHER: [
    { label: "My Classes", path: "/teacher", icon: "dashboard", end: true },
    { label: "My Students", path: "/teacher/students", icon: "users" },
    { label: "Timetable", path: "/teacher/timetable", icon: "calendar" },
    { label: "Attendance", path: "/teacher/attendance", icon: "clipboardCheck" },
    { label: "Exams & Marks", path: "/teacher/exams", icon: "graduationCap" },
    { label: "Homework", path: "/teacher/assignments", icon: "clipboardCheck" },
    { label: "Leave", path: "/teacher/leave", icon: "calendar" },
    { label: "School Calendar", path: "/teacher/calendar", icon: "calendar" },
    { label: "Notices", path: "/teacher/notices", icon: "bell" },
    { label: "My Profile", path: "/teacher/profile", icon: "users" },
  ],

  STUDENT: [
    { label: "Dashboard", path: "/student", icon: "dashboard", end: true },
    { label: "My Profile", path: "/student/profile", icon: "users" },
    { label: "Timetable", path: "/student/timetable", icon: "calendar" },
    { label: "Attendance", path: "/student/attendance", icon: "clipboardCheck" },
    { label: "Homework", path: "/student/assignments", icon: "clipboardCheck" },
    { label: "Report Card", path: "/student/report-card", icon: "graduationCap" },
    { label: "Fees & Payments", path: "/student/fees", icon: "building" },
    { label: "Leave", path: "/student/leave", icon: "calendar" },
    { label: "School Calendar", path: "/student/calendar", icon: "calendar" },
    { label: "Notices", path: "/student/notices", icon: "bell" },
  ],
};

for (const role of OFFICE_ROLES) navByRole[role] = OFFICE_NAV.filter((item) => !item.perm || can(role, item.perm));

// Bottom bar on phones: four items, picked by path so adding menu items never reshuffles it.
const MOBILE: Record<string, string[]> = {
  SUPER_ADMIN: ["/admin", "/admin/students", "/admin/attendance", "/admin/fees"],
  ADMIN: ["/admin", "/admin/students", "/admin/attendance", "/admin/fees"],
  PRINCIPAL: ["/admin", "/admin/students", "/admin/attendance", "/admin/exams"],
  ACCOUNTANT: ["/admin", "/admin/fees", "/admin/students", "/admin/accounts"],
  TEACHER: ["/teacher", "/teacher/attendance", "/teacher/students", "/teacher/assignments"],
};

export const getMobilePrimaryNav = (role: string): NavEntry[] => {
  const items = navByRole[role] ?? [];
  const want = MOBILE[role];
  if (!want) return items.slice(0, 4);
  return want.map((p) => items.find((i) => i.path === p)).filter((i): i is NavEntry => Boolean(i));
};

export const profilePathByRole: Record<string, string> = {
  SUPER_ADMIN: "/admin/profile",
  ADMIN: "/admin/profile",
  PRINCIPAL: "/admin/profile",
  ACCOUNTANT: "/admin/profile",
  TEACHER: "/teacher/profile",
  STUDENT: "/student/profile",
};

// Pages opened from inside other pages, with the permission each needs (App.tsx guards them
// the same way).
const INNER_PAGES: Array<{ path: string; perm: Permission }> = [
  { path: "/admin/sessions", perm: "academics.view" },
  { path: "/admin/sessions/setup", perm: "owner" },
  { path: "/admin/certificates", perm: "certificates" },
  { path: "/admin/fees/concessions", perm: "fees.view" },
  { path: "/admin/construction", perm: "owner" },
];

// Whether a role may open an office page (used to hide shortcuts that lead nowhere).
export const canOpenPath = (role: string | undefined, path: string) => {
  const bare = path.split("?")[0];
  const match = [...OFFICE_NAV, ...INNER_PAGES]
    .filter((e) => bare === e.path || bare.startsWith(`${e.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return !match?.perm || can(role, match.perm);
};
