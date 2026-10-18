import { erpApi } from "./erpApi";
import type { StudentHistory } from "./students.api";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ClassRoster {
  classSection: { id: number; label: string; classTeacher: string | null } | null;
  access: "CLASS_TEACHER" | "SUBJECT";
  latestExam: { id: number; name: string } | null;
  students: Array<{
    id: number;
    name: string;
    rollNo: string;
    admissionNo: string;
    gender: string | null;
    photoUrl: string | null;
    fatherName: string | null;
    contact: string | null;
    attendanceMonth: number | null;
    attendanceOverall: number | null;
    latestExam: { percentage: number | null; status: string; rank: number | null } | null;
  }>;
}

type ExamHistoryRow = StudentHistory["exams"][number];

export interface TeacherStudentOverview {
  access: "CLASS_TEACHER" | "SUBJECT";
  profile: {
    id: number;
    name: string;
    rollNo: string;
    admissionNo: string;
    classSection: string;
    photoUrl: string | null;
    gender: string | null;
    dob: string | null;
    bloodGroup: string | null;
    fatherName: string | null;
    motherName: string | null;
    fatherContact: string | null;
    motherContact: string | null;
    contactNumber: string | null;
    address: string | null;
    guardians: Array<{ name: string; relationship: string | null; contact: string | null; email: string | null }>;
  };
  attendance: StudentHistory["attendance"] | null;
  // Class teachers get full rows; subject teachers get only their subjects (no totals/rank).
  exams: Array<Partial<ExamHistoryRow> & Pick<ExamHistoryRow, "examId" | "examName" | "sessionName" | "className" | "subjects">>;
}

export const teachingApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getClassRoster: builder.query<ClassRoster, number>({
      query: (classSectionId) => ({ url: "teaching/students", params: { classSectionId } }),
      transformResponse: (res: ApiEnvelope<ClassRoster>) => res.data,
      providesTags: ["Student", "Attendance", "Exam"],
    }),
    getTeacherStudentOverview: builder.query<TeacherStudentOverview, number>({
      query: (id) => `teaching/students/${id}`,
      transformResponse: (res: ApiEnvelope<TeacherStudentOverview>) => res.data,
      providesTags: ["Student", "Attendance", "Exam"],
    }),
  }),
});

export const { useGetClassRosterQuery, useGetTeacherStudentOverviewQuery } = teachingApi;
