import { Router, type Response } from "express";
import { authenticateToken, type CustomRequest } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { httpError } from "../../utils/httpError";
import * as svc from "./service";

// School stock. Reading: office, Principal, Accountant. Changing: office and Accountant.
// The Excel stock register is /api/exports/inventory.
const router = Router();
router.use(authenticateToken);

const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};
const ok = (res: Response, data: unknown, message?: string, status = 200) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const view = allow("inventory.view");
const edit = allow("inventory.edit");

router.get("/categories", view, asyncHandler(async (_req, res: Response) => ok(res, await svc.listCategories())));
router.post("/categories", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.saveCategory(req.user!.id, null, req.body ?? {}), "Category added", 201)));
router.put("/categories/:id", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.saveCategory(req.user!.id, idParam(req), req.body ?? {}), "Category saved")));

router.get("/items", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.listItems(req.query as any))));
router.post("/items", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.createItem(req.user!, req.body ?? {}), "Item added", 201)));
router.put("/items/:id", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.updateItem(req.user!, idParam(req), req.body ?? {}), "Item saved")));
router.get("/items/:id/ledger", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.itemLedger(idParam(req), req.query as any))));

router.get("/docs", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.listDocs(req.query as any))));
router.get("/docs/:id", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.getDoc(idParam(req)))));
router.post("/receipts", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.createReceipt(req.user!, req.body ?? {}), "Goods receipt saved", 201)));
router.post("/issues", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.createIssue(req.user!, req.body ?? {}), "Issue slip saved", 201)));
router.post("/issues/:id/return", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.receiveBack(req.user!, idParam(req), req.body ?? {}), "Return recorded")));
router.post("/issues/:id/close-line", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.closeIssueLine(req.user!, idParam(req), req.body ?? {}), "Closed")));
router.post("/adjustments", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.createAdjustment(req.user!, req.body ?? {}), "Adjustment saved", 201)));
router.post("/docs/:id/void", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.voidDoc(req.user!, idParam(req), req.body?.reason), "Voided")));

router.get("/pending-returns", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.pendingReturns(req.query as any))));
router.get("/staff", edit, asyncHandler(async (_req, res: Response) => ok(res, await svc.listIssuableStaff())));
router.get("/suppliers", edit, asyncHandler(async (_req, res: Response) => ok(res, await svc.listSuppliers())));

export default router;
