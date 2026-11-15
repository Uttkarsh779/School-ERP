import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, Input, Spinner } from "../../../../../components/ui";
import { useGetBillingSettingsQuery, useUpdateBillingSettingsMutation } from "../../../../../store/api/fees.api";
import { fmtDate, getErrorMessage } from "../feeUtils";
import styles from "../Fees.module.css";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

// Automatic monthly bills: on/off, the day of the month they're generated, and the one day
// the whole bill is due (every fee and transport together).
const BillingSettingsCard = () => {
  const { data: settings, isLoading } = useGetBillingSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateBillingSettingsMutation();
  const [form, setForm] = useState({ autoGenerate: false, generateDay: "1", dueDay: "10" });

  useEffect(() => {
    if (settings) setForm({ autoGenerate: settings.autoGenerate, generateDay: String(settings.generateDay), dueDay: String(settings.dueDay) });
  }, [settings]);

  const submit = async () => {
    const generateDay = Number(form.generateDay);
    const dueDay = Number(form.dueDay);
    if (!Number.isInteger(generateDay) || generateDay < 1 || generateDay > 28) return toast.error("Generation day must be between 1 and 28");
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return toast.error("Fee due day must be between 1 and 28");
    if (form.autoGenerate && dueDay < generateDay) return toast.error("The fee due day can't be before the day bills are generated");
    try {
      await save({ autoGenerate: form.autoGenerate, generateDay, dueDay }).unwrap();
      toast.success(form.autoGenerate ? `Bills will be generated automatically on the ${ordinal(generateDay)} of every month` : "Billing settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the settings"));
    }
  };

  return (
    <Card title="Monthly bills" subtitle="Generate every student's fee bill automatically each month">
      {isLoading ? (
        <Spinner />
      ) : (
        <div className={styles.formStack}>
          <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.autoGenerate}
              onChange={(e) => setForm({ ...form, autoGenerate: e.target.checked })}
              style={{ marginTop: "0.2rem" }}
            />
            <span>
              <strong>Generate bills automatically</strong>
              <span className={styles.muted} style={{ display: "block" }}>
                Students already billed for the month are skipped, so it's safe to also generate by hand from Bills &amp; Invoices.
              </span>
            </span>
          </label>
          <div className={styles.filters} style={{ marginBottom: 0 }}>
            <Input
              label="Generate on day"
              inputMode="numeric"
              value={form.generateDay}
              disabled={!form.autoGenerate}
              onChange={(e) => setForm({ ...form, generateDay: e.target.value })}
              hint="1–28 of every month"
            />
            <Input
              label="Fee due day"
              inputMode="numeric"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              hint="1–28. Every fee on the bill, transport included"
            />
          </div>
          {settings?.lastAutoRunSummary && (
            <div className={styles.notice}>
              <strong>Last automatic run:</strong> {settings.lastAutoRunSummary}
              {settings.lastAutoRunAt && <span className={styles.muted}> · {fmtDate(settings.lastAutoRunAt)}</span>}
            </div>
          )}
          <p className={styles.muted} style={{ margin: 0 }}>
            Late fines come from the late-fee rule; they start after each bill's due date and grace days. Admins get a notification when bills are generated.
          </p>
          <div className={styles.formActions} style={{ marginTop: 0 }}>
            <Button onClick={submit} isLoading={saving}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default BillingSettingsCard;
