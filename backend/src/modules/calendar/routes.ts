import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { copyFromSession, createEvent, deleteEvent, listEvents, updateEvent, updateSettings } from "./service";

// School calendar: everyone signed in can view; admins manage.
const router = Router();
router.use(authenticateToken);

const admin = authorizeRoles(["SUPER_ADMIN", "ADMIN"]);
const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};

router.get(
  "/",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listEvents(req.query) });
  })
);
router.put(
  "/settings",
  admin,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Weekly offs saved", data: await updateSettings(req.body) });
  })
);
router.post(
  "/events",
  admin,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Added to the calendar", data: await createEvent(req.user!, req.body) });
  })
);
router.put(
  "/events/:id",
  admin,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Calendar entry updated", data: await updateEvent(idParam(req), req.body) });
  })
);
router.delete(
  "/events/:id",
  admin,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await deleteEvent(idParam(req));
    res.json({ success: true, message: "Removed from the calendar" });
  })
);
router.post(
  "/copy",
  admin,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await copyFromSession(req.user!, req.body) });
  })
);

export default router;
