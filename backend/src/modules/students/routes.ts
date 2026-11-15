import { Router } from "express";
import multer from "multer";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow } from "../../config/permissions";
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
import { findIdConflict, idConflictMessage, setStudentPhoto, suggestNextAdmissionNo } from "./service";
import type { CustomRequest } from "../../middleware/auth";
import type { Response } from "express";

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.use(authenticateToken);

// GET routes: authorization is resource-scoped (teacher = own class, parent = own
// child, student = self), checked inside the controller — see getStudents/getStudent.
router.get("/", allow("students.view", "TEACHER"), asyncHandler(getStudents));
router.get("/me", authorizeRoles(["STUDENT"]), asyncHandler(getMyStudentProfile));
// Suggested admission number for the New Student form (before the "/:id" routes).
router.get(
  "/next-admission-no",
  allow("students.edit"),
  asyncHandler(async (_req: CustomRequest, res: Response) => {
    res.json({ success: true, data: { admissionNo: await suggestNextAdmissionNo() } });
  })
);
// Live check for the student form: is this Aadhaar / APAAR ID already on another student?
// ?aadharNumber=...&apaarId=...&exceptId=<student being edited>
router.get(
  "/check-ids",
  allow("students.edit"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const exceptId = Number(req.query.exceptId) || undefined;
    const data: Record<string, { message: string } | null> = {};
    for (const key of ["aadharNumber", "apaarId"] as const) {
      if (typeof req.query[key] !== "string") continue;
      const other = await findIdConflict(key, req.query[key], exceptId);
      data[key] = other ? { message: idConflictMessage(key, other) } : null;
    }
    res.json({ success: true, data });
  })
);
// Office-only full history (attendance, exams, fees, transport) for the student 360° view.
router.get(
  "/:id/history",
  allow("students.view"),
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
  allow("students.view", "TEACHER", "STUDENT"),
  asyncHandler(getStudent)
);

// Mutations: the office only (the Principal and Accountant can view).
router.post("/", allow("students.edit"), asyncHandler(postStudent));
router.post(
  "/bulk-import",
  allow("students.edit"),
  upload.single("file"),
  asyncHandler(postStudentsBulkImport)
);
router.post("/:id/credentials", allow("students.edit"), asyncHandler(postSetStudentCredentials));
router.patch("/:id", allow("students.edit"), asyncHandler(patchStudent));
router.patch("/:id/active", allow("students.edit"), asyncHandler(patchStudentActive));
// Photo for report cards / ID cards — set by the office, not by students.
router.patch(
  "/:id/photo",
  allow("students.edit"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(200).json({ success: true, message: req.body?.photoUrl ? "Photo saved" : "Photo removed", data: await setStudentPhoto(Number(req.params.id), req.body?.photoUrl ?? null) });
  })
);

export default router;
