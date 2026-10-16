import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithReauth } from "../services/api";

// Single base API instance for all ERP domains (sessions, staff, class sections,
// students, parents, dashboard, attendance, ...). Each domain gets its own file
// that calls erpApi.injectEndpoints — one reducerPath/middleware registration
// covers all of them, instead of one createApi per resource like the legacy
// store/services/*.api.ts files.
export const erpApi = createApi({
  reducerPath: "erpApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Session",
    "ClassSection",
    "Staff",
    "Student",
    "Parent",
    "Dashboard",
    "Attendance",
    "Subject",
    "Timetable",
    "Exam",
    "Fee",
    "Notice",
    "Transport",
    "Concession",
  ],
  endpoints: () => ({}),
});
