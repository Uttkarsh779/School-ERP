import { useState } from "react";
import { toast } from "react-toastify";
import { Icon } from "../ui";
import { usePushNotifications } from "./usePushNotifications";
import styles from "./Notifications.module.css";

const DISMISS_KEY = "rrs_push_banner_dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

// One-time prompt after sign-in to allow phone notifications. Browsers only show their
// permission popup after a tap, so this asks first. On iPhone it explains Add to Home
// Screen, which Apple requires for web notifications.
const EnableNotificationsBanner = () => {
  const push = usePushNotifications();
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode: the banner just comes back next time */
    }
  };

  if (dismissed || !push.available || (push.state !== "default" && push.state !== "ios-install")) return null;

  const turnOn = async () => {
    const ok = await push.enable();
    if (ok) toast.success("Notifications are on for this device.");
    else if (Notification.permission === "denied") toast.info("Notifications are blocked. You can allow them later from the browser's site settings.");
    dismiss();
  };

  return (
    <div className={styles.banner}>
      <span className={styles.bannerIcon}>
        <Icon name="bell" size={18} />
      </span>
      <div className={styles.bannerText}>
        <strong>Get school alerts on this phone</strong>
        <span>
          {push.state === "ios-install"
            ? "On iPhone: tap Share, then “Add to Home Screen”, and open the app from there to turn on notifications."
            : "Absence, fee reminders, results, homework and notices — even when the app is closed."}
        </span>
      </div>
      {push.state === "default" && (
        <button type="button" className={styles.pushBtn} disabled={push.busy} onClick={turnOn}>
          Turn on
        </button>
      )}
      <button type="button" className={styles.bannerClose} aria-label="Dismiss" onClick={dismiss}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
};

export default EnableNotificationsBanner;
