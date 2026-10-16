import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { deleteSlot, getClassTimetable, getMyTimetable, postTimetableSlot } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(getClassTimetable)
);
router.get("/mine", authorizeRoles(["TEACHER"]), asyncHandler(getMyTimetable));
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postTimetableSlot));
router.delete("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(deleteSlot));

export default router;
