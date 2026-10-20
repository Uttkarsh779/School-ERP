import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getPromotionPlan,
  getRolloverOverview,
  getSessions,
  postCopySetup,
  postPromote,
  postSession,
  putCurrentSession,
} from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getSessions));
router.post("/", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postSession));

// New session setup (copy last year's setup, promote students) — Super Admin only.
router.get("/rollover/overview", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(getRolloverOverview));
router.post("/rollover/copy-setup", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postCopySetup));
router.get("/rollover/plan", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(getPromotionPlan));
router.post("/rollover/promote", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postPromote));
router.put("/:id/set-current", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(putCurrentSession));

export default router;
