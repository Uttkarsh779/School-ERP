import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteClassSectionController, getClassSections, getMyClassSections, patchClassSection, postClassSection } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/mine", authorizeRoles(["TEACHER"]), asyncHandler(getMyClassSections));
router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getClassSections));
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postClassSection));
router.patch("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchClassSection));
router.delete("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(deleteClassSectionController));

export default router;
