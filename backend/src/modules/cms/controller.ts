import type { Request, Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import * as cmsService from "./cmsService";

// Public website endpoints (No auth required)
export const getPublicWebsiteData = async (_req: Request, res: Response) => {
  try {
    const data = await cmsService.getPublicWebsiteData();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || "Failed to load website content" });
  }
};

export const postAdmissionInquiry = async (req: Request, res: Response) => {
  try {
    const inquiry = await cmsService.submitAdmissionInquiry(req.body);
    res.status(201).json({
      success: true,
      message: "Thank you! Your admission enquiry has been submitted. Our admissions team will reach out to you shortly.",
      data: inquiry,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to submit enquiry" });
  }
};

// Admin CMS endpoints
export const getSettings = async (_req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.getWebsiteSettings();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateSettings = async (req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.updateWebsiteSettings(req.body);
    res.json({ success: true, data, message: "Website settings updated successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getFacilities = async (_req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.getFacilities(true);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createFacility = async (req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.createFacility(req.body);
    res.status(201).json({ success: true, data, message: "Facility added successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateFacility = async (req: CustomRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = await cmsService.updateFacility(id, req.body);
    res.json({ success: true, data, message: "Facility updated successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteFacility = async (req: CustomRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await cmsService.deleteFacility(id);
    res.json({ success: true, message: "Facility removed successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getPublicNotices = async (_req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.getPublicNotices(true);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createPublicNotice = async (req: CustomRequest, res: Response) => {
  try {
    const data = await cmsService.createPublicNotice(req.body);
    res.status(201).json({ success: true, data, message: "Notice published successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updatePublicNotice = async (req: CustomRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const data = await cmsService.updatePublicNotice(id, req.body);
    res.json({ success: true, data, message: "Notice updated successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deletePublicNotice = async (req: CustomRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await cmsService.deletePublicNotice(id);
    res.json({ success: true, message: "Notice deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getAdmissionInquiries = async (req: CustomRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const data = await cmsService.getAdmissionInquiries(status);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateInquiryStatus = async (req: CustomRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { status, notes } = req.body;
    const data = await cmsService.updateInquiryStatus(id, status, notes);
    res.json({ success: true, data, message: "Inquiry status updated" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};
