import type { CSSProperties, ReactNode } from "react";
import styles from "./FormSection.module.css";

interface FormSectionProps {
  title: string;
  children: ReactNode;
}

// A bordered, titled section for grouping related form fields — e.g. "General
// Information" / "Family Information" / "Government ID" — with a two-column
// FormGrid inside. Mirrors the school's existing admin-form pattern.
const FormSection = ({ title, children }: FormSectionProps) => (
  <div className={styles.section}>
    <div className={styles.header}>{title}</div>
    <div className={styles.body}>{children}</div>
  </div>
);

interface FormGridProps {
  columns?: number;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

// Two-column responsive grid for a FormSection's fields (collapses to one column
// on narrow screens). Give a field `style={{ gridColumn: "1 / -1" }}` to span both.
export const FormGrid = ({ columns, children, style, className }: FormGridProps) => (
  <div
    className={`${styles.grid}${className ? ` ${className}` : ""}`}
    style={{
      ...(columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : {}),
      ...style
    }}
  >
    {children}
  </div>
);

export default FormSection;
