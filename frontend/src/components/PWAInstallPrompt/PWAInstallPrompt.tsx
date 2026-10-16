import { useEffect, useState } from "react";
import styles from "./PWAInstallPrompt.module.css";
import { Icon } from "../ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PWAInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem("rrs_pwa_prompt_dismissed") === "true";
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dismissed || !deferredPrompt) {
    return null;
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("rrs_pwa_prompt_dismissed", "true");
  };

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <div className={styles.iconBadge}>RRS</div>
        <div>
          <div className={styles.title}>Install RRS ERP App</div>
          <div className={styles.subtitle}>Add to phone home screen for fast access</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.installButton} onClick={handleInstall}>
          Install
        </button>
        <button type="button" className={styles.closeButton} onClick={handleDismiss} aria-label="Dismiss">
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
