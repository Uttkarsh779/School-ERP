import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, Input, Spinner } from "../../../../../components/ui";
import { useGetBillingSettingsQuery, useUpdateBillingSettingsMutation } from "../../../../../store/api/fees.api";
import { fmtDate, getErrorMessage } from "../feeUtils";
import styles from "../Fees.module.css";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

// Automatic monthly bills: on/off, the day of the month they're generated, and the
// transport fee's due day. Fee items keep the due day set in each fee structure.
const BillingSettingsCard = () => {
  const { data: settings, isLoading } = useGetBillingSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateBillingSettingsMutation();
  const [form, setForm] = useState({ autoGenerate: false, generateDay: "1", transportDueDay: "10" });

  useEffect(() => {
    if (settings) setForm({ autoGenerate: settings.autoGenerate, generateDay: String(settings.generateDay), transportDueDay: String(settings.transportDueDay) });
  }, [settings]);

  const submit = async () => {
    const generateDay = Number(form.generateDay);
    const transportDueDay = Number(form.transportDueDay);
    if (!Number.isInteger(generateDay) || generateDay < 1 || generateDay > 28) return toast.error("Generation day must be between 1 and 28");
    if (!Number.isInteger(transportDueDay) || transportDueDay < 1 || transportDueDay > 28) return toast.error("Transport due day must be between 1 and 28");
    try {
      await save({ autoGenerate: form.autoGenerate, generateDay, transportDueDay }).unwrap();
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
              label="Transport fee due day"
              inputMode="numeric"
              value={form.transportDueDay}
              onChange={(e) => setForm({ ...form, transportDueDay: e.target.value })}
              hint="Other fees use the due day in their fee structure"
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
