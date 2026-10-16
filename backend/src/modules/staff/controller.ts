import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { hashPassword } from "../../utils/password";
import {
  createStaff,
  findUserByEmail,
  getStaffById,
  isAccountRequiredRole,
  listStaff,
  setStaffActive,
  updateStaff,
} from "./service";

// Strip passwordHash before a staff record (with its nested user) leaves the API.
const sanitize = <T extends { user?: { passwordHash?: string } | null }>(staff: T) => {
  if (!staff.user) return staff;
  const { passwordHash: _passwordHash, ...user } = staff.user;
  return { ...staff, user };
};

export const getStaffList = async (_req: CustomRequest, res: Response): Promise<void> => {
  const staff = await listStaff();
  res.status(200).json({ success: true, data: staff.map(sanitize) });
};

export const getStaff = async (req: CustomRequest, res: Response): Promise<void> => {
  const staff = await getStaffById(Number(req.params.id));
  if (!staff) {
    res.status(404).json({ success: false, message: "Staff not found" });
    return;
  }
  res.status(200).json({ success: true, data: sanitize(staff) });
};

export const postStaff = async (req: CustomRequest, res: Response): Promise<void> => {
  const { email, password, name, qualifications, contact, staffCategory } = req.body;
  if (!name) {
    res.status(400).json({ success: false, message: "Full Name is required" });
    return;
  }

  const category = staffCategory || "TEACHER";
  const needsAccount = isAccountRequiredRole(category);

  if (needsAccount && (!email || !email.trim())) {
    res.status(400).json({ success: false, message: "Email address is required for Teaching & Admin staff accounts" });
    return;
  }

  if (email && email.trim()) {
    const existing = await findUserByEmail(email.trim());
    if (existing) {
      res.status(409).json({ success: false, message: "A user with this email already exists" });
      return;
    }
  }

  const pwd = password || "Staff@12345";
  const passwordHash = await hashPassword(pwd);
  const staff = await createStaff({ email, passwordHash, name, qualifications, contact, staffCategory: category });
  res.status(201).json({ success: true, data: sanitize(staff) });
};

export const patchStaff = async (req: CustomRequest, res: Response): Promise<void> => {
  const { name, email, qualifications, contact, staffCategory } = req.body;
  const staff = await updateStaff(Number(req.params.id), { name, email, qualifications, contact, staffCategory });
  res.status(200).json({ success: true, data: sanitize(staff) });
};

export const patchStaffActive = async (req: CustomRequest, res: Response): Promise<void> => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    res.status(400).json({ success: false, message: "isActive (boolean) is required" });
    return;
  }
  await setStaffActive(Number(req.params.id), isActive);
  res.status(200).json({ success: true, message: `Staff ${isActive ? "activated" : "deactivated"}` });
};
