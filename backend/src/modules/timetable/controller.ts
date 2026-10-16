import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";
import { getStudentByUserId } from "../students/service";
import { getParentByUserId } from "../parents/service";
import {
  deleteTimetableSlot,
  listTimetableForClass,
  listTimetableForStaff,
  upsertTimetableSlot,
} from "./service";

// SUPER_ADMIN/ADMIN see any class; TEACHER only their own class; STUDENT only their
// own class; PARENT only a linked child's class.
const canViewClassTimetable = async (req: CustomRequest, classSectionId: number): Promise<boolean> => {
  const role = req.user?.role;
  if (role === "SUPER_ADMIN" || role === "ADMIN") return true;
  if (!req.user) return false;

  if (role === "TEACHER") {
    const staff = await findStaffByUserId(req.user.id);
    return !!staff && (await isClassTeacherOfSection(staff.id, classSectionId));
  }
  if (role === "STUDENT") {
    const student = await getStudentByUserId(req.user.id);
    return student?.classSectionId === classSectionId;
  }
  if (role === "PARENT") {
    const parent = await getParentByUserId(req.user.id);
    return !!parent?.children.some((link: any) => link.student?.classSectionId === classSectionId);
  }
  return false;
};

export const getClassTimetable = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.query.classSectionId);
  if (!classSectionId) {
    res.status(400).json({ success: false, message: "classSectionId query param is required" });
    return;
  }
  if (!(await canViewClassTimetable(req, classSectionId))) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const slots = await listTimetableForClass(classSectionId);
  res.status(200).json({ success: true, data: slots });
};

export const getMyTimetable = async (req: CustomRequest, res: Response): Promise<void> => {
  const staff = await findStaffByUserId(req.user!.id);
  if (!staff) {
    res.status(200).json({ success: true, data: [] });
    return;
  }
  const slots = await listTimetableForStaff(staff.id);
  res.status(200).json({ success: true, data: slots });
};

export const postTimetableSlot = async (req: CustomRequest, res: Response): Promise<void> => {
  const { classSectionId, dayOfWeek, periodNumber, subjectId, staffId, room } = req.body;
  if (!classSectionId || !dayOfWeek || !periodNumber) {
    res
      .status(400)
      .json({ success: false, message: "classSectionId, dayOfWeek and periodNumber are required" });
    return;
  }

  try {
    const slot = await upsertTimetableSlot({
      classSectionId: Number(classSectionId),
      dayOfWeek: Number(dayOfWeek),
      periodNumber: Number(periodNumber),
      subjectId: subjectId ? Number(subjectId) : null,
      staffId: staffId ? Number(staffId) : null,
      room: room || null,
    });
    res.status(200).json({ success: true, data: slot });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || "Failed to save timetable slot" });
  }
};

export const deleteSlot = async (req: CustomRequest, res: Response): Promise<void> => {
  await deleteTimetableSlot(Number(req.params.id));
  res.status(200).json({ success: true, message: "Slot cleared" });
};
