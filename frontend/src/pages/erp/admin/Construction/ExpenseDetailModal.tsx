import { Badge, Button, Modal, Spinner } from "../../../../components/ui";
import { useGetConstructionExpenseQuery } from "../../../../store/api/construction.api";
import {
  CATEGORY_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  formatDay,
  formatINR,
} from "./constructionFormat";
import styles from "./ConstructionExpensePage.module.css";

const ACTION_LABEL: Record<string, string> = { CREATE: "Recorded", UPDATE: "Edited", VOID: "Voided" };

// Lists which fields an UPDATE audit entry changed, e.g. "amount, vendorName".
const changedFields = (oldValues: string | null, newValues: string | null) => {
  if (!oldValues || !newValues) return null;
  try {
    const before = JSON.parse(oldValues) as Record<string, unknown>;
    const after = JSON.parse(newValues) as Record<string, unknown>;
    const keys = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    return keys.length ? keys.join(", ") : null;
  } catch {
    return null;
  }
};

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ExpenseDetailModal = ({ id, onClose }: { id: number; onClose: () => void }) => {
  const { data: expense, isLoading, isError } = useGetConstructionExpenseQuery(id);

  return (
    <Modal title="Expense Details" size="lg" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !expense ? (
        <p className={styles.mutedText}>Couldn't load this expense.</p>
      ) : (
        <>
          <div className={styles.detailHeader}>
            <div>
              <div className={styles.detailTitle}>{expense.title}</div>
              <div className={styles.mutedText}>{expense.project.name}</div>
            </div>
            <div className={styles.detailAmount}>
              {formatINR(expense.amount)}
              {expense.isVoid ? (
                <Badge tone="danger">Void</Badge>
              ) : (
                <Badge tone={PAYMENT_STATUS_TONE[expense.paymentStatus]}>{PAYMENT_STATUS_LABEL[expense.paymentStatus]}</Badge>
              )}
            </div>
          </div>

          {expense.isVoid && (
            <div className={styles.voidNotice}>
              Voided on {formatTimestamp(expense.voidedAt!)} by {expense.voidedByUser?.name ?? "—"}. Reason: {expense.voidReason}
            </div>
          )}

          <dl className={styles.detailGrid}>
            {[
              ["Expense Date", formatDay(expense.expenseDate)],
              ["Category", CATEGORY_LABEL[expense.category]],
              ["Payment Mode", expense.paymentMode ? PAYMENT_MODE_LABEL[expense.paymentMode] : "—"],
              ["Invoice / Receipt No", expense.invoiceNumber ?? "—"],
              ["Vendor / Contractor", expense.vendorName ?? "—"],
              ["Vendor Contact", expense.vendorContact ?? "—"],
              ["Recorded By", `${expense.createdByUser.name} · ${formatTimestamp(expense.createdAt)}`],
              ["Last Edited By", expense.updatedByUser ? `${expense.updatedByUser.name} · ${formatTimestamp(expense.updatedAt)}` : "—"],
            ].map(([label, value]) => (
              <div key={label} className={styles.detailItem}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div className={styles.detailItem} style={{ gridColumn: "1 / -1" }}>
              <dt>Attachment</dt>
              <dd>
                {expense.attachmentUrl ? (
                  <a href={expense.attachmentUrl} target="_blank" rel="noreferrer">
                    View invoice / receipt
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className={styles.detailItem} style={{ gridColumn: "1 / -1" }}>
              <dt>Remarks</dt>
              <dd>{expense.notes ?? "—"}</dd>
            </div>
          </dl>

          <h4 className={styles.historyTitle}>Audit History</h4>
          <ul className={styles.historyList}>
            {expense.history.map((h) => {
              const fields = h.action === "UPDATE" ? changedFields(h.oldValues, h.newValues) : null;
              return (
                <li key={h.id} className={styles.historyItem}>
                  <span>
                    <strong>{ACTION_LABEL[h.action] ?? h.action}</strong> by {h.user.name}
                    {fields && <span className={styles.mutedText}> — changed {fields}</span>}
                  </span>
                  <span className={styles.mutedText}>{formatTimestamp(h.timestamp)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className={styles.formActions}>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default ExpenseDetailModal;
