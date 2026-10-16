import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import {
  assignTeacherToSubject,
  createSubject,
  listSubjects,
  listSubjectsForTeacher,
  unassignTeacherFromSubject,
} from "./service";

// Strip passwordHash from each assigned teacher's nested user before a subject leaves the API.
const sanitize = (subject: any) => ({
  ...subject,
  teacherSubjects: subject.teacherSubjects?.map((link: any) => {
    if (!link.staff?.user) return link;
    const { passwordHash: _passwordHash, ...user } = link.staff.user;
    return { ...link, staff: { ...link.staff, user } };
  }),
});

export const getSubjects = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.query.classSectionId);
  if (!classSectionId) {
    res.status(400).json({ success: false, message: "classSectionId query param is required" });
    return;
  }

  let subjects;
  if (req.user?.role === "TEACHER") {
    const staff = await findStaffByUserId(req.user.id);
    if (staff) {
      subjects = await listSubjectsForTeacher(classSectionId, staff.id);
    } else {
      subjects = await listSubjects(classSectionId);
    }
  } else {
    subjects = await listSubjects(classSectionId);
  }

  res.status(200).json({ success: true, data: subjects.map(sanitize) });
};

export const postSubject = async (req: CustomRequest, res: Response): Promise<void> => {
  const { classSectionId, name } = req.body;
  if (!classSectionId || !name) {
    res.status(400).json({ success: false, message: "classSectionId and name are required" });
    return;
  }
  const subject = await createSubject(Number(classSectionId), name);
  res.status(201).json({ success: true, data: sanitize(subject) });
};

export const postAssignTeacher = async (req: CustomRequest, res: Response): Promise<void> => {
  const { staffId } = req.body;
  if (!staffId) {
    res.status(400).json({ success: false, message: "staffId is required" });
    return;
  }
  const subject = await assignTeacherToSubject(Number(req.params.id), Number(staffId));
  res.status(200).json({ success: true, data: sanitize(subject) });
};

export const deleteAssignedTeacher = async (req: CustomRequest, res: Response): Promise<void> => {
  const subject = await unassignTeacherFromSubject(Number(req.params.id));
  res.status(200).json({ success: true, data: sanitize(subject) });
};
