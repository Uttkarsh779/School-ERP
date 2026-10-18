import { Router, type Response } from "express";
import { authenticateToken, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { changeMyPassword, getMyProfile, updateMyProfile } from "./service";

// The logged-in user's own account (every role). There is no :id — it always acts on the
// caller, so nobody can read or change someone else's profile through it.
const router = Router();
router.use(authenticateToken);

router.get(
  "/me",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getMyProfile(req.user!.id) });
  })
);

router.patch(
  "/me",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Profile updated", data: await updateMyProfile(req.user!.id, req.body ?? {}) });
  })
);

router.post(
  "/change-password",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await changeMyPassword(req.user!.id, req.body?.currentPassword, req.body?.newPassword);
    res.json({ success: true, message: "Password changed" });
  })
);

export default router;
