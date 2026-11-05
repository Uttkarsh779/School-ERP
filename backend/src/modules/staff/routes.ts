import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { getStaff, getStaffList, patchStaff, patchStaffActive, postStaff } from "./controller";
import { resetStaffPassword } from "./service";
import type { CustomRequest } from "../../middleware/auth";
import type { Response } from "express";

const router = Router();

router.use(authenticateToken);

router.get("/", allow("staff.view"), asyncHandler(getStaffList));
router.get("/:id", allow("staff.view"), asyncHandler(getStaff));
router.post("/", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postStaff));
router.patch("/:id", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(patchStaff));
router.patch("/:id/active", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(patchStaffActive));
router.post(
  "/:id/reset-password",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Password reset", data: await resetStaffPassword(Number(req.params.id), req.body?.password) });
  })
);

export default router;
