import { useState } from "react";
import { Badge, Button, Card, EmptyState, Icon, Spinner, StatCard } from "../../../../../components/ui";
import BreakdownList from "../../../../../components/shared/BreakdownList/BreakdownList";
import ReceiptModal from "../../../../../components/shared/FeeReceipt/ReceiptModal";
import { useGetFeeOverviewQuery } from "../../../../../store/api/fees.api";
import { MODE_LABEL, MONTH_NAMES, fmtDate, inr } from "../feeUtils";
import styles from "../Fees.module.css";

// Fee overview: real collection/outstanding figures from GET /fees/overview.
const FeeOverviewTab = ({ onGoTo }: { onGoTo: (tab: "collect" | "dues" | "refunds" | "structures") => void }) => {
  const { data, isLoading, isError, refetch } = useGetFeeOverviewQuery();
  const [receiptId, setReceiptId] = useState<number | null>(null);

  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          title="Couldn't load the fee overview"
          description="Check your connection and try again."
          action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>}
        />
      </Card>
    );
  }

  const monthName = `${MONTH_NAMES[data.month.month - 1]} ${data.month.year}`;
  const modeItems = Object.entries(data.byMode).map(([mode, amount]) => ({
    label: MODE_LABEL[mode] ?? mode,
    value: amount,
    display: inr(amount),
  }));

  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label={`Collected today (${data.paymentsToday} payments)`} value={inr(data.collectedToday)} icon={<Icon name="check" />} />
        <StatCard label={`Collected in ${monthName}`} value={inr(data.collectedThisMonth)} icon={<Icon name="calendar" />} />
        <StatCard label={`Billed for ${monthName}`} value={inr(data.billedThisMonth)} icon={<Icon name="fileText" />} />
        <StatCard
          label="Collection rate (this month's bills)"
          value={data.collectionRate === null ? "—" : `${data.collectionRate}%`}
          icon={<Icon name="graduationCap" />}
        />
      </div>

      <div className={styles.statsGrid}>
        <StatCard label="Total outstanding" value={inr(data.outstanding)} icon={<Icon name="building" />} />
        <StatCard label="Overdue (past due date)" value={inr(data.overdue)} icon={<Icon name="bell" />} />
        <StatCard label="Students with overdue fees" value={data.defaulterCount} icon={<Icon name="users" />} />
        <StatCard label="Refunds awaiting action" value={data.pendingRefunds} icon={<Icon name="clipboardCheck" />} />
      </div>

      {data.stalePendingOnlinePayments > 0 && (
        <div className={`${styles.notice} ${styles.noticeWarn}`}>
          {data.stalePendingOnlinePayments} online payment attempt(s) were started but never completed. They don't affect any
          balance; the family may have closed the payment window.
        </div>
      )}

      <div className={styles.twoCol}>
        <Card
          title="Recent payments"
          action={<Button size="sm" variant="ghost" onClick={() => onGoTo("collect")}>Collect a payment →</Button>}
        >
          {data.recentPayments.length === 0 ? (
            <p className={styles.muted}>No payments recorded yet.</p>
          ) : (
            <ul className={styles.list}>
              {data.recentPayments.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>{p.student.name}</div>
                    <div className={styles.muted}>
                      {p.student.classSection ?? "—"} · {MODE_LABEL[p.mode] ?? p.mode} · {fmtDate(p.paidAt)}
                    </div>
                  </div>
                  <span className={styles.amount}>{inr(p.amount)}</span>
                  <Button size="sm" variant="outline" onClick={() => setReceiptId(p.id)}>
                    Receipt
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Outstanding by class"
          subtitle="Includes late fees from the configured rule"
          action={<Button size="sm" variant="ghost" onClick={() => onGoTo("dues")}>Dues & defaulters →</Button>}
        >
          <BreakdownList
            items={data.outstandingByClass.map((c) => ({
              label: c.classSection,
              value: c.outstanding,
              display: inr(c.outstanding),
              hint: `${c.students} student${c.students === 1 ? "" : "s"}`,
            }))}
            emptyMessage="Nothing outstanding — every bill is paid."
          />
        </Card>
      </div>

      <Card title={`Collection by payment mode · ${monthName}`}>
        {modeItems.length === 0 ? (
          <p className={styles.muted}>No payments this month yet.</p>
        ) : (
          <BreakdownList items={modeItems} />
        )}
        {data.pendingRefunds > 0 && (
          <div className={styles.formActions}>
            <Badge tone="warning">{data.pendingRefunds} refund(s) pending</Badge>
            <Button size="sm" variant="outline" onClick={() => onGoTo("refunds")}>
              Review refunds
            </Button>
          </div>
        )}
      </Card>

      {receiptId !== null && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  );
};

export default FeeOverviewTab;
