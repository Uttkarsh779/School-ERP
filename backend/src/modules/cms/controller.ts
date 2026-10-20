import type { Request, Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import * as cmsService from "./cmsService";

// Public website
export const getPublicWebsiteData = async (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=60");
  res.json({ success: true, data: await cmsService.getPublicWebsiteData() });
};

export const postAdmissionInquiry = async (req: Request, res: Response) => {
  const message = "Thank you! Your admission enquiry has been received. Our admissions team will contact you shortly.";
  // Honeypot: real visitors never see/fill the hidden "website" field; bots do.
  if (typeof req.body?.website === "string" && req.body.website.trim() !== "") {
    res.status(201).json({ success: true, message });
    return;
  }
  const data = await cmsService.submitAdmissionInquiry(req.body ?? {});
  res.status(201).json({ success: true, message, data });
};

// Admin: settings
export const getSettings = async (_req: CustomRequest, res: Response) => {
  res.json({ success: true, data: await cmsService.getWebsiteSettings() });
};

export const updateSettings = async (req: CustomRequest, res: Response) => {
  const data = await cmsService.updateWebsiteSettings(req.body ?? {});
  res.json({ success: true, data, message: "Website settings saved" });
};

// Admin: content collections (facilities, gallery, notices, testimonials, faqs)
export const listCollection = async (req: CustomRequest, res: Response) => {
  res.json({ success: true, data: await cmsService.listCollection(String(req.params.collection)) });
};

export const createCollectionItem = async (req: CustomRequest, res: Response) => {
  const data = await cmsService.createCollectionItem(String(req.params.collection), req.body ?? {});
  res.status(201).json({ success: true, data, message: "Added" });
};

export const updateCollectionItem = async (req: CustomRequest, res: Response) => {
  const data = await cmsService.updateCollectionItem(String(req.params.collection), Number(req.params.id), req.body ?? {});
  res.json({ success: true, data, message: "Saved" });
};

export const deleteCollectionItem = async (req: CustomRequest, res: Response) => {
  const noun = await cmsService.deleteCollectionItem(String(req.params.collection), Number(req.params.id));
  res.json({ success: true, message: `${noun} removed` });
};

// Admin: admission enquiries
export const getAdmissionInquiries = async (req: CustomRequest, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ success: true, data: await cmsService.getAdmissionInquiries(status) });
};

export const updateInquiryStatus = async (req: CustomRequest, res: Response) => {
  const data = await cmsService.updateInquiryStatus(Number(req.params.id), req.body?.status, req.body?.notes);
  res.json({ success: true, data, message: "Enquiry updated" });
};
