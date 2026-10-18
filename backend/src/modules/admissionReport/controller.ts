import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import {
  getAdmissionFilterOptions,
  getAdmissionOverview,
  getAdmissionReport,
  parseAdmissionFilters,
} from "./service";

export const getReport = async (req: CustomRequest, res: Response): Promise<void> => {
  const filters = parseAdmissionFilters(req.query as Record<string, unknown>);
  const report = await getAdmissionReport(req.user!, filters);
  res.status(200).json({ success: true, data: report });
};

export const getFilterOptions = async (req: CustomRequest, res: Response): Promise<void> => {
  const options = await getAdmissionFilterOptions(req.user!);
  res.status(200).json({ success: true, data: options });
};

export const getOverview = async (req: CustomRequest, res: Response): Promise<void> => {
  const overview = await getAdmissionOverview(req.user!);
  res.status(200).json({ success: true, data: overview });
};
