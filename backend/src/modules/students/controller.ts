import type { Response } from "express";
import { parse } from "csv-parse/sync";
import type { CustomRequest } from "../../middleware/auth";
import { Gender, StudentCategory } from "../../generated/prisma/enums";
import { getCurrentSession } from "../sessions/service";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";
import { isParentLinkedToStudent } from "../parents/service";
import { hashPassword } from "../../utils/password";
import {
  createStudent,
  findClassSection,
  getStudentById,
  getStudentByUserId,
  listStudents,
  setStudentActive,
  setStudentCredentials,
  updateStudent,
  type StudentProfileFields,
} from "./service";

// Pulls the optional profile fields (family/govt-ID/address details) out of a request
// body, converting dates and validating the two enum fields. Shared by the single-create,
// update, and CSV-import paths so they all accept/validate the same set of columns.
const parseProfileFields = (body: Record<string, unknown>): StudentProfileFields => {
  const fields: StudentProfileFields = {
    bloodGroup: body.bloodGroup as string | undefined,
    photoUrl: body.photoUrl as string | undefined,
    fatherName: body.fatherName as string | undefined,
    fatherContact: body.fatherContact as string | undefined,
    motherName: body.motherName as string | undefined,
    motherContact: body.motherContact as string | undefined,
    aadharNumber: body.aadharNumber as string | undefined,
    apaarId: body.apaarId as string | undefined,
    address: body.address as string | undefined,
    contactNumber: body.contactNumber as string | undefined,
    nationality: body.nationality as string | undefined,
    previousSchool: body.previousSchool as string | undefined,
  };

  if (body.dob) fields.dob = new Date(body.dob as string);
  if (body.admissionDate) fields.admissionDate = new Date(body.admissionDate as string);

  if (body.gender) {
    if (!Object.values(Gender).includes(body.gender as Gender)) {
      throw new Error(`Invalid gender "${body.gender}"`);
    }
    fields.gender = body.gender as Gender;
  }

  if (body.category) {
    if (!Object.values(StudentCategory).includes(body.category as StudentCategory)) {
      throw new Error(`Invalid category "${body.category}"`);
    }
    fields.category = body.category as StudentCategory;
  }

  return fields;
};

// SUPER_ADMIN/ADMIN see everything. A TEACHER may only list students of a class section
// they're the assigned class teacher of (classSectionId is required for them). PARENT has
// no legitimate "list all students" use case — they get their children via /parents/me.
export const getStudents = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;
  const role = req.user!.role;

  if (role === "TEACHER") {
    if (!classSectionId) {
      res.status(400).json({ success: false, message: "classSectionId is required" });
      return;
    }
    const staff = await findStaffByUserId(req.user!.id);
    if (!staff || !(await isClassTeacherOfSection(staff.id, classSectionId))) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  } else if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  const students = await listStudents(classSectionId);
  res.status(200).json({ success: true, data: students });
};

export const getMyStudentProfile = async (req: CustomRequest, res: Response): Promise<void> => {
  const student = await getStudentByUserId(req.user!.id);
  if (!student) {
    res.status(404).json({ success: false, message: "No student profile linked to this account" });
    return;
  }
  res.status(200).json({ success: true, data: student });
};

export const getStudent = async (req: CustomRequest, res: Response): Promise<void> => {
  const student = await getStudentById(Number(req.params.id));
  if (!student) {
    res.status(404).json({ success: false, message: "Student not found" });
    return;
  }

  const role = req.user!.role;
  if (role === "TEACHER") {
    const staff = await findStaffByUserId(req.user!.id);
    if (!staff || !(await isClassTeacherOfSection(staff.id, student.classSectionId))) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  } else if (role === "PARENT") {
    if (!(await isParentLinkedToStudent(req.user!.id, student.id))) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  } else if (role === "STUDENT") {
    if (student.userId !== req.user!.id) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  }
  // SUPER_ADMIN/ADMIN fall through with no extra check

  res.status(200).json({ success: true, data: student });
};

