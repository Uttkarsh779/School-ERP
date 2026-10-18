import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { httpError } from "../../utils/httpError";
import {
  createExpense,
  createProject,
  getConstructionSummary,
  getExpense,
  listExpenses,
  listProjects,
  updateExpense,
  updateProject,
  voidExpense,
} from "./service";
import {
  parseExpenseFilters,
  parseExpenseInput,
  parseIdempotencyKey,
  parseProjectInput,
  parseVoidReason,
} from "./validation";

const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};

export const getProjects = async (req: CustomRequest, res: Response): Promise<void> => {
  const projects = await listProjects(req.user!);
  res.status(200).json({ success: true, data: projects });
};

export const postProject = async (req: CustomRequest, res: Response): Promise<void> => {
  const project = await createProject(req.user!, parseProjectInput(req.body ?? {}));
  res.status(201).json({ success: true, data: project });
};

export const patchProject = async (req: CustomRequest, res: Response): Promise<void> => {
  const project = await updateProject(req.user!, idParam(req), parseProjectInput(req.body ?? {}, true));
  res.status(200).json({ success: true, data: project });
};

export const getExpenses = async (req: CustomRequest, res: Response): Promise<void> => {
  const result = await listExpenses(req.user!, parseExpenseFilters(req.query as Record<string, unknown>));
  res.status(200).json({ success: true, data: result });
};

export const getExpenseById = async (req: CustomRequest, res: Response): Promise<void> => {
  const expense = await getExpense(req.user!, idParam(req));
  res.status(200).json({ success: true, data: expense });
};

export const postExpense = async (req: CustomRequest, res: Response): Promise<void> => {
  const input = parseExpenseInput(req.body ?? {});
  const key = parseIdempotencyKey(req.headers["idempotency-key"] ?? req.body?.idempotencyKey);
  const { expense, replayed } = await createExpense(req.user!, input, key);
  res.status(replayed ? 200 : 201).json({
    success: true,
    message: replayed ? "This expense was already recorded" : "Expense recorded",
    data: expense,
  });
};

export const patchExpense = async (req: CustomRequest, res: Response): Promise<void> => {
  const expense = await updateExpense(req.user!, idParam(req), parseExpenseInput(req.body ?? {}, true));
  res.status(200).json({ success: true, data: expense });
};

export const postVoidExpense = async (req: CustomRequest, res: Response): Promise<void> => {
  const expense = await voidExpense(req.user!, idParam(req), parseVoidReason(req.body ?? {}));
  res.status(200).json({ success: true, message: "Expense voided", data: expense });
};

export const getSummary = async (req: CustomRequest, res: Response): Promise<void> => {
  const summary = await getConstructionSummary(req.user!);
  res.status(200).json({ success: true, data: summary });
};
