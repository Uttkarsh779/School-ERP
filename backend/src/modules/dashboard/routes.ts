import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAdminDashboard } from "./controller";

const router = Router();

router.use(authenticateToken, allow("dashboard"));

router.get("/admin", asyncHandler(getAdminDashboard));

export default router;
