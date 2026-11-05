import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteClassSectionController, getClassSections, getMyClassSections, patchClassSection, postClassSection } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/mine", authorizeRoles(["TEACHER"]), asyncHandler(getMyClassSections));
router.get("/", allow("academics.view"), asyncHandler(getClassSections));
router.post("/", allow("academics.edit"), asyncHandler(postClassSection));
router.patch("/:id", allow("academics.edit"), asyncHandler(patchClassSection));
router.delete("/:id", allow("classes.delete"), asyncHandler(deleteClassSectionController));

export default router;
