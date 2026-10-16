import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getStaff, getStaffList, patchStaff, patchStaffActive, postStaff } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getStaffList));
router.get("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getStaff));
router.post("/", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postStaff));
router.patch("/:id", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(patchStaff));
router.patch("/:id/active", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(patchStaffActive));

export default router;
