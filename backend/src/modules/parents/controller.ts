import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { hashPassword } from "../../utils/password";
import {
  createParentWithChildren,
  findUserByEmail,
  getParentById,
  getParentByUserId,
  linkChild,
  listParents,
  unlinkChild,
} from "./service";

const sanitize = (parent: any) => {
  if (!parent.user) return parent;
  const { passwordHash: _passwordHash, ...user } = parent.user;
  return { ...parent, user };
};

import { getStudentDueSummary } from "../fees/feeChargeService";

export const getParents = async (_req: CustomRequest, res: Response): Promise<void> => {
  const parents = await listParents();
  const enhancedParents = await Promise.all(
    parents.map(async (parent) => {
      let familyTotalDue = 0;
      const dues = await Promise.all(
        parent.children.map(child => getStudentDueSummary(child.studentId))
      );
      for (const summary of dues) {
        familyTotalDue += summary.netPayable;
      }
      return { ...sanitize(parent), familyTotalDue };
    })
  );

  res.status(200).json({ success: true, data: enhancedParents });
};

export const getParent = async (req: CustomRequest, res: Response): Promise<void> => {
  const parent = await getParentById(Number(req.params.id));
  if (!parent) {
    res.status(404).json({ success: false, message: "Parent not found" });
    return;
  }
  res.status(200).json({ success: true, data: sanitize(parent) });
};

export const getMyParentProfile = async (req: CustomRequest, res: Response): Promise<void> => {
  const parent = await getParentByUserId(req.user!.id);
  if (!parent) {
    res.status(404).json({ success: false, message: "No parent profile linked to this account" });
    return;
  }
  res.status(200).json({ success: true, data: sanitize(parent) });
};

export const getParentDuesSummary = async (req: CustomRequest, res: Response): Promise<void> => {
  const parentId = Number(req.params.id);
  const parent = await getParentById(parentId);
  if (!parent) {
    res.status(404).json({ success: false, message: "Parent not found" });
    return;
  }

  let familyTotal = 0;
  
  const childrenSummaries = await Promise.all(parent.children.map(async (child: any) => {
    const dueSummary = await getStudentDueSummary(child.studentId);
    return {
      student: child.student,
      relationshipType: child.relationshipType,
      dueSummary,
    };
  }));

  for (const childSummary of childrenSummaries) {
    familyTotal += childSummary.dueSummary.netPayable;
  }

  res.status(200).json({
    success: true,
    data: {
      parentId,
      familyTotal,
      childrenSummaries,
    },
  });
};

export const postParent = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, email, address, contact, studentIds } = req.body;
  if (!name) {
    res.status(400).json({ success: false, message: "name is required" });
    return;
  }

  const parent = await createParentWithChildren({
    name,
    email,
    address,
    contact,
    studentIds: Array.isArray(studentIds) ? studentIds.map(Number) : [],
  });
  res.status(201).json({ success: true, data: sanitize(parent) });
};

export const postParentChild = async (req: CustomRequest, res: Response): Promise<void> => {
  const { studentId } = req.body;
  if (!studentId) {
    res.status(400).json({ success: false, message: "studentId is required" });
    return;
  }
  const link = await linkChild(Number(req.params.id), Number(studentId));
  res.status(201).json({ success: true, data: link });
};

export const deleteParentChild = async (req: CustomRequest, res: Response): Promise<void> => {
  await unlinkChild(Number(req.params.id), Number(req.params.studentId));
  res.status(200).json({ success: true, message: "Child unlinked from parent" });
};
