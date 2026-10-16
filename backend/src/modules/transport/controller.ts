import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import {
  assignStudentTransport,
  createTransportRoute,
  createVehicle,
  listTransportRoutes,
  listVehicles,
  updateTransportRoute,
  updateVehicle,
} from "./service";

export const getTransportRoutes = async (_req: CustomRequest, res: Response): Promise<void> => {
  const routes = await listTransportRoutes();
  res.status(200).json({ success: true, data: routes });
};

export const postTransportRoute = async (req: CustomRequest, res: Response): Promise<void> => {
  const { routeName, stops } = req.body;
  if (!routeName) {
    res.status(400).json({ success: false, message: "routeName is required" });
    return;
  }
  const route = await createTransportRoute({ routeName, stops });
  res.status(201).json({ success: true, data: route });
};

export const patchTransportRoute = async (req: CustomRequest, res: Response): Promise<void> => {
  const { routeName, stops } = req.body;
  const route = await updateTransportRoute(Number(req.params.id), { routeName, stops });
  res.status(200).json({ success: true, data: route });
};

export const getVehicles = async (_req: CustomRequest, res: Response): Promise<void> => {
  const vehicles = await listVehicles();
  res.status(200).json({ success: true, data: vehicles });
};

export const postVehicle = async (req: CustomRequest, res: Response): Promise<void> => {
  const { vehicleNo, driverName, driverContact, ownerName, ownerContact, capacity, routeId } = req.body;
  if (!vehicleNo) {
    res.status(400).json({ success: false, message: "vehicleNo is required" });
    return;
  }
  const vehicle = await createVehicle({
    vehicleNo,
    driverName,
    driverContact,
    ownerName,
    ownerContact,
    capacity: capacity !== undefined && capacity !== null ? Number(capacity) : undefined,
    routeId: routeId !== undefined && routeId !== null ? Number(routeId) : undefined,
  });
  res.status(201).json({ success: true, data: vehicle });
};

export const patchVehicle = async (req: CustomRequest, res: Response): Promise<void> => {
  const { vehicleNo, driverName, driverContact, ownerName, ownerContact, capacity, routeId } = req.body;
  const vehicle = await updateVehicle(Number(req.params.id), {
    vehicleNo,
    driverName,
    driverContact,
    ownerName,
    ownerContact,
    capacity: capacity === undefined ? undefined : capacity === null ? null : Number(capacity),
    routeId: routeId === undefined ? undefined : routeId === null ? null : Number(routeId),
  });
  res.status(200).json({ success: true, data: vehicle });
};

export const patchAssignStudent = async (req: CustomRequest, res: Response): Promise<void> => {
  const { studentId, transportRouteId } = req.body;
  if (!studentId) {
    res.status(400).json({ success: false, message: "studentId is required" });
    return;
  }
  const student = await assignStudentTransport(
    Number(studentId),
    transportRouteId === undefined || transportRouteId === null ? null : Number(transportRouteId)
  );
  res.status(200).json({ success: true, data: student });
};
