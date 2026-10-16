import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteNoticeHandler, getNotices, postNotice } from "./controller";

const router = Router();

router.use(authenticateToken);

// GET is open to every authenticated role — visibility filtering happens inside
// listNoticesForUser (see service.ts), not here.
router.get(
  "/",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getNotices)
);
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postNotice));
router.delete("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(deleteNoticeHandler));

export default router;
