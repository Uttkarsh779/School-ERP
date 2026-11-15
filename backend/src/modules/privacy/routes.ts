import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import * as svc from "./service";

// Privacy (DPDP Act). /notice is public (website privacy page). /me/* is the student login,
// which parents use. Everything else is the office.
const router = Router();

router.get(
  "/notice",
  asyncHandler(async (_req, res: Response) => {
    res.json({ success: true, data: await svc.getPublicNotice() });
  })
);

router.use(authenticateToken);

const me = Router();
me.use(authorizeRoles(["STUDENT"]));
me.get("/status", asyncHandler(async (req: CustomRequest, res: Response) => res.json({ success: true, data: await svc.getMyConsentStatus(req.user!.id) })));
me.post(
  "/consent",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await svc.giveMyConsent(req.user!.id, req.body, req.headers["user-agent"]);
    res.status(201).json({ success: true, message: "Thank you. Your consent has been recorded." });
  })
);
me.get("/data", asyncHandler(async (req: CustomRequest, res: Response) => res.json({ success: true, data: await svc.getMyData(req.user!.id) })));
me.get("/requests", asyncHandler(async (req: CustomRequest, res: Response) => res.json({ success: true, data: await svc.listMyDataRequests(req.user!.id) })));
me.post(
  "/requests",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await svc.createMyDataRequest(req.user!.id, req.body);
    res.status(201).json({ success: true, message: "Request sent. The school office will reply here." });
  })
);
router.use("/me", me);

router.get("/settings", allow("privacy.manage"), asyncHandler(async (_req, res: Response) => res.json({ success: true, data: await svc.getPrivacySettings() })));
router.put(
  "/settings",
  allow("privacy.settings"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const data = await svc.updatePrivacySettings(req.body, req.user!.id);
    res.json({ success: true, message: req.body?.askAgain ? "Saved. Families will be asked to agree again." : "Privacy notice saved", data });
  })
);
router.get("/summary", allow("privacy.manage"), asyncHandler(async (_req, res: Response) => res.json({ success: true, data: await svc.getConsentSummary() })));
router.get("/requests", allow("privacy.manage"), asyncHandler(async (req, res: Response) => res.json({ success: true, data: await svc.listDataRequests(String(req.query.status ?? "")) })));
router.patch(
  "/requests/:id",
  allow("privacy.manage"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await svc.resolveDataRequest(Number(req.params.id), req.body, req.user!.id);
    res.json({ success: true, message: "Reply saved" });
  })
);
router.get("/students/:id", allow("privacy.manage"), asyncHandler(async (req, res: Response) => res.json({ success: true, data: await svc.getStudentPrivacy(Number(req.params.id)) })));
router.post(
  "/students/:id/consent",
  allow("privacy.manage"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await svc.recordPaperConsent(Number(req.params.id), req.body, req.user!.id);
    res.status(201).json({ success: true, message: "Paper consent recorded" });
  })
);
router.post(
  "/students/:id/consent/withdraw",
  allow("privacy.manage"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await svc.withdrawConsent(Number(req.params.id), req.body, req.user!.id);
    res.json({ success: true, message: "Consent marked as withdrawn" });
  })
);

export default router;
