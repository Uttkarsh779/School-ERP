import { prisma } from "../../config/prisma";

// Routes — the school-bus routes themselves, each with its assigned vehicle(s)
// and a live count of students riding it.
export const listTransportRoutes = () =>
  prisma.transportRoute.findMany({
    include: { vehicles: true, _count: { select: { students: true } } },
    orderBy: { routeName: "asc" },
  });

export const getTransportRouteById = (id: number) =>
  prisma.transportRoute.findUnique({ where: { id } });

export const createTransportRoute = (data: { routeName: string; stops?: string }) =>
  prisma.transportRoute.create({ data });

export const updateTransportRoute = (
  id: number,
  data: { routeName?: string; stops?: string | null }
) => prisma.transportRoute.update({ where: { id }, data });

// Vehicles — listed on their own (not nested under a route) so unassigned
// vehicles still show up in the admin's Vehicles table.
export const listVehicles = () =>
  prisma.vehicle.findMany({
    include: { route: true },
    orderBy: { vehicleNo: "asc" },
  });

export const createVehicle = (data: {
  vehicleNo: string;
  driverName?: string;
  driverContact?: string;
  ownerName?: string;
  ownerContact?: string;
  capacity?: number;
  routeId?: number;
}) => prisma.vehicle.create({ data });

export const updateVehicle = (
  id: number,
  data: {
    vehicleNo?: string;
    driverName?: string | null;
    driverContact?: string | null;
    ownerName?: string | null;
    ownerContact?: string | null;
    capacity?: number | null;
    routeId?: number | null;
  }
) => prisma.vehicle.update({ where: { id }, data });

// Assigning/unassigning a student's transport route. Student is "owned" by the
// students module, but this write lives here since it's purely a transport
// concern (transportRouteId) — no other students-module file is touched.
export const assignStudentTransport = (studentId: number, transportRouteId: number | null) =>
  prisma.student.update({ where: { id: studentId }, data: { transportRouteId } });
