import { Router, type Response } from "express";
import { authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { getStudentByUserId } from "../students/service";
import { assertCoordinator, examPermissions } from "./permissions";
import { deleteScheme, getExamSettings, listSchemes, saveScheme, updateExamSettings } from "./schemeService";
import { createClassTest, createPlannedExam, deleteExam, getExamSubjects, listPlan, saveExamSubjects, setExamReady, updatePlannedExam } from "./planService";
import {
  getAssessmentSheet,
  getClassResult,
  getMyResults,
  getTermRemarks,
  listPublications,
  publishResult,
  saveAdjustments,
  saveAssessmentMarks,
  saveTermRemarks,
  unpublishResult,
} from "./resultService";

// Exam planning, assessment schemes, periodic assessment, term remarks and term/final
// results. Mounted on /api/exams before the per-exam routes. Fine-grained rules (exam
// coordinator, publisher, class teacher, subject teacher) are checked in the services.
const router = Router();
const staff = authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]);
const H = (fn: (req: CustomRequest) => Promise<unknown>, status = 200) =>
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(status).json({ success: true, data: await fn(req) });
  });
const int = (v: unknown, field: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw httpError(400, `${field} is required`);
  return n;
};

router.get("/meta", staff, H(async (req) => ({ permissions: await examPermissions(req.user!), settings: await getExamSettings() })));

router.get("/schemes", staff, H(() => listSchemes()));
router.post("/schemes", staff, H(async (req) => (await assertCoordinator(req.user!), saveScheme(null, req.body)), 201));
router.put("/schemes/:sid", staff, H(async (req) => (await assertCoordinator(req.user!), saveScheme(int(req.params.sid, "Scheme"), req.body))));
router.delete("/schemes/:sid", staff, H(async (req) => (await assertCoordinator(req.user!), deleteScheme(int(req.params.sid, "Scheme")))));
router.put("/settings", authorizeRoles(["SUPER_ADMIN"]), H((req) => updateExamSettings(req.body)));

router.get("/plan", staff, H((req) => listPlan(req.user!, req.query.sessionId ? Number(req.query.sessionId) : undefined)));
router.post("/plan", staff, H((req) => createPlannedExam(req.user!, req.body), 201));
router.patch("/plan/:groupKey", staff, H((req) => updatePlannedExam(req.user!, String(req.params.groupKey), req.body)));
router.post("/class-tests", staff, H((req) => createClassTest(req.user!, req.body), 201));

router.get("/results/overview", staff, H((req) => listPublications(req.user!, req.query.sessionId ? Number(req.query.sessionId) : undefined)));
router.get(
  "/results",
  staff,
  H((req) =>
    getClassResult(
      req.user!,
      int(req.query.classSectionId, "Class"),
      int(req.query.term, "Term"),
      req.query.weights ? String(req.query.weights).split(",").map(Number) : undefined
    )
  )
);
router.post("/results/publish", staff, H((req) => publishResult(req.user!, req.body)));
router.delete("/results", staff, H((req) => unpublishResult(req.user!, int(req.query.classSectionId, "Class"), int(req.query.term, "Term"))));
router.get(
  "/my-results",
  authorizeRoles(["STUDENT"]),
  H(async (req) => {
    const student = await getStudentByUserId(req.user!.id);
    if (!student) throw httpError(404, "Your student record isn't linked yet");
    return getMyResults(student.id);
  })
);

router.get("/assessment", staff, H((req) => getAssessmentSheet(req.user!, int(req.query.classSectionId, "Class"), int(req.query.term, "Term"), int(req.query.subjectId, "Subject"))));
router.put("/assessment/marks", staff, H((req) => saveAssessmentMarks(req.user!, req.body)));
router.put("/assessment/adjust", staff, H((req) => saveAdjustments(req.user!, req.body)));
router.get("/term-remarks", staff, H((req) => getTermRemarks(req.user!, int(req.query.classSectionId, "Class"), int(req.query.term, "Term"))));
router.put("/term-remarks", staff, H((req) => saveTermRemarks(req.user!, req.body)));

router.get("/:id/subjects", staff, H((req) => getExamSubjects(req.user!, int(req.params.id, "Exam"))));
router.put("/:id/subjects", staff, H((req) => saveExamSubjects(req.user!, int(req.params.id, "Exam"), req.body?.subjects)));
router.patch("/:id/ready", staff, H((req) => setExamReady(req.user!, int(req.params.id, "Exam"), !!req.body?.ready)));
router.delete("/:id", staff, H((req) => deleteExam(req.user!, int(req.params.id, "Exam"))));

export default router;
