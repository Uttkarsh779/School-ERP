import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getFilterOptions, getOverview, getReport } from "./controller";

const router = Router();

// SUPER_ADMIN only — ADMIN and every other role get 403.
router.use(authenticateToken, authorizeRoles(["SUPER_ADMIN"]));

router.get("/", asyncHandler(getReport));
router.get("/filter-options", asyncHandler(getFilterOptions));
router.get("/overview", asyncHandler(getOverview));

export default router;
