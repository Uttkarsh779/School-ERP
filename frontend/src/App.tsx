import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Loader from "./components/Loader";
import Basic from "./components/Layout/basic";
import ProtectedRoute, { RequirePermission } from "./components/Layout/protectedRoute";
import { OFFICE_ROLES, useCan } from "./store/permissions";
import MyLeavePage from "./pages/erp/admin/Leaves/MyLeavePage";
import PublicRoute from "./components/Layout/publicRoute";
import Login from "./pages/login/";
import AppShell from "./layouts/AppShell/AppShell";
import "./i18n";

import DashboardPage from "./pages/erp/admin/Dashboard/DashboardPage";
import SessionsPage from "./pages/erp/admin/Sessions/SessionsPage";
import SessionSetupPage from "./pages/erp/admin/Sessions/SessionSetupPage";
import ClassSectionsPage from "./pages/erp/admin/ClassSections/ClassSectionsPage";
import StaffPage from "./pages/erp/admin/Staff/StaffPage";
import StudentsPage from "./pages/erp/admin/Students/StudentsPage";
import StudentDetailPage from "./pages/erp/admin/Students/StudentDetailPage";
import AdminAttendancePage from "./pages/erp/admin/Attendance/AdminAttendancePage";
import AdminTimetablePage from "./pages/erp/admin/Timetable/AdminTimetablePage";
import AdminExamsPage from "./pages/erp/admin/Exams/AdminExamsPage";
import AdminFeesPage from "./pages/erp/admin/Fees/AdminFeesPage";
import AdminClassFeeStructureDetailPage from "./pages/erp/admin/Fees/AdminClassFeeStructureDetailPage";
import AdminConcessionsPage from "./pages/erp/admin/Fees/AdminConcessionsPage";
import AdminNoticesPage from "./pages/erp/admin/Notices/AdminNoticesPage";
import AdminTransportPage from "./pages/erp/admin/Transport/AdminTransportPage";
import AdminCmsPage from "./pages/erp/admin/Cms/AdminCmsPage";
import AdmissionReportPage from "./pages/erp/admin/AdmissionReport/AdmissionReportPage";
import ConstructionExpensePage from "./pages/erp/admin/Construction/ConstructionExpensePage";
import AccountsPage from "./pages/erp/admin/Accounts/AccountsPage";
import InventoryPage from "./pages/erp/admin/Inventory/InventoryPage";
import SchoolCalendar from "./components/shared/SchoolCalendar/SchoolCalendar";
import PublicLayout from "./pages/public/PublicLayout";
import HomePage from "./pages/public/HomePage";
import AboutPage from "./pages/public/AboutPage";
import AcademicsPage from "./pages/public/AcademicsPage";
import CampusPage from "./pages/public/CampusPage";
import GalleryPage from "./pages/public/GalleryPage";
import AdmissionsPage from "./pages/public/AdmissionsPage";
import NoticesPage from "./pages/public/NoticesPage";
import ContactPage from "./pages/public/ContactPage";
import PrivacyPage from "./pages/public/PrivacyPage";
import ConsentGate from "./components/shared/Privacy/ConsentGate";

import TeacherDashboardPage from "./pages/erp/teacher/Dashboard/TeacherDashboardPage";
import TeacherAttendancePage from "./pages/erp/teacher/Attendance/TeacherAttendancePage";
import TeacherTimetablePage from "./pages/erp/teacher/Timetable/TeacherTimetablePage";
import TeacherNoticesPage from "./pages/erp/teacher/Notices/TeacherNoticesPage";
import TeacherExamsPage from "./pages/erp/teacher/Exams/TeacherExamsPage";
import TeacherAssignmentsPage from "./pages/erp/teacher/Assignments/TeacherAssignmentsPage";

import StudentProfilePage from "./pages/erp/student/Profile/StudentProfilePage";
import StudentDashboardPage from "./pages/erp/student/Dashboard/StudentDashboardPage";
import StudentLeavePage from "./pages/erp/student/Leave/StudentLeavePage";
import MyStudentsPage from "./pages/erp/teacher/Students/MyStudentsPage";
import TeacherLeavePage from "./pages/erp/teacher/Leave/TeacherLeavePage";
import AdminLeavesPage from "./pages/erp/admin/Leaves/AdminLeavesPage";
import MyProfilePage from "./components/shared/Account/MyProfilePage";
import StudentAttendancePage from "./pages/erp/student/Attendance/StudentAttendancePage";
import StudentTimetablePage from "./pages/erp/student/Timetable/StudentTimetablePage";
import StudentReportCardPage from "./pages/erp/student/ReportCard/StudentReportCardPage";
import SettingsPage from "./pages/erp/admin/Settings/SettingsPage";
import CertificateRegisterPage from "./pages/erp/admin/Students/certificates/CertificateRegisterPage";
import StudentFeesPage from "./pages/erp/student/Fees/StudentFeesPage";
import StudentNoticesPage from "./pages/erp/student/Notices/StudentNoticesPage";
import StudentAssignmentsPage from "./pages/erp/student/Assignments/StudentAssignmentsPage";

// The office calendar: everyone in the office console sees it; managing it needs "calendar".
const OfficeCalendar = () => <SchoolCalendar canManage={useCan()("calendar")} who="ALL" />;

