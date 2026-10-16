import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/concessions/schemes", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getConcessionSchemes));
router.post("/concessions/schemes", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postConcessionScheme));

router.get("/concessions/student/:studentId", authorizeRoles(["SUPER_ADMIN", "ADMIN", "PARENT"]), asyncHandler(controller.getStudentConcessions));
router.post("/concessions/assign", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postAssignStudentConcession));
router.get("/concessions/all", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getAllConcessions));
router.put("/concessions/student-concession/:id/end", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.endStudentConcession));

export default router;
