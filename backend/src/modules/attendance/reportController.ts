import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { getMonthlyClassOverview, getMonthlyClassRegister } from "./reportService";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";

// Admin-only: every class's attendance totals for one month.
export const getMonthlyOverview = async (req: CustomRequest, res: Response): Promise<void> => {
  const data = await getMonthlyClassOverview(req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
};

// One class's day-by-day register for one month. Admins: any class. Teachers: only a
// class they're the class teacher of — the same people who can mark its attendance.
export const getMonthlyRegister = async (req: CustomRequest, res: Response): Promise<void> => {
  const classSectionId = Number(req.params.classSectionId);
  if (req.user!.role === "TEACHER") {
    const staff = await findStaffByUserId(req.user!.id);
    if (!staff || !(await isClassTeacherOfSection(staff.id, classSectionId))) {
      res.status(403).json({ success: false, message: "Only the class teacher can view this class's attendance register" });
      return;
    }
  }
  const data = await getMonthlyClassRegister(classSectionId, req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
};
