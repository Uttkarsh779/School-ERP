import { Router } from "express";
import multer from "multer";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getMyStudentProfile,
  getStudent,
  getStudents,
  patchStudent,
  patchStudentActive,
  postSetStudentCredentials,
  postStudent,
  postStudentsBulkImport,
} from "./controller";
import { getStudentHistory } from "./historyService";
import type { CustomRequest } from "../../middleware/auth";
import type { Response } from "express";

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.use(authenticateToken);

// GET routes: authorization is resource-scoped (teacher = own class, parent = own
// child, student = self), checked inside the controller — see getStudents/getStudent.
router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getStudents));
router.get("/me", authorizeRoles(["STUDENT"]), asyncHandler(getMyStudentProfile));
// Admin-only full history (attendance, exams, fees, transport) for the student 360° view.
router.get(
  "/:id/history",
  authorizeRoles(["SUPER_ADMIN", "ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const id = Number(req.params.id);
    const history = Number.isInteger(id) && id > 0 ? await getStudentHistory(id) : null;
    if (!history) {
      res.status(404).json({ success: false, message: "Student not found" });
      return;
    }
    res.status(200).json({ success: true, data: history });
  })
);
router.get(
  "/:id",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "PARENT", "STUDENT"]),
  asyncHandler(getStudent)
);

// Mutations stay admin-only.
router.post("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postStudent));
router.post(
  "/bulk-import",
  authorizeRoles(["SUPER_ADMIN", "ADMIN"]),
  upload.single("file"),
  asyncHandler(postStudentsBulkImport)
);
router.post("/:id/credentials", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postSetStudentCredentials));
router.patch("/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchStudent));
router.patch("/:id/active", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchStudentActive));

export default router;
