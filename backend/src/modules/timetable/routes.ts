import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow, SCHOOL_WIDE } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteSlot, getClassTimetable, getMyTimetable, postTimetableSlot } from "./controller";
import { listTimetableForCurrentSession } from "./service";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  authorizeRoles([...SCHOOL_WIDE, "TEACHER", "STUDENT"]),
  asyncHandler(getClassTimetable)
);
// All classes' periods this session (office printing: every class / every teacher).
router.get(
  "/all",
  authorizeRoles([...SCHOOL_WIDE]),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listTimetableForCurrentSession() });
  })
);
router.get("/mine", authorizeRoles(["TEACHER"]), asyncHandler(getMyTimetable));
router.post("/", allow("academics.edit"), asyncHandler(postTimetableSlot));
router.delete("/:id", allow("academics.edit"), asyncHandler(deleteSlot));

export default router;
