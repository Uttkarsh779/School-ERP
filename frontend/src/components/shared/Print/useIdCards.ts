import { useGetSessionsQuery } from "../../../store/api/sessions.api";
import { printStaffIdCards, printStudentIdCards } from "./idCardPrint";
import { usePrintSchool } from "./usePrintSchool";

const STAFF_TITLES: Record<string, string> = {
  TEACHER: "Teacher",
  PRINCIPAL: "Principal",
  VICE_PRINCIPAL: "Vice Principal",
  COORDINATOR: "Coordinator",
  GUARD: "Security Guard",
  DRIVER: "Driver",
  CLEANING_STAFF: "Cleaning Staff",
  HOUSEKEEPING_STAFF: "Housekeeping Staff",
  OFFICE_STAFF: "Office Staff",
  ADMIN_STAFF: "Admin Staff",
  SUPPORT_STAFF: "Support Staff",
  OTHER: "Staff",
};

// Prints ID cards with the school's letterhead details and the session name. A student's
// card shows the session their class belongs to; staff cards show the current session.
export const useIdCards = () => {
  const { data: sessions } = useGetSessionsQuery();
  const school = usePrintSchool()("idCard");
  const sessionName = (id?: number) => (sessions ?? []).find((s) => (id ? s.id === id : s.isCurrent))?.name ?? null;

  const printStudents = (students: IStudent[]) =>
    printStudentIdCards(
      students.map((s) => ({
        name: s.name,
        photoUrl: s.photoUrl,
        admissionNo: s.admissionNo,
        rollNo: s.rollNo,
        className: s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : null,
        dob: s.dob,
        bloodGroup: s.bloodGroup,
        fatherName: s.fatherName,
        phone: s.fatherContact || s.motherContact || s.contactNumber,
        address: s.address,
      })),
      school,
      sessionName(students[0]?.classSection?.sessionId)
    );

  const printStaff = (staff: IStaff[]) =>
    printStaffIdCards(
      staff.map((s) => ({
        name: s.user.name ?? "",
        photoUrl: s.photoUrl,
        staffId: s.employeeCode ?? `EMP-${String(s.id).padStart(4, "0")}`,
        bloodGroup: s.bloodGroup,
        designation: STAFF_TITLES[s.staffCategory ?? "TEACHER"] ?? "Staff",
        phone: s.contact,
        // Placeholder logins for staff without email (driver.123@school.internal) aren't printed.
        email: s.user.email && !s.user.email.endsWith("@school.internal") ? s.user.email : null,
        address: s.address,
      })),
      school,
      sessionName()
    );

  return { printStudents, printStaff };
};
