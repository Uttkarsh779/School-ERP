import { Icon } from "../../../../../components/ui";
import type { HealthAlert } from "../../../../../store/api/studentRecords.api";
import styles from "./Records.module.css";

const ROWS: Array<[keyof HealthAlert, string]> = [
  ["allergies", "Allergies"],
  ["conditions", "Conditions"],
  ["emergencyMedicine", "Emergency medicine"],
  ["dietary", "Diet"],
];

export const hasHealthAlert = (a: Partial<HealthAlert> | null | undefined) => !!a && ROWS.some(([k]) => a[k]?.trim());

// The health facts a teacher must know (allergies, conditions, emergency medicine, diet).
// Shown to the office, the class's teachers and the family; renders nothing when empty.
const HealthAlertBox = ({ alert }: { alert: Partial<HealthAlert> | null | undefined }) => {
  if (!alert || !hasHealthAlert(alert)) return null;
  return (
    <div className={styles.alert} role="note" aria-label="Health alert">
      <Icon name="alert" size={18} className={styles.alertIcon} />
      <dl>
        {ROWS.filter(([k]) => alert[k]?.trim()).map(([k, label]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{label}</dt>
            <dd>{alert[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default HealthAlertBox;
