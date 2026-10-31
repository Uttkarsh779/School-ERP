import webpush from "web-push";
import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Notifications: every alert is saved for the in-app bell and, when the user has allowed
// it on a phone/browser, sent as a Web Push notification (free — the browser's own push
// service, no SMS/WhatsApp provider). Push needs VAPID keys in .env; without them the
// bell still works and push is skipped.

export type NotificationType = "ABSENT" | "FEE_DUE" | "FEE_OVERDUE" | "PAYMENT" | "RESULTS" | "HOMEWORK" | "NOTICE" | "LEAVE" | "HOLIDAY";

export interface NotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  // Same key for the same user is stored/sent only once.
  dedupeKey?: string | null;
}

const vapid = {
  publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
};
const pushEnabled = Boolean(vapid.publicKey && vapid.privateKey);
if (pushEnabled) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
else console.warn("[Notifications] VAPID keys not set — push notifications are off (in-app bell still works).");

export const getPushPublicKey = () => (pushEnabled ? vapid.publicKey : null);

const sendPush = async (rows: Array<{ id: number; userId: number; title: string; body: string; link: string | null; type: string }>) => {
  if (!pushEnabled || rows.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } } });
  if (subs.length === 0) return;

  const dead: number[] = [];
  await Promise.allSettled(
    rows.flatMap((n) =>
      subs
        .filter((s: any) => s.userId === n.userId)
        .map((s: any) =>
          webpush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: n.title, body: n.body.slice(0, 300), link: n.link, tag: `${n.type}-${n.id}` }),
              { TTL: 60 * 60 * 24, urgency: n.type === "ABSENT" ? "high" : "normal" }
            )
            .catch((err: any) => {
              // 404/410: the browser dropped this subscription (app uninstalled, permission revoked).
              if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
              else console.warn(`[Notifications] Push failed (${err?.statusCode ?? err?.message})`);
            })
        )
    )
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
};

export const notify = async (items: NotificationInput[]) => {
  if (items.length === 0) return [];
  const created = await prisma.notification.createManyAndReturn({
    data: items.map((i) => ({ ...i, title: i.title.slice(0, 200), body: i.body.slice(0, 1000), link: i.link ?? null, dedupeKey: i.dedupeKey ?? null })),
    skipDuplicates: true,
  });
  await sendPush(created);
  return created;
};

// Runs after the current request: working out recipients and sending never slows down or
// breaks the action that triggered it (marking attendance, recording a payment…).
export const notifyLater = (build: () => Promise<NotificationInput[]>) => {
  setImmediate(() => {
    build()
      .then(notify)
      .catch((err) => console.error("[Notifications]", err?.message ?? err));
  });
};

// ---------------------------------------------------------------------------
// The signed-in user's notifications
// ---------------------------------------------------------------------------

export const listMyNotifications = async (userId: number) => {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unreadCount };
};

export const markRead = (userId: number, id: number) =>
  prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });

export const markAllRead = (userId: number) => prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

export const savePushSubscription = async (userId: number, body: any, userAgent?: string) => {
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw httpError(400, "Invalid push subscription");
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) throw httpError(400, "Invalid push subscription keys");
  // A device belongs to whoever signed in on it last.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, p256dh, auth, userAgent: userAgent?.slice(0, 300) ?? null },
  });
};

export const removePushSubscription = (userId: number, endpoint: unknown) =>
  typeof endpoint === "string" ? prisma.pushSubscription.deleteMany({ where: { userId, endpoint } }) : Promise.resolve({ count: 0 });
