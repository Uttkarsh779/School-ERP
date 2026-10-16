import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getAdminDashboard } from "./controller";

const router = Router();

router.use(authenticateToken, authorizeRoles(["SUPER_ADMIN", "ADMIN"]));

router.get("/admin", asyncHandler(getAdminDashboard));

export default router;
