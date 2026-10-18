import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

// Homework. Who may do what (own class / own homework / class teacher) is checked in the
// service; these role lists are the outer gate.
const router = Router();

router.use(authenticateToken);

router.get("/assignments", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"]), asyncHandler(controller.getAssignments));
router.post("/assignments", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(controller.postAssignment));
router.put("/assignments/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(controller.putAssignment));
router.delete("/assignments/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(controller.deleteAssignment));

router.get("/assignments/:id/submissions", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(controller.getSubmissions));
router.post("/assignments/:id/submit", authorizeRoles(["STUDENT"]), asyncHandler(controller.postSubmission));
router.patch(
  "/assignments/:id/submissions/:studentId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(controller.patchSubmissionReview)
);

export default router;
