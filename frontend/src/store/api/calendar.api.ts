import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export type CalendarKind = "HOLIDAY" | "EVENT";
export type CalendarAudience = "ALL" | "STUDENTS" | "STAFF";

export interface CalendarEvent {
  id: number;
  title: string;
  kind: CalendarKind;
  audience: CalendarAudience;
  startDate: string;
  endDate: string;
  description: string | null;
  createdByUser?: { name: string } | null;
}

export interface CalendarSettings {
  sundayOff: boolean;
  offSaturdays: number[];
}

export interface CalendarEventInput {
  title: string;
  kind: CalendarKind;
  audience: CalendarAudience;
  startDate: string;
  endDate: string;
  description?: string;
}

export const calendarApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getCalendar: builder.query<{ events: CalendarEvent[]; settings: CalendarSettings }, { from: string; to: string }>({
      query: (params) => ({ url: "calendar", params }),
      transformResponse: (res: ApiEnvelope<{ events: CalendarEvent[]; settings: CalendarSettings }>) => res.data,
      providesTags: ["Calendar"],
    }),
    saveCalendarEvent: builder.mutation<CalendarEvent, CalendarEventInput & { id?: number }>({
      query: ({ id, ...body }) => ({ url: id ? `calendar/events/${id}` : "calendar/events", method: id ? "PUT" : "POST", body }),
      transformResponse: (res: ApiEnvelope<CalendarEvent>) => res.data,
      invalidatesTags: ["Calendar"],
    }),
    deleteCalendarEvent: builder.mutation<void, number>({
      query: (id) => ({ url: `calendar/events/${id}`, method: "DELETE" }),
      invalidatesTags: ["Calendar"],
    }),
    updateCalendarSettings: builder.mutation<CalendarSettings, Partial<CalendarSettings>>({
      query: (body) => ({ url: "calendar/settings", method: "PUT", body }),
      invalidatesTags: ["Calendar"],
    }),
    copyCalendar: builder.mutation<{ copied: number; skipped: number }, { fromSessionId: number; toSessionId: number }>({
      query: (body) => ({ url: "calendar/copy", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ copied: number; skipped: number }>) => res.data,
      invalidatesTags: ["Calendar"],
    }),
  }),
});

export const {
  useGetCalendarQuery,
  useSaveCalendarEventMutation,
  useDeleteCalendarEventMutation,
  useUpdateCalendarSettingsMutation,
  useCopyCalendarMutation,
} = calendarApi;
