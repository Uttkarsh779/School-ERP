import type { ComponentProps } from "react";
import type { Icon } from "../../components/ui";

export interface NavEntry {
  label: string;
  path: string;
  icon: ComponentProps<typeof Icon>["name"];
  end?: boolean;
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
  ],
  TEACHER: [
    { label: "My Classes", path: "/teacher", icon: "dashboard", end: true },
    { label: "Timetable", path: "/teacher/timetable", icon: "calendar" },
    { label: "Attendance", path: "/teacher/attendance", icon: "clipboardCheck" },
    { label: "Exams & Marks", path: "/teacher/exams", icon: "graduationCap" },
    { label: "Homework", path: "/teacher/assignments", icon: "clipboardCheck" },
    { label: "Notices", path: "/teacher/notices", icon: "bell" },
  ],

  STUDENT: [
    { label: "Profile", path: "/student", icon: "dashboard", end: true },
    { label: "Timetable", path: "/student/timetable", icon: "calendar" },
    { label: "Attendance", path: "/student/attendance", icon: "clipboardCheck" },
    { label: "Homework", path: "/student/assignments", icon: "clipboardCheck" },
    { label: "Report Card", path: "/student/report-card", icon: "graduationCap" },
    { label: "Fees & Payments", path: "/student/fees", icon: "building" },
    { label: "Notices", path: "/student/notices", icon: "bell" },
  ],
};

navByRole.ADMIN = navByRole.SUPER_ADMIN;

export const getMobilePrimaryNav = (role: string): NavEntry[] => {
  const items = navByRole[role] ?? [];
  if (role === "STUDENT") {
    return items.slice(0, 4);
  }
  if (role === "TEACHER") {
    return [items[0], items[1], items[2], items[4]].filter(Boolean);
  }
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return [items[0], items[4], items[6], items[7]].filter(Boolean);
  }
  return items.slice(0, 4);
};
