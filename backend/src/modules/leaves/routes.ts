import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { applyForLeave, cancelLeave, decideLeave, listAllLeaves, listClassLeaves, listMyLeaves } from "./service";

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
  authorizeRoles(["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Leave request sent", data: await applyForLeave(req.user!, req.body ?? {}) });
  })
);
router.get(
  "/mine",
  authorizeRoles(["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listMyLeaves(req.user!) });
  })
);
router.patch(
  "/:id/cancel",
  authorizeRoles(["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"]),
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
  authorizeRoles(["ADMIN", "SUPER_ADMIN"]),
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
  authorizeRoles(["TEACHER", "ADMIN", "SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    if (typeof req.body?.approved !== "boolean") throw httpError(400, "approved (true/false) is required");
    res.json({ success: true, data: await decideLeave(req.user!, idParam(req), req.body.approved, req.body.note) });
  })
);

export default router;
