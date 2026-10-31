import { erpApi } from "./erpApi";

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface AppNotification {
  id: number;
  type: "ABSENT" | "FEE_DUE" | "FEE_OVERDUE" | "PAYMENT" | "RESULTS" | "HOMEWORK" | "NOTICE" | "LEAVE" | "HOLIDAY";
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyNotifications: builder.query<{ items: AppNotification[]; unreadCount: number }, void>({
      query: () => "notifications",
      transformResponse: (res: ApiEnvelope<{ items: AppNotification[]; unreadCount: number }>) => res.data,
      providesTags: ["Notification"],
    }),
    markNotificationRead: builder.mutation<void, number>({
      query: (id) => ({ url: `notifications/${id}/read`, method: "PATCH" }),
      invalidatesTags: ["Notification"],
    }),
    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: "notifications/read-all", method: "PATCH" }),
      invalidatesTags: ["Notification"],
    }),
    getPushPublicKey: builder.query<{ publicKey: string | null }, void>({
      query: () => "notifications/push/key",
      transformResponse: (res: ApiEnvelope<{ publicKey: string | null }>) => res.data,
    }),
    savePushSubscription: builder.mutation<void, PushSubscriptionJSON>({
      query: (body) => ({ url: "notifications/push/subscribe", method: "POST", body }),
    }),
  }),
});

export const {
  useGetMyNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetPushPublicKeyQuery,
  useSavePushSubscriptionMutation,
} = notificationsApi;
