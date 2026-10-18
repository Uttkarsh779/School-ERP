import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import { uploadBufferToCloudinary } from "../../config/cloudinary";

export const handleFileUpload = async (req: CustomRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file was uploaded" });
  }

  const folder = (req.body.folder as string) || "school_erp";
  const result = await uploadBufferToCloudinary(req.file.buffer, folder);

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
