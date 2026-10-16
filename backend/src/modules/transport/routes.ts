import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getTransportRoutes,
  getVehicles,
  patchAssignStudent,
  patchTransportRoute,
  patchVehicle,
  postTransportRoute,
  postVehicle,
} from "./controller";

const router = Router();

router.use(authenticateToken);

// Read access — every authenticated role (a student/parent needs to see which
// route/vehicle their child is on). Mutations are admin-only.
router.get("/routes", asyncHandler(getTransportRoutes));
router.get("/vehicles", asyncHandler(getVehicles));

router.post("/routes", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postTransportRoute));
router.patch("/routes/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchTransportRoute));

router.post("/vehicles", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(postVehicle));
router.patch("/vehicles/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchVehicle));

router.patch("/assign-student", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(patchAssignStudent));

export default router;
