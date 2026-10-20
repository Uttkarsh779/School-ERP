import { Router, type NextFunction, type Request, type Response } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

// Simple per-IP limit on the public enquiry form (5 per 15 minutes) to keep spam out.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
const inquiryLimiter = (req: Request, res: Response, next: NextFunction) => {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    res.status(429).json({ success: false, message: "Too many enquiries from this device. Please try again later or call the school office." });
    return;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  next();
};

export const publicCmsRouter = Router();

// Public routes for visitors (no auth required)
publicCmsRouter.get("/website", asyncHandler(controller.getPublicWebsiteData));
publicCmsRouter.post("/inquiry", inquiryLimiter, asyncHandler(controller.postAdmissionInquiry));

export const adminCmsRouter = Router();

// All admin CMS routes require auth and admin role
adminCmsRouter.use(authenticateToken);
adminCmsRouter.use(authorizeRoles(["SUPER_ADMIN", "ADMIN"]));

// Website settings
adminCmsRouter.get("/settings", asyncHandler(controller.getSettings));
adminCmsRouter.put("/settings", asyncHandler(controller.updateSettings));

// Admission enquiries
adminCmsRouter.get("/inquiries", asyncHandler(controller.getAdmissionInquiries));
adminCmsRouter.patch("/inquiries/:id", asyncHandler(controller.updateInquiryStatus));

// Content collections: facilities | gallery | notices | testimonials | faqs
adminCmsRouter.get("/:collection", asyncHandler(controller.listCollection));
adminCmsRouter.post("/:collection", asyncHandler(controller.createCollectionItem));
adminCmsRouter.put("/:collection/:id", asyncHandler(controller.updateCollectionItem));
adminCmsRouter.delete("/:collection/:id", asyncHandler(controller.deleteCollectionItem));
