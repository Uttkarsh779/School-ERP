import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, Input, Spinner, StatCard, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { useGetDayBookQuery, type DayBookReceipt } from "../../../../../store/api/fees.api";
import { useGetPublicWebsiteDataQuery } from "../../../../../store/api/cms.api";
import { useAppSelector } from "../../../../../store/store";
import { inr, MODE_LABEL } from "../feeUtils";
import { printDayBook } from "./dayBookPrint";
import styles from "../Fees.module.css";
import ExportButton from "../../../../../components/shared/ExportButton";
import { useCan } from "../../../../../store/permissions";

// Fee day book: what came in on a day (or a range), split by payment mode and by who
// collected it, so the cash counted at the end of the day can be matched and handed over.
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
const time = (d: string | null) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");
const dateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";

const DayBookTab = () => {
  const can = useCan();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetDayBookQuery({ from, to: to < from ? from : to });
  const { data: site } = useGetPublicWebsiteDataQuery();
  const me = useAppSelector((s) => s.auth.user);
  const single = from === to;

  const setDay = (d: string) => {
    setFrom(d);
    setTo(d);
  };

  const columns: TableColumn<DayBookReceipt>[] = [
    { key: "paidAt", label: single ? "Time" : "Date & time", render: (r) => (single ? time(r.paidAt) : dateTime(r.paidAt)) },
    { key: "receiptNumber", label: "Receipt" },
    {
      key: "student",
      label: "Student",
      render: (r) => (
        <div>
          <Link to={`/admin/students/${r.studentId}`} className={styles.itemTitle}>
            {r.student}
          </Link>
          <div className={styles.muted}>
            {r.admissionNo}
            {r.className ? ` · ${r.className}` : ""}
          </div>
        </div>
      ),
    },
    { key: "mode", label: "Mode", render: (r) => MODE_LABEL[r.mode] ?? r.mode },
    { key: "collectedBy", label: "Collected by" },
    { key: "amount", label: "Amount", render: (r) => <strong>{inr(r.amount)}</strong> },
  ];

  return (
    <div className={styles.section}>
      <Card
        title="Fee day book"
        subtitle="Every receipt for the day, totals by payment mode and by who collected, for closing the counter"
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button size="sm" variant="outline" disabled={!data} onClick={() => data && printDayBook(data, site?.settings, me?.name ?? me?.email)}>
              Print day book
            </Button>
            {can("exports.fees") && <ExportButton path="day-book" params={{ from, to }} label="Excel" disabled={!data} />}
          </div>
        }
      >
        <div className={styles.filters}>
          <Input label="From" type="date" value={from} max={today()} onChange={(e) => (e.target.value > to ? setDay(e.target.value) : setFrom(e.target.value))} />
          <Input label="To" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" onClick={() => setDay(shift(from, -1))}>
              ← Previous day
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDay(today())} disabled={single && from === today()}>
              Today
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDay(shift(from, 1))} disabled={from >= today()}>
              Next day →
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState
          title="Couldn't load the day book"
          description={(error as any)?.data?.message}
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1 }}>
          <div className={styles.statsGrid}>
            <StatCard label="Collected" value={inr(data.totals.collected)} />
            <StatCard label="Receipts" value={data.totals.receipts} />
            <StatCard label="Refunds paid" value={inr(data.totals.refunded)} />
            <StatCard label="Net" value={inr(data.totals.net)} />
          </div>

          <div className={styles.dayBookSplit}>
            <Card title="By payment mode">
              {data.byMode.length ? (
                <ul className={styles.dayBookList}>
                  {data.byMode.map((m) => (
                    <li key={m.key}>
                      <span>
                        {MODE_LABEL[m.key] ?? m.key} <small>({m.count})</small>
                      </span>
                      <strong>{inr(m.amount)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>Nothing collected.</p>
              )}
            </Card>
            <Card title="By who collected">
              {data.byCollector.length ? (
                <ul className={styles.dayBookList}>
                  {data.byCollector.map((m) => (
                    <li key={m.key}>
                      <span>
                        {m.key} <small>({m.count})</small>
                      </span>
                      <strong>{inr(m.amount)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>Nothing collected.</p>
              )}
            </Card>
          </div>

          <Card title={`Receipts (${data.receipts.length})`} padded={false}>
            {data.receipts.length ? (
              <Table columns={columns} data={data.receipts} keyField="id" showPagination={false} />
            ) : (
              <EmptyState title="No receipts" description={single ? "No fee was collected on this day." : "No fee was collected in these dates."} />
            )}
          </Card>

          {data.cancelled.length > 0 && (
            <Card title={`Cancelled receipts (${data.cancelled.length})`} subtitle="Not counted in the totals">
              <ul className={styles.dayBookList}>
                {data.cancelled.map((r) => (
                  <li key={r.id}>
                    <span>
                      {r.receiptNumber} · {r.student}
                      <small>
                        {" "}
                        — {r.cancelReason ?? "no reason"}
                        {r.cancelledBy ? `, by ${r.cancelledBy}` : ""}
                      </small>
                    </span>
                    <s>{inr(r.amount)}</s>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.refunds.length > 0 && (
            <Card title={`Refunds paid out (${data.refunds.length})`}>
              <ul className={styles.dayBookList}>
                {data.refunds.map((r) => (
                  <li key={r.id}>
                    <span>
                      {r.refundNumber} · {r.student} <small>— {r.reason}</small>
                    </span>
                    <strong>{inr(r.amount)}</strong>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default DayBookTab;
