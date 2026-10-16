import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface CreateTransportRouteInput {
  routeName: string;
  stops?: string;
}

export interface UpdateTransportRouteInput {
  id: number;
  routeName?: string;
  stops?: string | null;
}

export interface CreateVehicleInput {
  vehicleNo: string;
  driverName?: string;
  driverContact?: string;
  ownerName?: string;
  ownerContact?: string;
  capacity?: number;
  routeId?: number;
}

export interface UpdateVehicleInput {
  id: number;
  vehicleNo?: string;
  driverName?: string | null;
  driverContact?: string | null;
  ownerName?: string | null;
  ownerContact?: string | null;
  capacity?: number | null;
  routeId?: number | null;
}

export interface AssignStudentTransportInput {
  studentId: number;
  transportRouteId: number | null;
}

export interface TransportVillage {
  id: number;
  name: string;
  monthlyFee: number;
  isActive: boolean;
}

export interface AssignStudentVillageInput {
  studentId: number;
  villageId: number;
  startDate: string;
  policy?: "FULL_MONTH" | "PRORATED" | "NEXT_PERIOD";
}

// Tag name "Transport" is referenced here as a plain string — the integration
// pass wires it into erpApi's tagTypes list. Until then, "Transport" isn't yet
// part of erpApi's declared TagTypes union, so the tag arrays below are cast
// through `any` (runtime behavior is unaffected — RTK Query tags are plain
// strings) to keep this file type-checking cleanly in isolation.
export const transportApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getTransportRoutes: builder.query<ITransportRoute[], void>({
      query: () => "transport/routes",
      transformResponse: (res: ApiEnvelope<ITransportRoute[]>) => res.data,
      providesTags: ["Transport"],
    }),
    createTransportRoute: builder.mutation<ITransportRoute, CreateTransportRouteInput>({
      query: (body) => ({ url: "transport/routes", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<ITransportRoute>) => res.data,
      invalidatesTags: ["Transport"],
    }),
    updateTransportRoute: builder.mutation<ITransportRoute, UpdateTransportRouteInput>({
      query: ({ id, ...body }) => ({ url: `transport/routes/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<ITransportRoute>) => res.data,
      invalidatesTags: ["Transport"],
    }),
    getVehicles: builder.query<IVehicle[], void>({
      query: () => "transport/vehicles",
      transformResponse: (res: ApiEnvelope<IVehicle[]>) => res.data,
      providesTags: ["Transport"],
    }),
    createVehicle: builder.mutation<IVehicle, CreateVehicleInput>({
      query: (body) => ({ url: "transport/vehicles", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<IVehicle>) => res.data,
      invalidatesTags: ["Transport"],
    }),
    updateVehicle: builder.mutation<IVehicle, UpdateVehicleInput>({
      query: ({ id, ...body }) => ({ url: `transport/vehicles/${id}`, method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<IVehicle>) => res.data,
      invalidatesTags: ["Transport"],
    }),
    assignStudentTransport: builder.mutation<IStudent, AssignStudentTransportInput>({
      query: (body) => ({ url: "transport/assign-student", method: "PATCH", body }),
      transformResponse: (res: ApiEnvelope<IStudent>) => res.data,
      invalidatesTags: ["Transport", "Student"],
    }),
    getVillages: builder.query<TransportVillage[], { includeInactive?: boolean } | void>({
      query: (params) => ({
        url: "transport/villages",
        params: params ? { includeInactive: params.includeInactive } : undefined,
      }),
      transformResponse: (res: ApiEnvelope<TransportVillage[]>) => res.data,
      providesTags: ["Transport"],
    }),
    assignStudentVillage: builder.mutation<any, AssignStudentVillageInput>({
      query: (body) => ({ url: "transport/assignments", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<any>) => res.data,
      invalidatesTags: ["Transport", "Student"],
    }),
  }),
});

export const {
  useGetTransportRoutesQuery,
  useCreateTransportRouteMutation,
  useUpdateTransportRouteMutation,
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useAssignStudentTransportMutation,
  useGetVillagesQuery,
  useAssignStudentVillageMutation,
} = transportApi;
