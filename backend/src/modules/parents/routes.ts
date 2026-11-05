import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  deleteParentChild,
  getMyParentProfile,
  getParent,
  getParents,
  getParentDuesSummary,
  postParent,
  postParentChild,
} from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/me", authorizeRoles(["PARENT"]), asyncHandler(getMyParentProfile));
router.get("/", allow("families.view"), asyncHandler(getParents));
router.get("/:id", allow("families.view"), asyncHandler(getParent));
router.get("/:id/dues", allow("families.view"), asyncHandler(getParentDuesSummary));
router.post("/", allow("families.edit"), asyncHandler(postParent));
router.post("/:id/children", allow("families.edit"), asyncHandler(postParentChild));
router.delete("/:id/children/:studentId", allow("families.edit"), asyncHandler(deleteParentChild));

export default router;
