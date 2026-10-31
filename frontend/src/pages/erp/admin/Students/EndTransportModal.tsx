import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal } from "../../../../components/ui";
import { useEndStudentTransportMutation } from "../../../../store/api/transport.api";
import styles from "./EndTransportModal.module.css";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nice = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const monthName = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err && typeof err === "object" && "data" in err ? (err as { data?: { message?: string } }).data?.message : undefined) || fallback;

// Stop a student's school transport: pick the last day on the bus and how that month is
// billed. The server ends the assignment, removes the bus route and waives unpaid transport
// bills already issued for later months.
const EndTransportModal = ({
  studentId,
  studentName,
  currentLabel,
  onClose,
}: {
  studentId: number;
  studentName: string;
  currentLabel?: string | null;
  onClose: () => void;
}) => {
  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [choice, setChoice] = useState<"month" | "today" | "custom">("month");
  const [custom, setCustom] = useState(iso(today));
  const [policy, setPolicy] = useState<"FULL_MONTH" | "PRORATED">("FULL_MONTH");
  const [reason, setReason] = useState("");
  const [endTransport, { isLoading }] = useEndStudentTransportMutation();

  const lastDay = choice === "month" ? endOfMonth : choice === "today" ? today : new Date(`${custom}T00:00:00`);
  const valid = !Number.isNaN(lastDay.getTime());
  const isMonthEnd = valid && lastDay.getDate() === new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 0).getDate();
  const nextMonth = valid ? new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 1) : null;

  const submit = async () => {
    if (!valid) return toast.error("Choose the last day on the bus");
    try {
      const r = await endTransport({ studentId, lastDay: iso(lastDay), policy: isMonthEnd ? "FULL_MONTH" : policy, reason: reason.trim() || undefined }).unwrap();
      toast.success(
        r.waivedTotal > 0
          ? `Transport ended. ${inr(r.waivedTotal)} of unpaid transport bills for later months was removed.`
          : "Transport ended. No transport fee will be billed after the last day."
      );
      if (r.alreadyPaid > 0) {
        toast.info(`${inr(r.alreadyPaid)} was already paid for months after the end. Refund it from Fees → Refunds, or it stays as credit.`, { autoClose: 9000 });
      }
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't end the transport"));
    }
  };

  return (
    <Modal title="End school transport" onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.lead}>
          <strong>{studentName}</strong> will stop using school transport{currentLabel ? ` (${currentLabel})` : ""}.
        </p>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Last day on the bus</span>
          <div className={styles.options}>
            {(
              [
                ["month", "End of this month", nice(endOfMonth)],
                ["today", "Today", nice(today)],
                ["custom", "Another date", null],
              ] as const
            ).map(([key, label, sub]) => (
              <label key={key} className={`${styles.option} ${choice === key ? styles.optionOn : ""}`}>
                <input type="radio" name="lastDay" checked={choice === key} onChange={() => setChoice(key)} />
                <span>
                  <strong>{label}</strong>
                  {sub && <small>{sub}</small>}
                </span>
              </label>
            ))}
          </div>
          {choice === "custom" && <Input label="Date" type="date" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        </div>

        {valid && !isMonthEnd && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Transport fee for {monthName(lastDay)}</span>
            <div className={styles.options}>
              <label className={`${styles.option} ${policy === "FULL_MONTH" ? styles.optionOn : ""}`}>
                <input type="radio" name="policy" checked={policy === "FULL_MONTH"} onChange={() => setPolicy("FULL_MONTH")} />
                <span>
                  <strong>Charge the full month</strong>
                  <small>Usual school rule</small>
                </span>
              </label>
              <label className={`${styles.option} ${policy === "PRORATED" ? styles.optionOn : ""}`}>
                <input type="radio" name="policy" checked={policy === "PRORATED"} onChange={() => setPolicy("PRORATED")} />
                <span>
                  <strong>Charge only days used</strong>
                  <small>Up to {nice(lastDay)}</small>
                </span>
              </label>
            </div>
          </div>
        )}

        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Parents will drop the child" />

        {valid && nextMonth && (
          <div className={styles.summary}>
            <strong>What happens</strong>
            <ul>
              <li>No transport fee from {monthName(nextMonth)} onwards.</li>
              <li>Transport bills already issued for later months are removed if unpaid.</li>
              <li>The bus route is cleared. You can assign transport again any time.</li>
            </ul>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" isLoading={isLoading} onClick={submit}>
          End transport
        </Button>
      </div>
    </Modal>
  );
};

export default EndTransportModal;
