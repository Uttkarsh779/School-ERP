import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getTeacherDashboard } from "./teacherService";

// Mounted at /api/dashboard/teacher BEFORE the admin dashboard router in app.ts — that
// router restricts everything under /api/dashboard to SUPER_ADMIN/ADMIN.
const router = Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles(["TEACHER"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const data = await getTeacherDashboard(req.user!.id);
    res.status(200).json({ success: true, data });
  })
);

export default router;
