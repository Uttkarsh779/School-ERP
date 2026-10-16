import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { createSession, listSessions, setCurrentSession } from "./service";

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

  const session = await createSession({
    name,
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
