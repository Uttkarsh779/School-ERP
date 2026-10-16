import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

const Card = ({ title, subtitle, action, padded = true, className, children }: CardProps) => (
  <div className={[styles.card, className ?? ""].filter(Boolean).join(" ")}>
    {(title || action) && (
      <div className={styles.header}>
        <div>
          {title && <h3 className={styles.title}>{title}</h3>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    <div className={padded ? styles.body : ""}>{children}</div>
  </div>
);

export default Card;
