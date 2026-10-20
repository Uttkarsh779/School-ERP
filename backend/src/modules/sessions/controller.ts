import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { createSession, listSessions, setCurrentSession } from "./service";
import * as rollover from "./rolloverService";

export const getSessions = async (_req: CustomRequest, res: Response): Promise<void> => {
  const sessions = await listSessions();
  res.status(200).json({ success: true, data: sessions });
};

export const postSession = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) {
    res.status(400).json({ success: false, message: "name, startDate and endDate are required" });
    return;
  }
  if (new Date(endDate) <= new Date(startDate)) {
    res.status(400).json({ success: false, message: "The end date must be after the start date" });
    return;
  }
  if ((await listSessions()).some((s: any) => s.name.trim().toLowerCase() === String(name).trim().toLowerCase())) {
    res.status(409).json({ success: false, message: `A session named "${String(name).trim()}" already exists` });
    return;
  }

  const session = await createSession({
    name: String(name).trim(),
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
  res.status(201).json({ success: true, data: session });
};

export const putCurrentSession = async (req: CustomRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid session id" });
    return;
  }

  await setCurrentSession(id);
  res.status(200).json({ success: true, message: "Session set as current" });
};

// ---- New session setup (rollover) ----

const pairFromQuery = (req: CustomRequest) => ({ from: Number(req.query.from), to: Number(req.query.to) });

export const getRolloverOverview = async (req: CustomRequest, res: Response): Promise<void> => {
  const { from, to } = pairFromQuery(req);
  res.status(200).json({ success: true, data: await rollover.getRolloverOverview(from, to) });
};

export const postCopySetup = async (req: CustomRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: await rollover.copySessionSetup(req.body ?? {}) });
};

export const getPromotionPlan = async (req: CustomRequest, res: Response): Promise<void> => {
  const { from, to } = pairFromQuery(req);
  res.status(200).json({ success: true, data: await rollover.getPromotionPlan(from, to) });
};

export const postPromote = async (req: CustomRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: await rollover.promoteStudents(req.body ?? {}) });
};
