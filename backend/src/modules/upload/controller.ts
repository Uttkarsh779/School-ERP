import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { uploadBufferToCloudinary } from "../../config/cloudinary";
import { MAX_DOCUMENT_BYTES, SHRINKABLE_IMAGES } from "../../middleware/upload";

// Everything goes under school_erp/… so a client can't scatter files across the account.
const safeFolder = (raw: unknown) => {
  const f = typeof raw === "string" ? raw.trim().replace(/[^a-zA-Z0-9_/-]/g, "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "") : "";
  if (!f) return "school_erp";
  return f === "school_erp" || f.startsWith("school_erp/") ? f.slice(0, 80) : `school_erp/${f}`.slice(0, 80);
};

const mb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

export const handleFileUpload = async (req: CustomRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file was uploaded" });
  }

  // Photos are shrunk on the way in (below); anything stored as-is has a lower limit.
  const shrinkable = SHRINKABLE_IMAGES.includes(req.file.mimetype);
  if (!shrinkable && req.file.size > MAX_DOCUMENT_BYTES) {
    return res.status(400).json({
      success: false,
      message: `This file is ${mb(req.file.size)}. PDFs and other files can be at most ${mb(MAX_DOCUMENT_BYTES)} — please compress it or scan at a lower quality.`,
    });
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, safeFolder(req.body.folder), "auto", shrinkable);

  return res.status(200).json({
    success: true,
    message: "File uploaded successfully to Cloudinary",
    data: {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    },
  });
};
