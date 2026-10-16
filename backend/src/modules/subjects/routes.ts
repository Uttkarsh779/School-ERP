import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteAssignedTeacher, getSubjects, postAssignTeacher, postSubject } from "./controller";

const router = Router();

router.use(authenticateToken);
router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]), asyncHandler(getSubjects));
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postSubject));
router.post("/:id/teacher", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postAssignTeacher));
router.delete("/:id/teacher", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(deleteAssignedTeacher));

export default router;
