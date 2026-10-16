import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Tone = "success" | "danger" | "warning" | "info" | "neutral" | "primary";

interface BadgeProps {
  tone?: Tone;
  variant?: Tone;
  dot?: boolean;
  children: ReactNode;
}

const Badge = ({ tone, variant, dot = false, children }: BadgeProps) => {
  const rawTone = tone || variant || "neutral";
  const activeTone = rawTone;
  return (
    <span className={[styles.badge, styles[activeTone]].join(" ")}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
};

export default Badge;
