import { useCallback, useEffect, useState } from "react";
import { useGetPushPublicKeyQuery, useSavePushSubscriptionMutation } from "../../store/api/notifications.api";

// Web Push for the signed-in user. Works where the app's service worker runs (the built
// app, not `npm run dev`). On iPhone it needs the app added to the Home Screen first.
// Sign-out removes the device's subscription (store.ts), so the next sign-in here
// subscribes again for the new account — silently, since permission is already granted.

type PushState = "unsupported" | "ios-install" | "default" | "granted" | "denied";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// The service worker registers shortly after load; in `npm run dev` there is none.
const serviceWorker = () =>
  Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);

const currentState = (): PushState => {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  return Notification.permission as PushState;
};

export const usePushNotifications = () => {
  const [state, setState] = useState<PushState>(() => currentState());
  const [busy, setBusy] = useState(false);
  const { data: key } = useGetPushPublicKeyQuery(undefined, { skip: state === "unsupported" || state === "ios-install" });
  const [save] = useSavePushSubscriptionMutation();
  const publicKey = key?.publicKey ?? null;

  const subscribe = useCallback(async () => {
    if (!publicKey) return false;
    const reg = await serviceWorker();
    if (!reg) throw new Error("No service worker");
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    await save(sub.toJSON()).unwrap();
    return true;
  }, [publicKey, save]);

  // Already allowed on this device: make sure the server has it for this account.
  useEffect(() => {
    if (state === "granted" && publicKey) subscribe().catch(() => undefined);
  }, [state, publicKey, subscribe]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission === "granted") await subscribe();
      return permission === "granted";
    } catch {
      setState("unsupported");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // The server has no push keys configured: nothing to subscribe to.
  const available = publicKey !== null || state === "ios-install";
  return { state, available, enable, busy };
};
