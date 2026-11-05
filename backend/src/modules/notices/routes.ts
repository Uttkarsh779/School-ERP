import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow, SCHOOL_WIDE } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteNoticeHandler, getNoticeClasses, getNotices, getSentNotices, postNotice } from "./controller";

const router = Router();

router.use(authenticateToken);

// GET is open to every authenticated role — visibility filtering happens inside
// listNoticesForUser (see service.ts), not here.
router.get(
  "/",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getNotices)
);
router.get("/sent", authorizeRoles(["TEACHER"]), asyncHandler(getSentNotices));
router.get("/classes", authorizeRoles(["TEACHER"]), asyncHandler(getNoticeClasses));
// Teachers post only to classes they teach and delete only their own notices (service.ts).
router.post("/", allow("notices", "TEACHER"), asyncHandler(postNotice));
router.delete("/:id", allow("notices", "TEACHER"), asyncHandler(deleteNoticeHandler));

export default router;
