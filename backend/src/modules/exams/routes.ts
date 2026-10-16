import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getExamResults, getExams, getReportCard, postExam, postExamResults } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getExams)
);
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(postExam));
router.post(
  "/:id/results",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(postExamResults)
);
router.get("/:id/results", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getExamResults));
router.get(
  "/:id/report-card/:studentId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getReportCard)
);

export default router;
