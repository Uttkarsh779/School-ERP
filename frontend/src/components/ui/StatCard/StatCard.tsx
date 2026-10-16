import type { ReactNode } from "react";
import styles from "./StatCard.module.css";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
}

const StatCard = ({ label, value, icon, trend }: StatCardProps) => (
  <div className={styles.card}>
    {icon && <div className={styles.icon}>{icon}</div>}
    <div>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
      {trend && (
        <div className={`${styles.trend} ${trend.isPositive ? styles.trendPositive : styles.trendNegative}`}>
          <span>{trend.isPositive ? "▲" : "▼"}</span>
          <span>{trend.value} {trend.label}</span>
        </div>
      )}
    </div>
  </div>
);

export default StatCard;
