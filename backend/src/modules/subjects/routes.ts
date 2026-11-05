import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow, SCHOOL_WIDE } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteAssignedTeacher, getSubjects, postAssignTeacher, postSubject } from "./controller";

const router = Router();

router.use(authenticateToken);
router.get("/", authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT", "PARENT"]), asyncHandler(getSubjects));
router.post("/", allow("academics.edit"), asyncHandler(postSubject));
router.post("/:id/teacher", allow("academics.edit"), asyncHandler(postAssignTeacher));
router.delete("/:id/teacher", allow("academics.edit"), asyncHandler(deleteAssignedTeacher));

export default router;
