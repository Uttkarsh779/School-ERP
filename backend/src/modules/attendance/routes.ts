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
import { getMonthlyOverview, getMonthlyRegister } from "./reportController";

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
router.get("/report/monthly", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getMonthlyOverview));
// TEACHER allowed only for a class they're the class teacher of (checked in the controller).
router.get(
  "/report/monthly/:classSectionId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(getMonthlyRegister)
);

export default router;
