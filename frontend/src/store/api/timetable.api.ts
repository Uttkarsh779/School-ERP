import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface UpsertTimetableSlotInput {
  classSectionId: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectId?: number | null;
  staffId?: number | null;
  room?: string | null;
}

export const timetableApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getClassTimetable: builder.query<ITimetableSlot[], { classSectionId: number }>({
      query: (params) => ({ url: "timetable", params }),
      transformResponse: (res: ApiEnvelope<ITimetableSlot[]>) => res.data,
      providesTags: ["Timetable"],
    }),
    getMyTimetable: builder.query<ITimetableSlot[], void>({
      query: () => "timetable/mine",
      transformResponse: (res: ApiEnvelope<ITimetableSlot[]>) => res.data,
      providesTags: ["Timetable"],
    }),
    upsertTimetableSlot: builder.mutation<ITimetableSlot, UpsertTimetableSlotInput>({
      query: (body) => ({ url: "timetable", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<ITimetableSlot>) => res.data,
      invalidatesTags: ["Timetable"],
    }),
    deleteTimetableSlot: builder.mutation<void, number>({
      query: (id) => ({ url: `timetable/${id}`, method: "DELETE" }),
      invalidatesTags: ["Timetable"],
    }),
  }),
});

export const {
  useGetClassTimetableQuery,
  useGetMyTimetableQuery,
  useUpsertTimetableSlotMutation,
  useDeleteTimetableSlotMutation,
} = timetableApi;
