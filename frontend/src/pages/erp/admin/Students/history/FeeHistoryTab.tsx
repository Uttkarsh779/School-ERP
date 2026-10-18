import { Badge, Card, EmptyState, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import type { StudentHistory } from "../../../../../store/api/students.api";
import { MONTHS, fmtDate, humanize, inr } from "./historyFormat";
import styles from "./StudentHistory.module.css";

type Fees = StudentHistory["fees"];

const chargeTone = (status: string) =>
  status === "PAID" ? "success" : status === "PARTIALLY_PAID" ? "warning" : status === "UNPAID" ? "danger" : "neutral";
const paymentTone = (status: string) =>
  status === "SUCCESS" ? "success" : status === "PENDING" ? "warning" : status === "FAILED" ? "danger" : "neutral";

// The student's complete fee record: every charge raised, every payment (incl. failed /
// pending), discounts, concessions, refunds and pre-ledger payments.
const FeeHistoryTab = ({ history }: { history: StudentHistory }) => {
  const fees: Fees = history.fees;
  const s = fees.summary;
  const isEmpty =
    fees.charges.length + fees.payments.length + fees.adjustments.length + fees.concessions.length + fees.refunds.length + fees.legacyPayments.length === 0;

  if (isEmpty) {
    return (
      <Card>
        <EmptyState title="No fee records yet" description="Charges and payments will appear here once fees are billed." />
      </Card>
    );
  }

  const chargeColumns: TableColumn<Fees["charges"][number]>[] = [
    { key: "feeHead", label: "Fee", render: (c) => <strong>{c.feeHead}</strong> },
    { key: "period", label: "Period", render: (c) => `${MONTHS[c.billingMonth - 1] ?? c.billingMonth} ${c.billingYear}` },
    { key: "dueDate", label: "Due", render: (c) => fmtDate(c.dueDate) },
    { key: "netAmount", label: "Amount", render: (c) => inr(c.netAmount) },
    { key: "discountAmount", label: "Discount", render: (c) => (c.discountAmount ? inr(c.discountAmount) : "—") },
    { key: "lateFeeAmount", label: "Late Fee", render: (c) => (c.lateFeeAmount ? inr(c.lateFeeAmount) : "—") },
    { key: "paidAmount", label: "Paid", render: (c) => inr(c.paidAmount) },
    { key: "balance", label: "Balance", render: (c) => (c.balance > 0 ? <strong className={styles.danger}>{inr(c.balance)}</strong> : inr(0)) },
    { key: "status", label: "Status", render: (c) => <Badge tone={chargeTone(c.status)}>{humanize(c.status)}</Badge> },
  ];

  const paymentColumns: TableColumn<Fees["payments"][number]>[] = [
    { key: "date", label: "Date", render: (p) => fmtDate(p.date) },
    { key: "receipt", label: "Receipt / Ref", render: (p) => p.receiptNumber ?? p.paymentNumber },
    { key: "amount", label: "Amount", render: (p) => <strong>{inr(p.amount)}</strong> },
    { key: "mode", label: "Mode", render: (p) => humanize(p.mode) },
    { key: "transactionRef", label: "Transaction", render: (p) => p.transactionRef ?? "—" },
    { key: "status", label: "Status", render: (p) => <Badge tone={paymentTone(p.status)}>{humanize(p.status)}</Badge> },
  ];

  return (
    <div className={styles.tab}>
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{inr(s.totalBilled)}</div>
          <div className={styles.muted}>Total billed</div>
        </div>
        <div className={styles.miniStat}>
          <div className={`${styles.miniValue} ${styles.success}`}>{inr(s.totalPaid)}</div>
          <div className={styles.muted}>Total paid</div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{inr(s.totalDiscounts)}</div>
          <div className={styles.muted}>Discounts / waivers</div>
        </div>
        <div className={styles.miniStat}>
          <div className={`${styles.miniValue} ${s.totalOutstanding ? styles.danger : styles.success}`}>{inr(s.totalOutstanding)}</div>
          <div className={styles.muted}>Outstanding now</div>
        </div>
        {!!s.advanceAvailable && (
          <div className={styles.miniStat}>
            <div className={styles.miniValue}>{inr(s.advanceAvailable)}</div>
            <div className={styles.muted}>Advance balance</div>
          </div>
        )}
        {!!s.totalRefunded && (
          <div className={styles.miniStat}>
            <div className={styles.miniValue}>{inr(s.totalRefunded)}</div>
            <div className={styles.muted}>Refunded</div>
          </div>
        )}
      </div>

      <Card title="Fee charges" subtitle="Every fee billed to this student, newest first">
        <Table columns={chargeColumns} data={fees.charges} keyField="id" emptyMessage="No charges raised." />
      </Card>

      <Card title="Payments" subtitle="Including pending and failed attempts">
        <Table columns={paymentColumns} data={fees.payments} keyField="id" emptyMessage="No payments recorded." />
      </Card>

      {(fees.adjustments.length > 0 || fees.concessions.length > 0) && (
        <div className={styles.twoCol}>
          <Card title="Discounts & waivers">
            {fees.adjustments.length === 0 ? (
              <p className={styles.muted}>None applied.</p>
            ) : (
              <ul className={styles.list}>
                {fees.adjustments.map((a) => (
                  <li key={a.id} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <div className={styles.itemTitle}>{humanize(a.type)}</div>
                      <div className={styles.muted}>
                        {a.reason} · {fmtDate(a.date)}
                        {a.appliedBy && ` · by ${a.appliedBy}`}
                      </div>
                    </div>
                    <strong>{inr(a.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Concessions">
            {fees.concessions.length === 0 ? (
              <p className={styles.muted}>No concessions.</p>
            ) : (
              <ul className={styles.list}>
                {fees.concessions.map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <div className={styles.itemTitle}>{c.name ?? humanize(c.type)}</div>
                      <div className={styles.muted}>
                        {c.calculationType === "PERCENTAGE" ? `${c.value}%` : inr(c.value)}
                        {c.startsFrom && ` · from ${fmtDate(c.startsFrom)}`}
                        {c.endsOn && ` to ${fmtDate(c.endsOn)}`}
                        {c.approvedBy && ` · approved by ${c.approvedBy}`}
                      </div>
                    </div>
                    <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{humanize(c.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {fees.refunds.length > 0 && (
        <Card title="Refunds">
          <ul className={styles.list}>
            {fees.refunds.map((r) => (
              <li key={r.id} className={styles.listItem}>
                <div className={styles.listMain}>
                  <div className={styles.itemTitle}>{r.refundNumber}</div>
                  <div className={styles.muted}>
                    {r.reason} · {fmtDate(r.date)}
                  </div>
                </div>
                <strong>{inr(r.amount)}</strong>
                <Badge tone={r.status === "REFUND_PROCESSED" ? "success" : r.status === "REFUND_REJECTED" ? "danger" : "warning"}>
                  {humanize(r.status.replace("REFUND_", ""))}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {fees.legacyPayments.length > 0 && (
        <Card title="Older payments" subtitle="Recorded before the current fee ledger">
          <ul className={styles.list}>
            {fees.legacyPayments.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <div className={styles.listMain}>
                  <div className={styles.itemTitle}>{p.receiptNumber ?? `Payment #${p.id}`}</div>
                  <div className={styles.muted}>
                    {humanize(p.mode)} · {fmtDate(p.date)}
                  </div>
                </div>
                <strong>{inr(p.amount)}</strong>
                <Badge tone={p.status === "APPROVED" ? "success" : "warning"}>{humanize(p.status)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

export default FeeHistoryTab;