export const postStudent = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, rollNo, classSectionId, admissionNo } = req.body;
  if (!name || !rollNo || !classSectionId || !admissionNo) {
    res
      .status(400)
      .json({ success: false, message: "name, rollNo, classSectionId and admissionNo are required" });
    return;
  }

  let profileFields: StudentProfileFields;
  try {
    profileFields = parseProfileFields(req.body);
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
    return;
  }

  const student = await createStudent({
    name,
    rollNo,
    classSectionId: Number(classSectionId),
    admissionNo,
    ...profileFields,
  });
  res.status(201).json({ success: true, data: student });
};

export const patchStudent = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, rollNo, classSectionId, admissionNo } = req.body;

  let profileFields: StudentProfileFields;
  try {
    profileFields = parseProfileFields(req.body);
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
    return;
  }

  const student = await updateStudent(Number(req.params.id), {
    name,
    rollNo,
    classSectionId: classSectionId ? Number(classSectionId) : undefined,
    admissionNo,
    ...profileFields,
  });
  res.status(200).json({ success: true, data: student });
};

// Admin-only: creates or resets a student's login. email is optional — if omitted, a
// synthetic one is generated so the student still logs in with their admission number.
export const postSetStudentCredentials = async (req: CustomRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!password) {
    res.status(400).json({ success: false, message: "password is required" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await setStudentCredentials(Number(req.params.id), { email, passwordHash });
  res.status(200).json({
    success: true,
    message: "Student login updated",
    data: { email: user.email },
  });
};

export const patchStudentActive = async (req: CustomRequest, res: Response): Promise<void> => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    res.status(400).json({ success: false, message: "isActive (boolean) is required" });
    return;
  }
  const student = await setStudentActive(Number(req.params.id), isActive);
  res.status(200).json({ success: true, data: student });
};

// Bulk CSV import: required columns are name, rollNo, className, section, admissionNo.
// Optional columns: dob, gender, bloodGroup, fatherName, fatherContact, motherName,
// motherContact, aadharNumber, apaarId, category, address, contactNumber, nationality,
// previousSchool, admissionDate. className/section are resolved against the current
// academic session — friendlier for office staff than requiring internal classSectionId
// numbers. Each row is processed independently so one bad row doesn't sink the whole
// batch; every row's outcome is reported back so the admin can fix and re-upload just
// the failures.
export const postStudentsBulkImport = async (req: CustomRequest, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "CSV file is required (field name: file)" });
    return;
  }

  const currentSession = await getCurrentSession();
  if (!currentSession) {
    res
      .status(400)
      .json({ success: false, message: "No current academic session is set — set one before importing" });
    return;
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (error) {
    res.status(400).json({ success: false, message: "Could not parse CSV file" });
    return;
  }

  const results: Array<{ row: number; success: boolean; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    try {
      if (!row.name || !row.rollNo || !row.className || !row.section || !row.admissionNo) {
        results.push({ row: rowNumber, success: false, message: "Missing required column(s)" });
        continue;
      }

      const classSection = await findClassSection(row.className, row.section, currentSession.id);
      if (!classSection) {
        results.push({
          row: rowNumber,
          success: false,
          message: `Class section "${row.className} ${row.section}" not found in the current session`,
        });
        continue;
      }

      const profileFields = parseProfileFields(row);
      await createStudent({
        name: row.name,
        rollNo: row.rollNo,
        classSectionId: classSection.id,
        admissionNo: row.admissionNo,
        ...profileFields,
      });
      results.push({ row: rowNumber, success: true, message: "Imported" });
    } catch (error) {
      const message =
        error instanceof Error && error.message.startsWith("Invalid")
          ? error.message
          : "Roll number or admission number already exists";
      results.push({ row: rowNumber, success: false, message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.status(200).json({
    success: true,
    message: `Imported ${successCount}/${rows.length} students`,
    data: results,
  });
};
