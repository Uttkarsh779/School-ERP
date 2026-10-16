import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

const router = Router();

router.use(authenticateToken);

router.get(
  "/assignments",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(controller.getAssignments)
);

router.post(
  "/assignments",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(controller.postAssignment)
);

router.delete(
  "/assignments/:id",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]),
  asyncHandler(controller.deleteAssignment)
);

export default router;
