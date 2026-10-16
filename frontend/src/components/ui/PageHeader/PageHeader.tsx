import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

const PageHeader = ({ title, subtitle, actions, children }: PageHeaderProps) => (
  <div className={styles.header}>
    <div>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
    {(actions || children) && <div className={styles.actions}>{actions || children}</div>}
  </div>
);

export default PageHeader;
