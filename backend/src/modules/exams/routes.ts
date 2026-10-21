import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getExamAnalysisHandler,
  getExamAudit,
  getExamRemarks,
  patchExamPublish,
  putExamRemarks,
  patchExamLock,
  getExamResults,
  getExams,
  getReportCard,
  postExam,
  postExamResults,
  getExamProgress,
} from "./controller";

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
router.get("/:id/progress", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getExamProgress));
router.get("/:id/analysis", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getExamAnalysisHandler));
router.get("/:id/audit", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getExamAudit));
router.patch("/:id/lock", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchExamLock));
router.patch("/:id/publish", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchExamPublish));
router.get("/:id/remarks", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getExamRemarks));
router.put("/:id/remarks", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(putExamRemarks));
router.get(
  "/:id/report-card/:studentId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getReportCard)
);

export default router;
