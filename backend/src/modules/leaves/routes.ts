import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { allow, SCHOOL_WIDE } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { applyForLeave, cancelLeave, decideLeave, listAllLeaves, listClassLeaves, listMyLeaves } from "./service";
import { onLeaveApplied, onLeaveDecided } from "../notifications/events";

const router = Router();
router.use(authenticateToken);

const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};

// Apply / list own requests: students (for themselves) and staff (for themselves).
router.post(
  "/",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const leave = await applyForLeave(req.user!, req.body ?? {});
    onLeaveApplied(leave.id);
    res.status(201).json({ success: true, message: "Leave request sent", data: leave });
  })
);
router.get(
  "/mine",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listMyLeaves(req.user!) });
  })
);
router.patch(
  "/:id/cancel",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Request cancelled", data: await cancelLeave(req.user!, idParam(req)) });
  })
);

// Class teacher: student requests for their classes.
router.get(
  "/class",
  authorizeRoles(["TEACHER"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listClassLeaves(req.user!) });
  })
);

// Admin: all requests.
router.get(
  "/",
  allow("leaves.manage"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({
      success: true,
      data: await listAllLeaves({ kind: req.query.kind as string | undefined, status: req.query.status as string | undefined }),
    });
  })
);

// Decide: class teacher (own students) or admin; who may decide what is checked in the service.
router.patch(
  "/:id/decision",
  allow("leaves.manage", "TEACHER"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    if (typeof req.body?.approved !== "boolean") throw httpError(400, "approved (true/false) is required");
    const leave = await decideLeave(req.user!, idParam(req), req.body.approved, req.body.note);
    onLeaveDecided(leave.id);
    res.json({ success: true, data: leave });
  })
);

export default router;
