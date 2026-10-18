import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getStudentDashboard } from "./studentService";

// Mounted at /api/dashboard/student BEFORE the admin dashboard router in app.ts (that
// router restricts everything under /api/dashboard to SUPER_ADMIN/ADMIN). Always returns
// the caller's own data — there is no studentId parameter to tamper with.
const router = Router();

router.get(
  "/",
  authenticateToken,
  authorizeRoles(["STUDENT"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const data = await getStudentDashboard(req.user!.id);
    res.status(200).json({ success: true, data });
  })
);

export default router;
