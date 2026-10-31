import { Router, type Response } from "express";
import { authenticateToken, authorizeRoles, type CustomRequest } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import { createCategory, createEntry, getSummary, listCategories, listEntries, updateCategory, updateEntry, voidEntry } from "./service";

// Accounts (income & expense book): admins record and edit; only the Super Admin voids.
const router = Router();
router.use(authenticateToken);
router.use(authorizeRoles(["SUPER_ADMIN", "ADMIN"]));

const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};

router.get(
  "/categories",
  asyncHandler(async (_req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listCategories() });
  })
);
router.post(
  "/categories",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Category added", data: await createCategory(req.body) });
  })
);
router.patch(
  "/categories/:id",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Category saved", data: await updateCategory(idParam(req), req.body) });
  })
);

router.get(
  "/summary",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getSummary(req.user!, req.query) });
  })
);
router.get(
  "/entries",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await listEntries(req.query) });
  })
);
router.post(
  "/entries",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.status(201).json({ success: true, message: "Entry saved", data: await createEntry(req.user!, req.body) });
  })
);
router.put(
  "/entries/:id",
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Entry updated", data: await updateEntry(req.user!, idParam(req), req.body) });
  })
);
router.post(
  "/entries/:id/void",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Entry voided", data: await voidEntry(req.user!, idParam(req), req.body?.reason) });
  })
);

export default router;
