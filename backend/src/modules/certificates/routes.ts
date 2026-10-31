import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { cancelCertificate, issueCertificate, listCertificateRegister, listStudentCertificates, prefillCertificate } from "./service";

const router = Router();
router.use(authenticateToken);
router.use(authorizeRoles(["SUPER_ADMIN", "ADMIN"]));

const idParam = (req: CustomRequest, name = "id") => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};

router.get(
  "/",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listCertificateRegister(req.query.type || undefined) });
  })
);
router.get(
  "/students/:studentId",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listStudentCertificates(idParam(req, "studentId")) });
  })
);
router.get(
  "/students/:studentId/prefill",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await prefillCertificate(idParam(req, "studentId"), req.query.type) });
  })
);
router.post(
  "/students/:studentId",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Certificate issued", data: await issueCertificate(req.user!, idParam(req, "studentId"), req.body ?? {}) });
  })
);
router.patch(
  "/:id/cancel",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Certificate cancelled", data: await cancelCertificate(req.user!, idParam(req), req.body?.reason) });
  })
);

export default router;
