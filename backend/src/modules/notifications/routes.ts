import { Router, type Response } from "express";
import { authenticateToken, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { getPushPublicKey, listMyNotifications, markAllRead, markRead, removePushSubscription, savePushSubscription } from "./service";

// The signed-in user's own notifications and push subscriptions (every role).
const router = Router();
router.use(authenticateToken);

router.get(
  "/",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listMyNotifications(req.user!.id) });
  })
);
router.patch(
  "/read-all",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await markAllRead(req.user!.id);
    res.json({ success: true });
  })
);
router.patch(
  "/:id/read",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
    await markRead(req.user!.id, id);
    res.json({ success: true });
  })
);

router.get("/push/key", (_req, res) => {
  res.json({ success: true, data: { publicKey: getPushPublicKey() } });
});
router.post(
  "/push/subscribe",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await savePushSubscription(req.user!.id, req.body, req.get("user-agent"));
    res.status(201).json({ success: true });
  })
);
router.post(
  "/push/unsubscribe",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    await removePushSubscription(req.user!.id, req.body?.endpoint);
    res.json({ success: true });
  })
);

export default router;
