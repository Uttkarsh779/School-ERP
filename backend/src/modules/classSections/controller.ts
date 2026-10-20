import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import {
  createClassSection,
  deleteClassSection,
  listClassSections,
  listClassSectionsForTeacher,
  updateClassSection,
} from "./service";

// Strip the class teacher's passwordHash before a class section leaves the API.
const sanitize = (classSection: any) => {
  if (!classSection.classTeacher?.user) return classSection;
  const { passwordHash: _passwordHash, ...user } = classSection.classTeacher.user;
  return { ...classSection, classTeacher: { ...classSection.classTeacher, user } };
};

export const getClassSections = async (req: CustomRequest, res: Response): Promise<void> => {
  const sessionId = req.query.sessionId === "all" ? "all" : req.query.sessionId ? Number(req.query.sessionId) : undefined;
  const classSections = await listClassSections(sessionId);
  res.status(200).json({ success: true, data: classSections.map(sanitize) });
};

export const getMyClassSections = async (req: CustomRequest, res: Response): Promise<void> => {
  const staff = await findStaffByUserId(req.user!.id);
  if (!staff) {
    res.status(200).json({ success: true, data: [] });
    return;
  }
  const classSections = await listClassSectionsForTeacher(staff.id);
  // isClassTeacher: only the class teacher marks a class's daily attendance.
  res.status(200).json({ success: true, data: classSections.map((cs: any) => ({ ...cs, isClassTeacher: cs.classTeacherId === staff.id })) });
};

export const postClassSection = async (req: CustomRequest, res: Response): Promise<void> => {
  const { sessionId, className, section, classTeacherId } = req.body;
  if (!sessionId || !className || !section) {
    res
      .status(400)
      .json({ success: false, message: "sessionId, className and section are required" });
    return;
  }

  const classSection = await createClassSection({
    sessionId: Number(sessionId),
    className,
    section,
    classTeacherId: classTeacherId ? Number(classTeacherId) : undefined,
  });
  res.status(201).json({ success: true, data: classSection });
};

export const patchClassSection = async (req: CustomRequest, res: Response): Promise<void> => {
  const { className, section, classTeacherId } = req.body;
  const classSection = await updateClassSection(Number(req.params.id), {
    className,
    section,
    classTeacherId: classTeacherId === undefined ? undefined : classTeacherId === null ? null : Number(classTeacherId),
  });
  res.status(200).json({ success: true, data: classSection });
};

export const deleteClassSectionController = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    await deleteClassSection(Number(req.params.id));
    res.status(200).json({ success: true, message: "Class section deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to delete class section" });
  }
};
