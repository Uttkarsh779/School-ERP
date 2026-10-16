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

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.use(authenticateToken);

// GET routes: authorization is resource-scoped (teacher = own class, parent = own
// child, student = self), checked inside the controller — see getStudents/getStudent.
router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER"]), asyncHandler(getStudents));
router.get("/me", authorizeRoles(["STUDENT"]), asyncHandler(getMyStudentProfile));
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
