import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { findStaffByUserId } from "../staff/service";
import { getStudentByUserId } from "../students/service";
import * as assignmentService from "./service";

export const getAssignments = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    let classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;

    // If student, automatically filter by student's class section
    if (req.user?.role === "STUDENT") {
      const student = await getStudentByUserId(req.user.id);
      if (student) {
        classSectionId = student.classSectionId;
      }
    }

    const assignments = await assignmentService.listAssignments(classSectionId, subjectId);
    res.json({ success: true, data: assignments });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "Failed to fetch assignments" });
  }
};

export const postAssignment = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { title, description, classSectionId, subjectId, dueDate, endDate, attachmentUrl } = req.body;

    if (!title || !description || !classSectionId || !subjectId || !dueDate) {
      res.status(400).json({
        success: false,
        message: "title, description, classSectionId, subjectId, and dueDate are required",
      });
      return;
    }

    let assignedById = 1;
    if (req.user?.role === "TEACHER") {
      const staff = await findStaffByUserId(req.user.id);
      if (staff) {
        assignedById = staff.id;
      }
    }

    const assignment = await assignmentService.createAssignment({
      title,
      description,
      classSectionId: Number(classSectionId),
      subjectId: Number(subjectId),
      assignedById,
      dueDate: new Date(dueDate),
      endDate: endDate ? new Date(endDate) : new Date(dueDate),
      attachmentUrl,
    });

    res.status(201).json({ success: true, data: assignment });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to post assignment" });
  }
};

export const deleteAssignment = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await assignmentService.deleteAssignment(id);
    res.json({ success: true, message: "Assignment deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to delete assignment" });
  }
};
