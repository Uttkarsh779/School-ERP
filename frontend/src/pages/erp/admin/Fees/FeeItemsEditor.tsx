import { Button } from "../../../../components/ui";
import { MONTH_NAMES, inr } from "./feeUtils";
import styles from "./Fees.module.css";

// Editable list of fee-structure items: head, amount, frequency, months charged, due day.
// Used by "New structure" and the class fee-plan page. Months follow the academic year
// (April → March); the API stores calendar month numbers 1-12.

export type FeeItemDraft = {
  feeHeadId: string;
  amount: string;
  frequency: "MONTHLY" | "ANNUAL" | "ONE_TIME";
  applicableMonths: number[];
  dueDateDay: string;
};

export const ACADEMIC_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
export const ALL_MONTHS = [...ACADEMIC_MONTHS];

export const emptyItem = (): FeeItemDraft => ({
  feeHeadId: "",
  amount: "",
  frequency: "MONTHLY",
  applicableMonths: ALL_MONTHS,
  dueDateDay: "10",
});

export const itemFromApi = (i: IFeeStructureItem): FeeItemDraft => ({
  feeHeadId: String(i.feeHeadId),
  amount: String(Number(i.amount)),
  frequency: i.frequency,
  applicableMonths: i.applicableMonths?.length ? i.applicableMonths : ALL_MONTHS,
  dueDateDay: String(i.dueDateDay ?? 10),
});

// Client-side check mirroring the server's validator. Returns an error message or null.
export const validateItems = (items: FeeItemDraft[]): string | null => {
  if (items.length === 0) return "Add at least one fee item";
  const seen = new Set<string>();
  for (const it of items) {
    if (!it.feeHeadId) return "Choose a fee head for every row";
    if (seen.has(it.feeHeadId)) return "Each fee head can appear only once";
    seen.add(it.feeHeadId);
    if (!(Number(it.amount) > 0)) return "Every amount must be greater than zero";
    if (it.applicableMonths.length === 0) return "Pick at least one month for every fee";
    const d = Number(it.dueDateDay);
    if (!Number.isInteger(d) || d < 1 || d > 28) return "Due day must be between 1 and 28";
  }
  return null;
};

export const itemsToApi = (items: FeeItemDraft[]) =>
  items.map((it) => ({
    feeHeadId: Number(it.feeHeadId),
    amount: Number(it.amount),
    frequency: it.frequency,
    applicableMonths: [...it.applicableMonths].sort((a, b) => a - b),
    dueDateDay: Number(it.dueDateDay),
    allowPartialPayment: true,
  }));

export const annualTotal = (items: FeeItemDraft[]) =>
  items.reduce((s, it) => s + (Number(it.amount) || 0) * it.applicableMonths.length, 0);

interface FeeItemsEditorProps {
  items: FeeItemDraft[];
  onChange: (items: FeeItemDraft[]) => void;
  feeHeads: IFeeHead[];
  disabled?: boolean;
}

const FeeItemsEditor = ({ items, onChange, feeHeads, disabled }: FeeItemsEditorProps) => {
  const update = (index: number, patch: Partial<FeeItemDraft>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const setFrequency = (index: number, frequency: FeeItemDraft["frequency"]) =>
    update(index, {
      frequency,
      // Sensible month defaults per frequency; admin can still pick months.
      applicableMonths: frequency === "MONTHLY" ? ALL_MONTHS : [ACADEMIC_MONTHS[0]],
    });

  const toggleMonth = (index: number, month: number) => {
    const it = items[index];
    const has = it.applicableMonths.includes(month);
    update(index, { applicableMonths: has ? it.applicableMonths.filter((m) => m !== month) : [...it.applicableMonths, month] });
  };

  return (
    <div className={styles.formStack}>
      <div style={{ overflowX: "auto" }}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>Fee head</th>
              <th style={{ width: 120 }}>Amount (₹)</th>
              <th style={{ width: 130 }}>Frequency</th>
              <th>Charged in</th>
              <th style={{ width: 80 }}>Due day</th>
              <th style={{ width: 110 }}>Per year</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <select
                    className={styles.cellInput}
                    value={it.feeHeadId}
                    disabled={disabled}
                    onChange={(e) => update(i, { feeHeadId: e.target.value })}
                    aria-label="Fee head"
                  >
                    <option value="">Select…</option>
                    {feeHeads.map((h) => (
                      <option key={h.id} value={h.id} disabled={items.some((x, j) => j !== i && x.feeHeadId === String(h.id))}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.cellInput}
                    inputMode="decimal"
                    value={it.amount}
                    disabled={disabled}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    aria-label="Amount"
                  />
                </td>
                <td>
                  <select
                    className={styles.cellInput}
                    value={it.frequency}
                    disabled={disabled}
                    onChange={(e) => setFrequency(i, e.target.value as FeeItemDraft["frequency"])}
                    aria-label="Frequency"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="ONE_TIME">One-time</option>
                  </select>
                </td>
                <td>
                  <div className={styles.monthPicker}>
                    {ACADEMIC_MONTHS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        className={`${styles.monthChip} ${it.applicableMonths.includes(m) ? styles.monthChipOn : ""}`}
                        onClick={() => toggleMonth(i, m)}
                        aria-pressed={it.applicableMonths.includes(m)}
                      >
                        {MONTH_NAMES[m - 1].slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <input
                    className={styles.cellInput}
                    inputMode="numeric"
                    value={it.dueDateDay}
                    disabled={disabled}
                    onChange={(e) => update(i, { dueDateDay: e.target.value })}
                    aria-label="Due day"
                  />
                </td>
                <td className={styles.strong}>{inr((Number(it.amount) || 0) * it.applicableMonths.length)}</td>
                <td>
                  {!disabled && (
                    <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove fee item">
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className={styles.rowActions} style={{ justifyContent: "space-between" }}>
          <Button size="sm" variant="outline" onClick={() => onChange([...items, emptyItem()])} disabled={items.length >= feeHeads.length}>
            + Add fee item
          </Button>
          <span className={styles.strong}>Annual total: {inr(annualTotal(items))}</span>
        </div>
      )}
    </div>
  );
};

export default FeeItemsEditor;
