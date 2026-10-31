import multer from "multer";

const storage = multer.memoryStorage();

// Upload limits (Cloudinary free plan, see modules/upload/controller.ts):
//  - photos up to 10 MB are accepted, then stored shrunk to at most 1600 px;
//  - PDFs (and other files stored as-is) up to 5 MB;
//  - SVG/GIF are stored as-is, so they're held to the PDF limit too.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const SHRINKABLE_IMAGES = ["image/jpeg", "image/png", "image/webp"];

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload an image (JPG, PNG, WebP, GIF, SVG) or PDF."));
    }
  },
});
