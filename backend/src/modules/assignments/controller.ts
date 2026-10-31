import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { httpError } from "../../utils/httpError";
import * as assignmentService from "./service";
import { onHomeworkCreated } from "../notifications/events";

const idOf = (v: unknown, field = "id") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `Invalid ${field}`);
  return n;
};

export const getAssignments = async (req: CustomRequest, res: Response): Promise<void> => {
  const data = await assignmentService.listAssignments(req.user!, {
    classSectionId: req.query.classSectionId ? Number(req.query.classSectionId) : undefined,
    subjectId: req.query.subjectId ? Number(req.query.subjectId) : undefined,
  });
  res.json({ success: true, data });
};

export const postAssignment = async (req: CustomRequest, res: Response): Promise<void> => {
  const assignment = await assignmentService.createAssignment(req.user!, req.body ?? {});
  onHomeworkCreated(assignment.id);
  res.status(201).json({ success: true, data: assignment });
};

export const putAssignment = async (req: CustomRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await assignmentService.updateAssignment(req.user!, idOf(req.params.id), req.body ?? {}) });
};

export const deleteAssignment = async (req: CustomRequest, res: Response): Promise<void> => {
  await assignmentService.deleteAssignment(req.user!, idOf(req.params.id));
  res.json({ success: true, message: "Homework deleted" });
};

export const getSubmissions = async (req: CustomRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: await assignmentService.listSubmissions(req.user!, idOf(req.params.id)) });
};

export const postSubmission = async (req: CustomRequest, res: Response): Promise<void> => {
  res.status(201).json({
    success: true,
    message: "Homework submitted",
    data: await assignmentService.submitHomework(req.user!, idOf(req.params.id), req.body ?? {}),
  });
};

export const patchSubmissionReview = async (req: CustomRequest, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: await assignmentService.reviewSubmission(req.user!, idOf(req.params.id), idOf(req.params.studentId, "student"), req.body ?? {}),
  });
};
