import type { ComponentProps } from "react";
import type { Icon } from "../../components/ui";

export interface NavEntry {
  label: string;
  path: string;
  icon: ComponentProps<typeof Icon>["name"];
  end?: boolean;
  superAdminOnly?: boolean; // hidden from ADMIN (see navByRole.ADMIN below)
}

export const navByRole: Record<string, NavEntry[]> = {
  SUPER_ADMIN: [
    { label: "Dashboard", path: "/admin", icon: "dashboard", end: true },
    { label: "Academic Sessions", path: "/admin/sessions", icon: "calendar" },
    { label: "Class Sections", path: "/admin/class-sections", icon: "layers" },
    { label: "Staff", path: "/admin/staff", icon: "users" },
    { label: "Students", path: "/admin/students", icon: "graduationCap" },
    { label: "Families & Parents", path: "/admin/parents", icon: "familyCheck" },
    { label: "Timetable", path: "/admin/timetable", icon: "calendar" },
    { label: "Attendance", path: "/admin/attendance", icon: "clipboardCheck" },
    { label: "Exams", path: "/admin/exams", icon: "graduationCap" },
    { label: "Fees", path: "/admin/fees", icon: "building" },
    { label: "Concessions", path: "/admin/fees/concessions", icon: "badge" },
    { label: "Homework & Tasks", path: "/admin/assignments", icon: "clipboardCheck" },
    { label: "Notices", path: "/admin/notices", icon: "bell" },
    { label: "Transport", path: "/admin/transport", icon: "building" },
    { label: "Leave Requests", path: "/admin/leaves", icon: "calendar" },
    { label: "Admission Report", path: "/admin/admission-report", icon: "fileText", superAdminOnly: true },
    { label: "Construction Expenses", path: "/admin/construction", icon: "hardHat", superAdminOnly: true },
    { label: "Website CMS", path: "/admin/cms", icon: "globe" },
  ],
  TEACHER: [
    { label: "My Classes", path: "/teacher", icon: "dashboard", end: true },
    { label: "My Students", path: "/teacher/students", icon: "users" },
    { label: "Timetable", path: "/teacher/timetable", icon: "calendar" },
    { label: "Attendance", path: "/teacher/attendance", icon: "clipboardCheck" },
    { label: "Exams & Marks", path: "/teacher/exams", icon: "graduationCap" },
    { label: "Homework", path: "/teacher/assignments", icon: "clipboardCheck" },
    { label: "Leave", path: "/teacher/leave", icon: "calendar" },
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
    { label: "Notices", path: "/student/notices", icon: "bell" },
  ],
};

navByRole.ADMIN = navByRole.SUPER_ADMIN.filter((item) => !item.superAdminOnly);

export const getMobilePrimaryNav = (role: string): NavEntry[] => {
  const items = navByRole[role] ?? [];
  if (role === "STUDENT") {
    return items.slice(0, 4);
  }
  if (role === "TEACHER") {
    // Picked by path so adding menu items never reshuffles the mobile bar.
    const want = ["/teacher", "/teacher/attendance", "/teacher/students", "/teacher/assignments"];
    return want.map((p) => items.find((i) => i.path === p)).filter((i): i is NavEntry => Boolean(i));
  }
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return [items[0], items[4], items[6], items[7]].filter(Boolean);
  }
  return items.slice(0, 4);
};

export const profilePathByRole: Record<string, string> = {
  SUPER_ADMIN: "/admin/profile",
  ADMIN: "/admin/profile",
  TEACHER: "/teacher/profile",
  STUDENT: "/student/profile",
};
