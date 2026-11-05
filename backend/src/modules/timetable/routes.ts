import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow, SCHOOL_WIDE } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteSlot, getClassTimetable, getMyTimetable, postTimetableSlot } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getClassTimetable)
);
router.get("/mine", authorizeRoles(["TEACHER"]), asyncHandler(getMyTimetable));
router.post("/", allow("academics.edit"), asyncHandler(postTimetableSlot));
router.delete("/:id", allow("academics.edit"), asyncHandler(deleteSlot));

export default router;
