import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getExpenseById,
  getExpenses,
  getProjects,
  getSummary,
  patchExpense,
  patchProject,
  postExpense,
  postProject,
  postVoidExpense,
} from "./controller";

const router = Router();

// SUPER_ADMIN only — ADMIN and every other role get 403.
router.use(authenticateToken, authorizeRoles(["SUPER_ADMIN"]));

router.get("/summary", asyncHandler(getSummary));

router.get("/projects", asyncHandler(getProjects));
router.post("/projects", asyncHandler(postProject));
router.patch("/projects/:id", asyncHandler(patchProject));

router.get("/expenses", asyncHandler(getExpenses));
router.get("/expenses/:id", asyncHandler(getExpenseById));
router.post("/expenses", asyncHandler(postExpense));
router.patch("/expenses/:id", asyncHandler(patchExpense));
// No DELETE — expenses are voided with a reason so the audit trail is preserved.
router.post("/expenses/:id/void", asyncHandler(postVoidExpense));

export default router;
