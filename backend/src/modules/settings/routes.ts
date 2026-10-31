import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getDocumentSettings, updateDocumentSettings } from "./service";

// Document settings: anyone signed in can read them (students print their own report card,
// which carries the signature); only the Super Admin changes the signature and seal.
const router = Router();
router.use(authenticateToken);

router.get(
  "/documents",
  asyncHandler(async (_req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getDocumentSettings() });
  })
);
router.put(
  "/documents",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Document settings saved", data: await updateDocumentSettings(req.body) });
  })
);

export default router;
