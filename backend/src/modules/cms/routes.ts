import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

export const publicCmsRouter = Router();

// Public routes for visitors (no auth required)
publicCmsRouter.get("/website", asyncHandler(controller.getPublicWebsiteData));
publicCmsRouter.post("/inquiry", asyncHandler(controller.postAdmissionInquiry));

export const adminCmsRouter = Router();

// All admin CMS routes require auth and admin role
adminCmsRouter.use(authenticateToken);
adminCmsRouter.use(authorizeRoles(["SUPER_ADMIN", "ADMIN"]));

// Website Settings
adminCmsRouter.get("/settings", asyncHandler(controller.getSettings));
adminCmsRouter.put("/settings", asyncHandler(controller.updateSettings));

// Campus Facilities
adminCmsRouter.get("/facilities", asyncHandler(controller.getFacilities));
adminCmsRouter.post("/facilities", asyncHandler(controller.createFacility));
adminCmsRouter.put("/facilities/:id", asyncHandler(controller.updateFacility));
adminCmsRouter.delete("/facilities/:id", asyncHandler(controller.deleteFacility));

// Public Circulars & Notices
adminCmsRouter.get("/notices", asyncHandler(controller.getPublicNotices));
adminCmsRouter.post("/notices", asyncHandler(controller.createPublicNotice));
adminCmsRouter.put("/notices/:id", asyncHandler(controller.updatePublicNotice));
adminCmsRouter.delete("/notices/:id", asyncHandler(controller.deletePublicNotice));

// Admission Enquiries
adminCmsRouter.get("/inquiries", asyncHandler(controller.getAdmissionInquiries));
adminCmsRouter.patch("/inquiries/:id", asyncHandler(controller.updateInquiryStatus));
