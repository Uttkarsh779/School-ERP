import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "./components/Loader";
import Basic from "./components/Layout/basic";
import ProtectedRoute from "./components/Layout/protectedRoute";
import PublicRoute from "./components/Layout/publicRoute";
import Login from "./pages/login/";
import AppShell from "./layouts/AppShell/AppShell";
import "./i18n";

import DashboardPage from "./pages/erp/admin/Dashboard/DashboardPage";
import SessionsPage from "./pages/erp/admin/Sessions/SessionsPage";
import ClassSectionsPage from "./pages/erp/admin/ClassSections/ClassSectionsPage";
import StaffPage from "./pages/erp/admin/Staff/StaffPage";
import StudentsPage from "./pages/erp/admin/Students/StudentsPage";
import StudentDetailPage from "./pages/erp/admin/Students/StudentDetailPage";
import ParentsPage from "./pages/erp/admin/Parents/ParentsPage";
import FamilyProfilePage from "./pages/erp/admin/Parents/FamilyProfilePage";
import AdminAttendancePage from "./pages/erp/admin/Attendance/AdminAttendancePage";
import AdminTimetablePage from "./pages/erp/admin/Timetable/AdminTimetablePage";
import AdminExamsPage from "./pages/erp/admin/Exams/AdminExamsPage";
import AdminFeesPage from "./pages/erp/admin/Fees/AdminFeesPage";
import AdminClassFeeStructureDetailPage from "./pages/erp/admin/Fees/AdminClassFeeStructureDetailPage";
import AdminConcessionsPage from "./pages/erp/admin/Fees/AdminConcessionsPage";
import AdminNoticesPage from "./pages/erp/admin/Notices/AdminNoticesPage";
import AdminTransportPage from "./pages/erp/admin/Transport/AdminTransportPage";

import TeacherDashboardPage from "./pages/erp/teacher/Dashboard/TeacherDashboardPage";
import TeacherAttendancePage from "./pages/erp/teacher/Attendance/TeacherAttendancePage";
import TeacherTimetablePage from "./pages/erp/teacher/Timetable/TeacherTimetablePage";
import TeacherNoticesPage from "./pages/erp/teacher/Notices/TeacherNoticesPage";
import TeacherExamsPage from "./pages/erp/teacher/Exams/TeacherExamsPage";
import TeacherAssignmentsPage from "./pages/erp/teacher/Assignments/TeacherAssignmentsPage";

import StudentProfilePage from "./pages/erp/student/Profile/StudentProfilePage";
import StudentAttendancePage from "./pages/erp/student/Attendance/StudentAttendancePage";
import StudentTimetablePage from "./pages/erp/student/Timetable/StudentTimetablePage";
import StudentReportCardPage from "./pages/erp/student/ReportCard/StudentReportCardPage";
import StudentFeesPage from "./pages/erp/student/Fees/StudentFeesPage";
import StudentNoticesPage from "./pages/erp/student/Notices/StudentNoticesPage";
import StudentAssignmentsPage from "./pages/erp/student/Assignments/StudentAssignmentsPage";

function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Login — redirect away (to the right role's home) if already authenticated */}
        <Route
          element={
            <PublicRoute>
              <Basic />
            </PublicRoute>
          }
        >
          <Route path="/admin/login" element={<Login />} />
        </Route>

        {/* No public website yet (deferred) — send "/" straight to the login screen */}
        <Route path="/" element={<Navigate to="/admin/login" replace />} />

        {/* Admin */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["SUPER_ADMIN", "ADMIN"]}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/sessions" element={<SessionsPage />} />
          <Route path="/admin/class-sections" element={<ClassSectionsPage />} />
          <Route path="/admin/staff" element={<StaffPage />} />
          <Route path="/admin/students" element={<StudentsPage />} />
          <Route path="/admin/students/:id" element={<StudentDetailPage />} />
          <Route path="/admin/parents" element={<ParentsPage />} />
          <Route path="/admin/parents/:id" element={<FamilyProfilePage />} />
          <Route path="/admin/timetable" element={<AdminTimetablePage />} />
          <Route path="/admin/attendance" element={<AdminAttendancePage />} />
          <Route path="/admin/exams" element={<AdminExamsPage />} />
          <Route path="/admin/fees" element={<AdminFeesPage />} />
          <Route path="/admin/fees/structures/:id" element={<AdminClassFeeStructureDetailPage />} />
          <Route path="/admin/fees/concessions" element={<AdminConcessionsPage />} />
          <Route path="/admin/notices" element={<AdminNoticesPage />} />
          <Route path="/admin/transport" element={<AdminTransportPage />} />
          <Route path="/admin/assignments" element={<TeacherAssignmentsPage />} />
        </Route>

        {/* Teacher */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["TEACHER"]}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/teacher" element={<TeacherDashboardPage />} />
          <Route path="/teacher/timetable" element={<TeacherTimetablePage />} />
          <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
          <Route path="/teacher/exams" element={<TeacherExamsPage />} />
          <Route path="/teacher/assignments" element={<TeacherAssignmentsPage />} />
          <Route path="/teacher/notices" element={<TeacherNoticesPage />} />
        </Route>


        {/* Student */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["STUDENT"]}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/student" element={<StudentProfilePage />} />
          <Route path="/student/timetable" element={<StudentTimetablePage />} />
          <Route path="/student/attendance" element={<StudentAttendancePage />} />
          <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
          <Route path="/student/report-card" element={<StudentReportCardPage />} />
          <Route path="/student/fees" element={<StudentFeesPage />} />
          <Route path="/student/notices" element={<StudentNoticesPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
