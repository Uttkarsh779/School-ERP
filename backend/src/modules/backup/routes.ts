import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { downloadBackup, listBackups, runBackup } from "./service";

// Database backups: Super Admin only (a backup holds every record, including salaries and
// ID numbers).
const router = Router();
router.use(authenticateToken, authorizeRoles(["SUPER_ADMIN"]));

router.get(
  "/",
  asyncHandler(async (_req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listBackups() });
  })
);

router.post(
  "/",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Backup saved", data: await runBackup("MANUAL", req.user?.id) });
  })
);

router.get(
  "/:id/download",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid backup");
    const { buffer, fileName } = await downloadBackup(id);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`);
    res.send(buffer);
  })
);

export default router;
