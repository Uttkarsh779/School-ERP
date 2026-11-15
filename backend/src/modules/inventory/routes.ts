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
router.post("/items", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.createItem(req.user!.id, req.body ?? {}), "Item added", 201)));
router.put("/items/:id", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.updateItem(req.user!.id, idParam(req), req.body ?? {}), "Item saved")));

router.get("/movements", view, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.listMovements(req.query as any))));
router.post("/movements", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.recordMovement(req.user!.id, req.body ?? {}), "Saved", 201)));
router.post("/movements/:id/void", edit, asyncHandler(async (req: CustomRequest, res: Response) => ok(res, await svc.voidMovement(req.user!.id, idParam(req), req.body?.reason), "Entry voided")));

router.get("/with-staff", view, asyncHandler(async (_req, res: Response) => ok(res, await svc.listWithStaff())));
router.get("/staff", edit, asyncHandler(async (_req, res: Response) => ok(res, await svc.listIssuableStaff())));

export default router;
