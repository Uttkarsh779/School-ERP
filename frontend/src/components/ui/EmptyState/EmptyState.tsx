import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

const EmptyState = ({ title, description, action }: EmptyStateProps) => (
  <div className={styles.wrapper}>
    <p className={styles.title}>{title}</p>
    {description && <p className={styles.description}>{description}</p>}
    {action}
  </div>
);

export default EmptyState;
