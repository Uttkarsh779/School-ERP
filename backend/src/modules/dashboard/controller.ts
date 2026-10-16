import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { getAdminCounts } from "./service";

export const getAdminDashboard = async (_req: CustomRequest, res: Response): Promise<void> => {
  const counts = await getAdminCounts();
  res.status(200).json({ success: true, data: counts });
};
