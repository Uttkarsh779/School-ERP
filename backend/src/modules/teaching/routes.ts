import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { getClassRoster, getStudentOverviewForTeacher } from "./studentsService";

// Teacher-only views of the students they teach ("My Students").
const router = Router();
router.use(authenticateToken, authorizeRoles(["TEACHER"]));

const idOf = (v: unknown, field: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${field} is required`);
  return n;
};

router.get(
  "/students",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getClassRoster(req.user!.id, idOf(req.query.classSectionId, "classSectionId")) });
  })
);

router.get(
  "/students/:id",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getStudentOverviewForTeacher(req.user!.id, idOf(req.params.id, "Student id")) });
  })
);

export default router;
