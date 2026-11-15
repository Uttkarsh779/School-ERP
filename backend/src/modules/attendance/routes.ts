import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { allow } from "../../config/permissions";
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

router.post("/mark", allow("attendance", "TEACHER"), asyncHandler(postMarkAttendance));
router.get(
  "/class/:classSectionId",
  allow("attendance", "TEACHER"),
  asyncHandler(getClassAttendance)
);
router.get(
  "/student/:studentId/summary",
  allow("attendance", "TEACHER", "STUDENT"),
  asyncHandler(getStudentSummary)
);
router.get("/defaulters", allow("attendance"), asyncHandler(getDefaulters));
router.get("/report", allow("attendance"), asyncHandler(getMonthlyReport));
router.get("/report/monthly", allow("attendance"), asyncHandler(getMonthlyOverview));
// TEACHER allowed only for a class they're the class teacher of (checked in the controller).
router.get(
  "/report/monthly/:classSectionId",
  allow("attendance", "TEACHER"),
  asyncHandler(getMonthlyRegister)
);

export default router;
