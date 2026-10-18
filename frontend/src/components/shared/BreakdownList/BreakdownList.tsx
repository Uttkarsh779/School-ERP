import styles from "./BreakdownList.module.css";

export interface BreakdownItem {
  label: string;
  value: number;
  // Optional pre-formatted value (e.g. "₹1,20,000") shown instead of the raw number.
  display?: string;
  hint?: string;
}

interface BreakdownListProps {
  items: BreakdownItem[];
  emptyMessage?: string;
}

// Horizontal proportional bars for a category/status breakdown — each bar's width is the
// item's share of the largest value. Purely a view of the numbers passed in.
const BreakdownList = ({ items, emptyMessage = "No data yet" }: BreakdownListProps) => {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.label} className={styles.item}>
          <div className={styles.row}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.value}>
              {item.display ?? item.value.toLocaleString("en-IN")}
              {item.hint && <span className={styles.hint}> · {item.hint}</span>}
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.bar} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default BreakdownList;
