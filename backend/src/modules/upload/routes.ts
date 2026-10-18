import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { upload } from "../../middleware/upload";
import { asyncHandler } from "../../utils/asyncHandler";
import * as uploadController from "./controller";

const uploadRouter = Router();

uploadRouter.post(
  "/",
  authenticateToken,
  upload.single("file"),
  asyncHandler(uploadController.handleFileUpload)
);

export default uploadRouter;
