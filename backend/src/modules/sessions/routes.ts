import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getSessions, postSession, putCurrentSession } from "./controller";

const router = Router();

router.use(authenticateToken);

router.get("/", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(getSessions));
router.post("/", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(postSession));
router.put("/:id/set-current", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(putCurrentSession));

export default router;
