import { Response } from "express";
import { CustomRequest } from "../../middleware/auth";
import * as service from "./service";

export const getConcessionSchemes = async (_req: CustomRequest, res: Response) => {
  const schemes = await service.getConcessionSchemes();
  res.json({ success: true, data: schemes });
};

export const postConcessionScheme = async (req: CustomRequest, res: Response) => {
  const scheme = await service.createConcessionScheme(req.body);
  res.json({ success: true, data: scheme, message: "Concession scheme created successfully" });
};

export const getStudentConcessions = async (req: CustomRequest, res: Response) => {
  const { studentId } = req.params;
  const concessions = await service.getStudentConcessions(Number(studentId));
  res.json({ success: true, data: concessions });
};

export const postAssignStudentConcession = async (req: CustomRequest, res: Response) => {
  const concession = await service.assignStudentConcession(req.body, req.user!.id);
  res.json({ success: true, data: concession, message: "Concession assigned successfully" });
};

export const getAllConcessions = async (_req: CustomRequest, res: Response) => {
  const concessions = await service.getAllConcessions();
  res.json({ success: true, data: concessions });
};

export const endStudentConcession = async (req: CustomRequest, res: Response) => {
  const { id } = req.params;
  const { effectiveDate } = req.body;
  const concession = await service.endStudentConcession(Number(id), new Date(effectiveDate));
  res.json({ success: true, data: concession, message: "Concession ended successfully" });
};