function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Public school website — shared header/footer layout */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/academics" element={<AcademicsPage />} />
          <Route path="/campus" element={<CampusPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/admissions" element={<AdmissionsPage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/facilities" element={<Navigate to="/campus" replace />} />
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />

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

        {/* Office console: Super Admin, Admin, Principal, Accountant — each page needs its permission */}
        <Route
          element={
            <ProtectedRoute allowedRoles={OFFICE_ROLES}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<RequirePermission perm="dashboard"><DashboardPage /></RequirePermission>} />
          <Route path="/admin/sessions" element={<RequirePermission perm="academics.view"><SessionsPage /></RequirePermission>} />
          <Route path="/admin/sessions/setup" element={<RequirePermission perm="owner"><SessionSetupPage /></RequirePermission>} />
          <Route path="/admin/class-sections" element={<RequirePermission perm="academics.edit"><ClassSectionsPage /></RequirePermission>} />
          <Route path="/admin/staff" element={<RequirePermission perm="staff.view"><StaffPage /></RequirePermission>} />
          <Route path="/admin/students" element={<RequirePermission perm="students.view"><StudentsPage /></RequirePermission>} />
          <Route path="/admin/students/:id" element={<RequirePermission perm="students.view"><StudentDetailPage /></RequirePermission>} />
          <Route path="/admin/timetable" element={<RequirePermission perm="academics.edit"><AdminTimetablePage /></RequirePermission>} />
          <Route path="/admin/attendance" element={<RequirePermission perm="attendance"><AdminAttendancePage /></RequirePermission>} />
          <Route path="/admin/exams" element={<RequirePermission perm="exams.coordinate"><AdminExamsPage /></RequirePermission>} />
          <Route path="/admin/fees" element={<RequirePermission perm="fees.view"><AdminFeesPage /></RequirePermission>} />
          <Route path="/admin/fees/structures/:id" element={<RequirePermission perm="fees.view"><AdminClassFeeStructureDetailPage /></RequirePermission>} />
          <Route path="/admin/fees/concessions" element={<RequirePermission perm="fees.view"><AdminConcessionsPage /></RequirePermission>} />
          <Route path="/admin/notices" element={<RequirePermission perm="dashboard"><AdminNoticesPage /></RequirePermission>} />
          <Route path="/admin/transport" element={<RequirePermission perm="transport.edit"><AdminTransportPage /></RequirePermission>} />
          <Route path="/admin/assignments" element={<RequirePermission perm="homework"><TeacherAssignmentsPage /></RequirePermission>} />
          <Route path="/admin/cms" element={<RequirePermission perm="website"><AdminCmsPage /></RequirePermission>} />
          <Route path="/admin/leaves" element={<RequirePermission perm="leaves.manage"><AdminLeavesPage /></RequirePermission>} />
          <Route path="/admin/my-leave" element={<RequirePermission perm="leave.own"><MyLeavePage /></RequirePermission>} />
          <Route path="/admin/accounts" element={<RequirePermission perm="accounts"><AccountsPage /></RequirePermission>} />
          <Route path="/admin/inventory" element={<RequirePermission perm="inventory.view"><InventoryPage /></RequirePermission>} />
          <Route path="/admin/calendar" element={<RequirePermission perm="dashboard"><OfficeCalendar /></RequirePermission>} />
          <Route path="/admin/settings" element={<RequirePermission perm="settings"><SettingsPage /></RequirePermission>} />
          <Route path="/admin/certificates" element={<RequirePermission perm="certificates"><CertificateRegisterPage /></RequirePermission>} />
          <Route path="/admin/admission-report" element={<RequirePermission perm="owner"><AdmissionReportPage /></RequirePermission>} />
          <Route path="/admin/construction" element={<RequirePermission perm="owner"><ConstructionExpensePage /></RequirePermission>} />
          <Route path="/admin/profile" element={<MyProfilePage />} />
          <Route path="/admin/account" element={<Navigate to="/admin/profile" replace />} />
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
          {/* Exam coordinator teachers: the same planner admins use (checked on the server). */}
          <Route path="/teacher/exam-planner" element={<AdminExamsPage />} />
          <Route path="/teacher/assignments" element={<TeacherAssignmentsPage />} />
          <Route path="/teacher/notices" element={<TeacherNoticesPage />} />
          <Route path="/teacher/students" element={<MyStudentsPage />} />
          <Route path="/teacher/leave" element={<TeacherLeavePage />} />
          <Route path="/teacher/calendar" element={<SchoolCalendar canManage={false} who="STAFF" />} />
          <Route path="/teacher/profile" element={<MyProfilePage />} />
        </Route>


        {/* Student */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["STUDENT"]}>
              <ConsentGate>
                <AppShell />
              </ConsentGate>
            </ProtectedRoute>
          }
        >
          <Route path="/student" element={<StudentDashboardPage />} />
          <Route path="/student/profile" element={<StudentProfilePage />} />
          <Route path="/student/timetable" element={<StudentTimetablePage />} />
          <Route path="/student/attendance" element={<StudentAttendancePage />} />
          <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
          <Route path="/student/report-card" element={<StudentReportCardPage />} />
          <Route path="/student/fees" element={<StudentFeesPage />} />
          <Route path="/student/notices" element={<StudentNoticesPage />} />
          <Route path="/student/leave" element={<StudentLeavePage />} />
          <Route path="/student/calendar" element={<SchoolCalendar canManage={false} who="STUDENTS" />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
