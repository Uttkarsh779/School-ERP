import { Router, type NextFunction, type Request, type Response } from "express";
import { authenticateToken, type CustomRequest } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import * as svc from "./service";

// Online admissions.
//   /public/*  the website: settings, apply (with up to 3 files), status, pay — no login,
//              limited per device so the form can't be flooded or numbers guessed
//   everything else: the office (admissions.view / .manage / .fee; admitting = students.edit)
const router = Router();

const limiter = (max: number, windowMs: number, message: string) => {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ success: false, message });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    next();
  };
};
const applyLimit = limiter(5, 60 * 60_000, "Too many applications from this device. Please try again later or contact the school office.");
const lookupLimit = limiter(30, 15 * 60_000, "Too many tries. Please wait a few minutes and try again.");

const ok = (res: Response, data: unknown, message?: string, status = 200) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const idParam = (req: CustomRequest, name = "id") => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};
const filesOf = (req: Request) =>
  ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({ buffer: f.buffer, mimetype: f.mimetype, size: f.size, fieldname: f.fieldname }));

// --- Website -----------------------------------------------------------------
router.get("/public/settings", asyncHandler(async (_req, res: Response) => ok(res, await svc.getPublicSettings())));
router.post(
  "/public/apply",
  applyLimit,
  upload.array("files", 3),
  asyncHandler(async (req: Request, res: Response) => {
    if ((req.body?.website ?? "") !== "") throw httpError(400, "Couldn't submit the form"); // honeypot
    ok(res, await svc.submitApplication(req.body ?? {}, filesOf(req), null), "Application received", 201);
  })
);
router.post("/public/status", lookupLimit, asyncHandler(async (req: Request, res: Response) => ok(res, await svc.getStatusForFamily(req.body?.applicationNo, req.body?.phone))));
router.post("/public/pay", lookupLimit, asyncHandler(async (req: Request, res: Response) => ok(res, await svc.startOnlinePayment(req.body?.applicationNo, req.body?.phone))));
router.post(
  "/public/pay/verify",
  lookupLimit,
  asyncHandler(async (req: Request, res: Response) => ok(res, await svc.verifyOnlinePayment(req.body?.applicationNo, req.body?.phone, req.body ?? {}), "Payment received"))
);

// --- Office ------------------------------------------------------------------
router.use(authenticateToken);
const view = allow("admissions.view");
const manage = allow("admissions.manage");

router.get("/settings", view, asyncHandler(async (_req, res: Response) => ok(res, await svc.getSettings())));
router.put("/settings", manage, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.saveSettings(req.user!, req.body ?? {}), "Admission settings saved")));

router.get("/applications", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.listApplications(req.query as any))));
router.post(
  "/applications",
  manage,
  upload.array("files", 3),
  asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.submitApplication(req.body ?? {}, filesOf(req), req.user!), "Application added", 201))
);
router.get("/applications/:id", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.getApplication(idParam(req)))));
router.put("/applications/:id", manage, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.updateDetails(req.user!, idParam(req), req.body ?? {}), "Saved")));
router.post("/applications/:id/stage", manage, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.changeStage(req.user!, idParam(req), req.body ?? {}), "Saved")));
router.post("/applications/:id/fee", allow("admissions.fee"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.recordFee(req.user!, idParam(req), req.body ?? {}), "Fee recorded")));
router.post("/applications/:id/fee/waive", allow("fees.waive"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.waiveFee(req.user!, idParam(req), req.body?.reason), "Fee waived")));
router.get("/applications/:id/admit", allow("students.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.getAdmitPrefill(idParam(req)))));
router.post("/applications/:id/admit", allow("students.edit"), asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.admit(req.user!, idParam(req), req.body ?? {}), "Admitted")));
router.get(
  "/files/:id",
  view,
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const f = await svc.fetchApplicationFile(req.user!, idParam(req));
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${f.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(f.buffer);
  })
);

export default router;
