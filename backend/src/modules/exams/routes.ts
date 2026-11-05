import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { httpError } from "../../utils/httpError";
import { getAdmitCards, saveDateSheet } from "./admitCardService";
import planRouter from "./planRoutes";
import { assertCoordinator } from "./permissions";
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
  getReportCardsPrint,
  postExam,
  postExamResults,
  getExamProgress,
  getDateSheets,
} from "./controller";

const router = Router();

router.use(authenticateToken);
// Planning, schemes, periodic assessment, term remarks and results (before /:id routes).
router.use(planRouter);

router.get(
  "/",
  allow("exams.coordinate", "TEACHER", "STUDENT", "PARENT"),
  asyncHandler(getExams)
);
router.post("/", allow("exams.coordinate", "TEACHER"), asyncHandler(postExam)); // coordinator, see planService
router.get("/date-sheets", allow("exams.coordinate", "TEACHER", "STUDENT", "PARENT"), asyncHandler(getDateSheets));
router.post(
  "/:id/results",
  allow("exams.coordinate", "TEACHER"),
  asyncHandler(postExamResults)
);
router.get("/:id/results", allow("exams.coordinate", "TEACHER"), asyncHandler(getExamResults));
router.get("/:id/progress", allow("exams.coordinate", "TEACHER"), asyncHandler(getExamProgress));
router.get("/:id/analysis", allow("exams.coordinate", "TEACHER"), asyncHandler(getExamAnalysisHandler));
router.get("/:id/audit", allow("exams.coordinate", "TEACHER"), asyncHandler(getExamAudit));
router.patch("/:id/lock", allow("exams.coordinate", "TEACHER"), asyncHandler(patchExamLock)); // coordinator
router.patch("/:id/publish", allow("exams.publish"), asyncHandler(patchExamPublish)); // Super Admin / Principal
router.get("/:id/remarks", allow("exams.coordinate", "TEACHER"), asyncHandler(getExamRemarks));
router.put("/:id/remarks", allow("exams.coordinate", "TEACHER"), asyncHandler(putExamRemarks));
router.get(
  "/:id/report-card/:studentId",
  allow("exams.coordinate", "TEACHER", "STUDENT", "PARENT"),
  asyncHandler(getReportCard)
);
router.get(
  "/:id/report-cards/print",
  allow("exams.coordinate", "TEACHER", "STUDENT", "PARENT"),
  asyncHandler(getReportCardsPrint)
);

// Admit cards: the office sets the date sheet and prints a card per student.
const examId = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid exam");
  return id;
};
router.put(
  "/:id/date-sheet",
  allow("exams.coordinate", "TEACHER"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await assertCoordinator(req.user!);
    res.json({ success: true, message: "Date sheet saved", data: await saveDateSheet(examId(req), req.body) });
  })
);
router.get(
  "/:id/admit-cards",
  allow("exams.coordinate", "TEACHER"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await assertCoordinator(req.user!);
    res.json({ success: true, data: await getAdmitCards(examId(req)) });
  })
);

export default router;
