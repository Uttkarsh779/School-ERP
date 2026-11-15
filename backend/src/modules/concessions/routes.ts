import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/concessions/schemes", allow("fees.view"), asyncHandler(controller.getConcessionSchemes));
router.post("/concessions/schemes", allow("fees.waive"), asyncHandler(controller.postConcessionScheme));

router.get("/concessions/student/:studentId", allow("fees.view"), asyncHandler(controller.getStudentConcessions));
router.post("/concessions/assign", allow("fees.waive"), asyncHandler(controller.postAssignStudentConcession));
router.get("/concessions/all", allow("fees.view"), asyncHandler(controller.getAllConcessions));
router.put("/concessions/student-concession/:id/end", allow("fees.waive"), asyncHandler(controller.endStudentConcession));

export default router;
