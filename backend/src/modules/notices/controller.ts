import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { createNoticesForActor, deleteNoticeForActor, listNoticesForUser, listSentNotices, listTeacherNoticeClasses } from "./service";

export const getNotices = async (req: CustomRequest, res: Response): Promise<void> => {
  const notices = await listNoticesForUser(req.user!.id, req.user!.role);
  res.status(200).json({ success: true, data: notices });
};

// Teacher: notices I posted.
export const getSentNotices = async (req: CustomRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: await listSentNotices(req.user!.id) });
};

// Teacher: classes I can send a notice to.
export const getNoticeClasses = async (req: CustomRequest, res: Response): Promise<void> => {
  res.status(200).json({ success: true, data: await listTeacherNoticeClasses(req.user!.id) });
};

export const postNotice = async (req: CustomRequest, res: Response): Promise<void> => {
  const created = await createNoticesForActor({ id: req.user!.id, role: req.user!.role }, req.body ?? {});
  res.status(201).json({
    success: true,
    message: created.length > 1 ? `Notice sent to ${created.length} classes` : "Notice posted",
    data: created.length === 1 ? created[0] : created,
  });
};

export const deleteNoticeHandler = async (req: CustomRequest, res: Response): Promise<void> => {
  await deleteNoticeForActor({ id: req.user!.id, role: req.user!.role }, Number(req.params.id));
  res.status(200).json({ success: true, message: "Notice deleted" });
};
