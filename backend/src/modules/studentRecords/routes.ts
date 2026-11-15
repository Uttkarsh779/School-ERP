import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { upload } from "../../middleware/upload";
import { prisma } from "../../config/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import * as docs from "./documentsService";
import * as health from "./healthService";

// Student documents and health records.
//   /me                      the student login (families): what's on file + the health record
//   /students/:id/documents  office: list, upload; /documents/:id/... view, verify, remove
//   /students/:id/health     office and Principal: profile, checkups, vaccinations
// Teachers get the short health alert through /api/teaching (teaching/studentsService.ts).
const router = Router();
router.use(authenticateToken);

const idParam = (req: CustomRequest, name = "id") => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};
const ok = (res: Response, data: unknown, message?: string, status = 200) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });

router.get(
  "/me",
  authorizeRoles(["STUDENT"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const student = await prisma.student.findUnique({ where: { userId: req.user!.id }, select: { id: true } });
    if (!student) throw httpError(404, "No student record is linked to this login");
    const [documents, record] = await Promise.all([docs.familyDocumentSummary(student.id), health.getStudentHealth(student.id, { forFamily: true })]);
    ok(res, { documents, health: record });
  })
);

// --- Documents ---------------------------------------------------------------

router.get("/students/:studentId/documents", allow("documents.view"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await docs.listStudentDocuments(idParam(req, "studentId")))));
router.post(
  "/students/:studentId/documents",
  allow("documents.edit"),
  upload.single("file"),
  asyncHandler(async (req: CustomRequest, res: Response) =>
    ok(res, await docs.uploadStudentDocument(req.user!.id, idParam(req, "studentId"), req.file, req.body ?? {}), "Document saved", 201)
  )
);
router.get(
  "/documents/:id/file",
  allow("documents.view"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const file = await docs.fetchStudentDocument(req.user!.id, idParam(req));
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.buffer);
  })
);
router.patch("/documents/:id/verify", allow("documents.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await docs.setDocumentVerified(req.user!.id, idParam(req), req.body?.verified))));
router.post("/documents/:id/remove", allow("documents.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await docs.removeStudentDocument(req.user!.id, idParam(req), req.body?.reason), "Document removed")));

// --- Health ------------------------------------------------------------------

router.get("/students/:studentId/health", allow("health.view"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.getStudentHealth(idParam(req, "studentId")))));
router.put("/students/:studentId/health", allow("health.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.saveStudentHealth(req.user!.id, idParam(req, "studentId"), req.body ?? {}), "Health record saved")));
router.post("/students/:studentId/checkups", allow("health.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.addCheckup(req.user!.id, idParam(req, "studentId"), req.body ?? {}), "Checkup added", 201)));
router.delete("/checkups/:id", allow("health.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.deleteCheckup(req.user!.id, idParam(req)), "Checkup deleted")));
router.post("/students/:studentId/vaccinations", allow("health.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.addVaccination(req.user!.id, idParam(req, "studentId"), req.body ?? {}), "Vaccination added", 201)));
router.delete("/vaccinations/:id", allow("health.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await health.deleteVaccination(req.user!.id, idParam(req)), "Vaccination deleted")));

export default router;
