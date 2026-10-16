import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
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
router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getParents));
router.get("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getParent));
router.get("/:id/dues", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getParentDuesSummary));
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postParent));
router.post("/:id/children", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postParentChild));
router.delete("/:id/children/:studentId", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(deleteParentChild));

export default router;
