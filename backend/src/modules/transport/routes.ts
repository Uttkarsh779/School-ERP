import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getTransportRoutes,
  getVehicles,
  patchAssignStudent,
  patchTransportRoute,
  patchVehicle,
  postEndStudentTransport,
  postTransportRoute,
  postVehicle,
} from "./controller";

const router = Router();

router.use(authenticateToken);

// Read access — every authenticated role (a student/parent needs to see which
// route/vehicle their child is on). Changes are the office's.
router.get("/routes", asyncHandler(getTransportRoutes));
router.get("/vehicles", asyncHandler(getVehicles));

router.post("/routes", allow("transport.edit"), asyncHandler(postTransportRoute));
router.patch("/routes/:id", allow("transport.edit"), asyncHandler(patchTransportRoute));

router.post("/vehicles", allow("transport.edit"), asyncHandler(postVehicle));
router.patch("/vehicles/:id", allow("transport.edit"), asyncHandler(patchVehicle));

router.patch("/assign-student", allow("transport.edit"), asyncHandler(patchAssignStudent));
router.post("/students/:studentId/end", allow("transport.edit"), asyncHandler(postEndStudentTransport));

export default router;
