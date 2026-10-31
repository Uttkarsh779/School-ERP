import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../ui";
import {
  useGetMyNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  type AppNotification,
} from "../../store/api/notifications.api";
import { usePushNotifications } from "./usePushNotifications";
import styles from "./Notifications.module.css";

const TYPE_ICON: Record<AppNotification["type"], Parameters<typeof Icon>[0]["name"]> = {
  ABSENT: "calendar",
  FEE_DUE: "wallet",
  FEE_OVERDUE: "wallet",
  PAYMENT: "check",
  RESULTS: "graduationCap",
  HOMEWORK: "fileText",
  NOTICE: "bell",
  LEAVE: "clipboardCheck",
  HOLIDAY: "calendar",
};
const TONE: Partial<Record<AppNotification["type"], string>> = { ABSENT: "warn", FEE_OVERDUE: "bad", PAYMENT: "good", RESULTS: "good" };

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

// Bell with unread count; the panel lists recent notifications and offers to turn on
// phone notifications. Checks for new ones every minute.
const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useGetMyNotificationsQuery(undefined, { pollingInterval: 60_000 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll] = useMarkAllNotificationsReadMutation();
  const push = usePushNotifications();
  const unread = data?.unreadCount ?? 0;

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (n: AppNotification) => {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className={styles.bellWrap} ref={ref}>
      <button
        type="button"
        className={styles.bell}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && <span className={styles.count}>{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHead}>
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className={styles.textBtn} onClick={() => markAll()}>
                Mark all read
              </button>
            )}
          </div>

          {push.available && push.state === "default" && (
            <div className={styles.pushRow}>
              <span>Get alerts on this device even when the app is closed.</span>
              <button type="button" className={styles.pushBtn} disabled={push.busy} onClick={() => push.enable()}>
                Turn on
              </button>
            </div>
          )}

          <div className={styles.list}>
            {!data?.items.length ? (
              <div className={styles.empty}>
                <Icon name="bell" size={26} />
                <span>No notifications yet</span>
              </div>
            ) : (
              data.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.item} ${n.readAt ? "" : styles.unread}`}
                  onClick={() => openItem(n)}
                >
                  <span className={`${styles.itemIcon} ${TONE[n.type] ? styles[TONE[n.type]!] : ""}`}>
                    <Icon name={TYPE_ICON[n.type] ?? "bell"} size={16} />
                  </span>
                  <span className={styles.itemText}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    <span className={styles.itemBody}>{n.body}</span>
                    <span className={styles.itemTime}>{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className={styles.dot} aria-label="Unread" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
