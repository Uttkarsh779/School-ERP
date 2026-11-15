import { Router } from "express";
import { forgotPasswordLimiters, loginLimiters, resetPasswordLimiters } from "../../middleware/security";
import { asyncHandler } from "../../utils/asyncHandler";
import { requestPasswordReset, resetPasswordWithCode } from "./passwordResetService";
import { loginUser, registerUser, refreshToken } from "./controller";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";

const router = Router();

router.post("/login", ...loginLimiters, loginUser);
// Creating raw user accounts is a Super Admin action (it used to be public, which let anyone
// create a SUPER_ADMIN). Staff/students are normally created through their own screens.
router.post("/register", authenticateToken, authorizeRoles(["SUPER_ADMIN"]), registerUser);
router.get("/ref-token", refreshToken);

// Forgot password: 1) send a 6-digit code (email for staff, SMS for students), 2) code + new password.
router.post(
  "/forgot-password",
  ...forgotPasswordLimiters,
  asyncHandler(async (req, res) => {
    await requestPasswordReset(req.body?.identifier, req.body?.mode);
    res.json({
      success: true,
      message:
        req.body?.mode === "staff"
          ? "If this email belongs to a staff account, a 6-digit code has been sent to it."
          : "If this admission number has a login, a 6-digit code has been sent by SMS to the registered mobile number.",
    });
  })
);
router.post(
  "/reset-password",
  ...resetPasswordLimiters,
  asyncHandler(async (req, res) => {
    await resetPasswordWithCode(req.body?.identifier, req.body?.mode, req.body?.code, req.body?.newPassword);
    res.json({ success: true, message: "Password changed. You can sign in with your new password." });
  })
);

export default router;
