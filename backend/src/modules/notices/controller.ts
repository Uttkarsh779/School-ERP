import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { Role } from "../../generated/prisma/enums";
import { createNotice, deleteNotice, listNoticesForUser } from "./service";

export const getNotices = async (req: CustomRequest, res: Response): Promise<void> => {
  const notices = await listNoticesForUser(req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data: notices });
};

export const postNotice = async (req: CustomRequest, res: Response): Promise<void> => {
  const { title, body, targetRole, targetClassSectionId } = req.body;
  if (!title || !body) {
    res.status(400).json({ success: false, message: "title and body are required" });
    return;
  }

  if (targetRole && !Object.values(Role).includes(targetRole)) {
    res.status(400).json({ success: false, message: `Invalid targetRole "${targetRole}"` });
    return;
  }

  const notice = await createNotice({
    title,
    body,
    targetRole: targetRole || undefined,
    targetClassSectionId: targetClassSectionId ? Number(targetClassSectionId) : undefined,
    postedByUserId: req.user!.id,
  });
  res.status(201).json({ success: true, data: notice });
};

export const deleteNoticeHandler = async (req: CustomRequest, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid notice id" });
    return;
  }

  await deleteNotice(id);
  res.status(200).json({ success: true, message: "Notice deleted" });
};
