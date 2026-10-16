import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getClassAttendance,
  getDefaulters,
  getMonthlyReport,
  getStudentSummary,
  postMarkAttendance,
} from "./controller";

const router = Router();

router.use(authenticateToken);

router.post("/mark", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(postMarkAttendance));
router.get(
  "/class/:classSectionId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(getClassAttendance)
);
router.get(
  "/student/:studentId/summary",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"]),
  asyncHandler(getStudentSummary)
);
router.get("/defaulters", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getDefaulters));
router.get("/report", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getMonthlyReport));

export default router;
