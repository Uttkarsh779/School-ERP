import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import ReceiptModal from "../../../../components/shared/FeeReceipt/ReceiptModal";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import {
  useCreateRazorpayOrderMutation,
  useGetRefundsQuery,
  useGetStudentDueSummaryQuery,
  useGetStudentLedgerQuery,
  useGetStudentMonthsChartQuery,
  useRequestRefundMutation,
  useVerifyRazorpayPaymentMutation,
  type LedgerEntry,
} from "../../../../store/api/fees.api";
import { fmtDate, getErrorMessage, inr } from "../../admin/Fees/feeUtils";
import shared from "../../admin/Fees/Fees.module.css";
import styles from "./StudentFeesPage.module.css";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Shape of GET /fees/student/:id/months-chart (the whole session, billed + projected months).
type MonthStatus = "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "DUE" | "UNBILLED" | "NOT_APPLICABLE";
interface ChartHead {
  headName: string;
  baseAmount: number;
  discountAmount: number;
  lateFeeAmount: number;
  paidAmount: number;
  netAmount: number;
  balanceDue: number;
}
interface ChartMonth {
  month: number;
  year: number;
  monthName: string;
  periodCode: string;
  dueDate: string;
  isBilled: boolean;
  status: MonthStatus;
  statusReason?: string;
  baseAmount: number;
  discountAmount: number;
  lateFeeAmount: number;
  paidAmount: number;
  netAmount: number;
  balanceDue: number;
  heads: ChartHead[];
}
interface MonthsChart {
  student: { name: string; admissionNo: string; rollNo: string; classSection: string; fatherName: string };
  session: { name: string };
  months: ChartMonth[];
  feeStructureMissing: boolean;
  // Unpaid fees of other sessions (previous-year dues carried forward).
  otherSessionDues?: Array<{ sessionId: number; sessionName: string; outstanding: number; months: string[]; isPrevious: boolean }>;
}

const STATUS: Record<MonthStatus, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  PAID: { label: "Paid", tone: "success" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  DUE: { label: "Due", tone: "info" },
  UNBILLED: { label: "Upcoming", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not applicable", tone: "neutral" },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const short = (m: ChartMonth) => `${m.monthName.slice(0, 3)} ${m.year}`;

// Excel-friendly CSV of the statement.
const downloadStatement = (rows: LedgerEntry[], who: string) => {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Date", "Details", "Receipt / Ref", "Charged", "Paid / Discount", "Balance"].map(cell).join(",")];
  for (const e of rows) lines.push([fmtDate(e.date), e.description, e.referenceNo ?? "", e.debit || "", e.credit || "", e.balance].map(cell).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `fee-statement-${who.replace(/\W+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Student fees, laid out like a standard school ERP fee page: account summary, the full
// session schedule (pick the months to pay — oldest first, as the office allocates), a
// payment summary with online payment, receipts, the statement and the fee structure.
const StudentFeesPage = () => {
  const [tab, setTab] = useState<"history" | "statement" | "structure">("history");
  const [selected, setSelected] = useState<string[] | null>(null); // periodCodes; null = default (all payable)
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [refundFor, setRefundFor] = useState<{ paymentId: number; max: number; ref: string } | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const { data: profile, isLoading: profileLoading } = useGetMyStudentProfileQuery();
  const studentId = profile?.id ?? 0;
  const skip = { skip: !profile };
  const { data: chartRaw, isLoading: chartLoading, isError: chartError, refetch: refetchChart } = useGetStudentMonthsChartQuery({ studentId }, skip);
  const { data: due, refetch: refetchDue } = useGetStudentDueSummaryQuery(studentId, skip);
  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } = useGetStudentLedgerQuery(studentId, skip);
  const { data: refunds = [] } = useGetRefundsQuery(profile ? { studentId } : undefined, skip);
  const [createOrder] = useCreateRazorpayOrderMutation();
  const [verifyPayment] = useVerifyRazorpayPaymentMutation();
  const [requestRefund, { isLoading: requestingRefund }] = useRequestRefundMutation();
  const chart = chartRaw as MonthsChart | undefined;

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const months = useMemo(() => chart?.months ?? [], [chart]);
  const payable = useMemo(() => months.filter((m) => m.isBilled && m.balanceDue > 0), [months]);
  const selectedCodes = selected ?? payable.map((m) => m.periodCode);
  const selectedMonths = payable.filter((m) => selectedCodes.includes(m.periodCode));

  const totals = useMemo(() => {
    const applicable = months.filter((m) => m.status !== "NOT_APPLICABLE");
    const gross = applicable.reduce((s, m) => s + m.baseAmount, 0);
    const concession = applicable.reduce((s, m) => s + m.discountAmount, 0);
    const late = applicable.reduce((s, m) => s + m.lateFeeAmount, 0);
    const paid = applicable.reduce((s, m) => s + m.paidAmount, 0);
    const overdue = months.filter((m) => m.status === "OVERDUE").reduce((s, m) => s + m.balanceDue, 0);
    const dueNow = payable.reduce((s, m) => s + m.balanceDue, 0);
    const upcoming = months.filter((m) => m.status === "UNBILLED").reduce((s, m) => s + m.balanceDue, 0);
    const annualNet = gross - concession;
    return { gross, concession, late, paid, overdue, dueNow, upcoming, annualNet, pct: annualNet > 0 ? Math.min(100, Math.round((paid / annualNet) * 100)) : 0 };
  }, [months, payable]);

  // The office's outstanding figure is the payment cap (it is what the server checks).
  const outstandingCap = Number(due?.totalOutstanding ?? totals.dueNow);
  // Previous sessions' dues are settled first (online payments clear the oldest dues first),
  // so they are always part of the amount.
  const prevDues = (chart?.otherSessionDues ?? []).filter((d) => d.isPrevious && d.outstanding > 0);
  const prevTotal = round2(prevDues.reduce((s, d) => s + d.outstanding, 0));
  const selectedTotal = round2(selectedMonths.reduce((s, m) => s + m.balanceDue, 0));
  const payAmount = customOpen ? Number(customAmount) || 0 : Math.min(prevTotal + selectedTotal, outstandingCap);
  const firstOverdue = months.find((m) => m.status === "OVERDUE");

  // Payments settle the oldest dues first, so selection is always a run from the oldest month.
  const toggleMonth = (code: string) => {
    const idx = payable.findIndex((m) => m.periodCode === code);
    const on = selectedCodes.includes(code);
    setSelected(on ? payable.slice(0, idx).map((m) => m.periodCode) : payable.slice(0, idx + 1).map((m) => m.periodCode));
    setCustomOpen(false);
  };

  const payments = useMemo(() => (ledger?.entries ?? []).filter((e) => e.type === "PAYMENT" && e.paymentId).reverse(), [ledger]);
  const refundedByPayment = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of refunds) if (r.paymentId && r.status !== "REFUND_REJECTED") m.set(r.paymentId, (m.get(r.paymentId) ?? 0) + Number(r.amount));
    return m;
  }, [refunds]);

  const structure = useMemo(() => {
    const byHead = new Map<string, { head: string; months: number; gross: number; concession: number }>();
    for (const m of months) {
      if (m.status === "NOT_APPLICABLE") continue;
      for (const h of m.heads) {
        const row = byHead.get(h.headName) ?? { head: h.headName, months: 0, gross: 0, concession: 0 };
        row.months += 1;
        row.gross += h.baseAmount;
        row.concession += h.discountAmount;
        byHead.set(h.headName, row);
      }
    }
    return [...byHead.values()];
  }, [months]);

  const afterPayment = (paymentId?: number) => {
    toast.success("Payment received — thank you!");
    setSelected(null);
    setCustomOpen(false);
    setCustomAmount("");
    refetchChart();
    refetchDue();
    refetchLedger();
    if (paymentId) setReceiptId(paymentId);
  };

  const payOnline = async () => {
    if (!profile) return;
    const amount = round2(payAmount);
    if (!(amount > 0)) return toast.error(customOpen ? "Enter the amount you want to pay" : "Select at least one month to pay");
    const forWhat = [...prevDues.map((d) => `${d.sessionName} dues`), ...selectedMonths.map(short)].join(", ");
    if (amount > outstandingCap) return toast.error(`You can pay at most ${inr(outstandingCap)} online`);
    setIsPaying(true);
    try {
      const order = await createOrder({ studentId: profile.id, requestedAmount: amount }).unwrap();

      // Development mock mode (server-controlled): no Razorpay window, confirm directly.
      if (order.mock) {
        await verifyPayment({ razorpayOrderId: order.orderId, razorpayPaymentId: `pay_mock_${Date.now()}`, razorpaySignature: "mock", studentId: profile.id }).unwrap();
        afterPayment(order.paymentId);
        setIsPaying(false);
        return;
      }

      if (!(await loadRazorpayScript()) || !window.Razorpay) {
        toast.error("Couldn't load the payment window. Check your connection and try again.");
        setIsPaying(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amountInPaise,
        currency: "INR",
        name: "School Fees",
        description: customOpen ? `Fee payment · ${profile.admissionNo}` : `Fees for ${forWhat}`,
        order_id: order.orderId,
        prefill: { name: profile.name, contact: profile.contactNumber || profile.fatherContact || "" },
        theme: { color: getComputedStyle(document.documentElement).getPropertyValue("--erp-primary-600").trim() || "#fa8c39" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              studentId: profile.id,
            }).unwrap();
            afterPayment(order.paymentId);
          } catch (e) {
            toast.error(getErrorMessage(e, "We couldn't confirm the payment. If money was deducted, contact the school office with your transaction ID."));
          } finally {
            setIsPaying(false);
          }
        },
        modal: { ondismiss: () => setIsPaying(false) },
      });
      rzp.open();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't start the payment"));
      setIsPaying(false);
    }
  };

  const submitRefund = async () => {
    if (!refundFor || !profile) return;
    const amount = Number(refundAmount);
    if (!(amount > 0) || amount > refundFor.max) return toast.error(`Enter an amount up to ${inr(refundFor.max)}`);
    if (refundReason.trim().length < 5) return toast.error("Please explain the reason (at least 5 characters)");
    try {
      await requestRefund({ studentId: profile.id, paymentId: refundFor.paymentId, amount, reason: refundReason.trim() }).unwrap();
      toast.success("Refund request sent to the school office");
      setRefundFor(null);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't send the refund request"));
    }
  };

  if (profileLoading || (profile && chartLoading)) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fee Details" />
        <Spinner />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fee Details" />
        <EmptyState title="Your student record isn't linked yet" description="Please contact the school office." />
      </div>
    );
  }
  if (chartError || !chart) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fee Details" />
        <EmptyState title="Couldn't load your fee details" action={<Button variant="outline" onClick={() => refetchChart()}>Retry</Button>} />
      </div>
    );
  }

  const statementRows = [...(ledger?.entries ?? [])].reverse();
  const hasConcession = totals.concession > 0;
  const colCount = hasConcession ? 8 : 7;
  const statementColumns: TableColumn<LedgerEntry & { _k: number }>[] = [
    { key: "date", label: "Date", render: (e) => fmtDate(e.date) },
    { key: "description", label: "Details" },
    { key: "debit", label: "Charged", render: (e) => (e.debit ? inr(e.debit) : "—") },
    { key: "credit", label: "Paid / discount", render: (e) => (e.credit ? <span className={shared.success}>{inr(e.credit)}</span> : "—") },
    { key: "balance", label: "Balance", render: (e) => <strong>{inr(e.balance)}</strong> },
  ];

  return (
    <div className={shared.page}>
      <PageHeader title="Fee Details" subtitle={`Academic session ${chart.session.name}`} />

      {/* Student fee account */}
      <section className={styles.account}>
        <div className={styles.accountWho}>
          <span className={styles.accountAvatar}>{chart.student.name.charAt(0)}</span>
          <div>
            <div className={styles.accountName}>{chart.student.name}</div>
            <div className={styles.accountMeta}>
              <span>{chart.student.classSection}</span>
              <span>Adm. No {chart.student.admissionNo}</span>
              <span>Roll {chart.student.rollNo}</span>
              {chart.student.fatherName && <span>Father: {chart.student.fatherName}</span>}
            </div>
          </div>
        </div>
        <div className={styles.progressBox}>
          <div className={styles.progressHead}>
            <span>Annual fee paid</span>
            <strong>{totals.pct}%</strong>
          </div>
          <div className={styles.progress} role="progressbar" aria-valuenow={totals.pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${totals.pct}%` }} />
          </div>
          <div className={styles.progressFoot}>
            {inr(totals.paid)} of {inr(totals.annualNet)}
          </div>
        </div>
      </section>

      {chart.feeStructureMissing && <div className={shared.notice}>The fee structure for your class hasn't been published yet. Please check with the school office.</div>}

      {/* Summary tiles */}
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Annual fee</span>
          <span className={styles.tileValue}>{inr(totals.annualNet)}</span>
          <span className={styles.tileHint}>{totals.concession > 0 ? `After ${inr(totals.concession)} concession` : "For the full session"}</span>
        </div>
        <div className={`${styles.tile} ${styles.tilePaid}`}>
          <span className={styles.tileLabel}>Paid so far</span>
          <span className={styles.tileValue}>{inr(totals.paid)}</span>
          <span className={styles.tileHint}>{payments.length} payment{payments.length === 1 ? "" : "s"}</span>
        </div>
        <div className={`${styles.tile} ${totals.overdue > 0 ? styles.tileDanger : styles.tileDue}`}>
          <span className={styles.tileLabel}>Due now</span>
          <span className={styles.tileValue}>{inr(totals.dueNow)}</span>
          <span className={styles.tileHint}>{totals.overdue > 0 ? `${inr(totals.overdue)} overdue${totals.late > 0 ? ` · incl. ${inr(totals.late)} late fee` : ""}` : totals.dueNow > 0 ? "Pay before the due date" : "Nothing due"}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Upcoming</span>
          <span className={styles.tileValue}>{inr(totals.upcoming)}</span>
          <span className={styles.tileHint}>Rest of the session{Number(due?.totalAdvanceAvailable ?? 0) > 0 ? ` · ${inr(due?.totalAdvanceAvailable ?? 0)} advance credit` : ""}</span>
        </div>
      </div>

      {prevDues.length > 0 && (
        <div className={styles.alert} role="alert">
          <strong>Previous session dues: {inr(prevTotal)}.</strong>{" "}
          {prevDues.map((d) => `${d.sessionName} (${d.months.join(", ")})`).join("; ")} — unpaid from last year. These are added to your payment and settled first.
        </div>
      )}

      {firstOverdue && (
        <div className={styles.alert} role="alert">
          <strong>Payment overdue.</strong> Fees from {short(firstOverdue)} (due {fmtDate(firstOverdue.dueDate)}) are unpaid. Late fee is added as per the school's rule — please pay at the earliest.
        </div>
      )}

      {/* Schedule + pay panel */}
      <div className={styles.layout}>
        <section className={styles.schedule} aria-label="Fee schedule">
          <header className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Fee schedule · {chart.session.name}</h2>
              <p className={styles.panelSub}>Tick the months you want to pay. Tap a month to see the fee breakdown.</p>
            </div>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCol} aria-label="Select" />
                  <th>Month</th>
                  <th className={`${styles.num} ${styles.hideSm}`}>Fee</th>
                  {hasConcession && <th className={`${styles.num} ${styles.hideSm}`}>Concession</th>}
                  <th className={`${styles.num} ${styles.hideSm}`}>Late fee</th>
                  <th className={`${styles.num} ${styles.hideSm}`}>Paid</th>
                  <th className={styles.num}>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const canPay = m.isBilled && m.balanceDue > 0;
                  const isSel = canPay && selectedCodes.includes(m.periodCode);
                  const open = expanded === m.periodCode;
                  const na = m.status === "NOT_APPLICABLE";
                  return (
                    <Fragment key={m.periodCode}>
                      <tr
                        className={`${styles.row} ${isSel ? styles.rowSelected : ""} ${na || m.status === "UNBILLED" ? styles.rowMuted : ""}`}
                        onClick={() => !na && setExpanded(open ? null : m.periodCode)}
                      >
                        <td className={styles.checkCol} onClick={(e) => e.stopPropagation()}>
                          {canPay ? (
                            <input type="checkbox" className={styles.check} checked={isSel} onChange={() => toggleMonth(m.periodCode)} aria-label={`Pay ${m.monthName} ${m.year}`} />
                          ) : m.status === "PAID" ? (
                            <span className={styles.paidTick} aria-label="Paid">✓</span>
                          ) : null}
                        </td>
                        <td>
                          <span className={styles.monthCell}>
                            <span className={styles.caret} aria-hidden="true">{na ? "" : open ? "▾" : "▸"}</span>
                            <span>
                              <strong>{m.monthName}</strong> {m.year}
                              <span className={styles.dueLine}>{na ? m.statusReason || "Not applicable" : `Due ${fmtDate(m.dueDate)}`}</span>
                            </span>
                          </span>
                        </td>
                        <td className={`${styles.num} ${styles.hideSm}`}>{na ? "—" : inr(m.baseAmount)}</td>
                        {hasConcession && <td className={`${styles.num} ${styles.hideSm} ${shared.success}`}>{m.discountAmount ? `−${inr(m.discountAmount)}` : "—"}</td>}
                        <td className={`${styles.num} ${styles.hideSm} ${shared.danger}`}>{m.lateFeeAmount ? `+${inr(m.lateFeeAmount)}` : "—"}</td>
                        <td className={`${styles.num} ${styles.hideSm}`}>{m.paidAmount ? inr(m.paidAmount) : "—"}</td>
                        <td className={`${styles.num} ${styles.strong}`}>{na ? "—" : inr(m.balanceDue)}</td>
                        <td>
                          <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                        </td>
                      </tr>
                      {open && (
                        <tr className={styles.detailRow}>
                          <td />
                          <td colSpan={colCount - 1}>
                            <table className={styles.headTable}>
                              <tbody>
                                {m.heads.map((h) => (
                                  <tr key={h.headName}>
                                    <td>{h.headName}</td>
                                    <td className={styles.num}>{inr(h.baseAmount)}</td>
                                    <td className={`${styles.num} ${shared.success}`}>{h.discountAmount ? `−${inr(h.discountAmount)}` : ""}</td>
                                    <td className={`${styles.num} ${shared.danger}`}>{h.lateFeeAmount ? `+${inr(h.lateFeeAmount)} late` : ""}</td>
                                    <td className={styles.num}>{h.paidAmount ? `${inr(h.paidAmount)} paid` : ""}</td>
                                    <td className={`${styles.num} ${styles.strong}`}>{inr(h.balanceDue)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {m.status === "UNBILLED" && <p className={styles.note}>Estimated from your class fee structure. The bill is issued closer to the month.</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>Session total</td>
                  <td className={`${styles.num} ${styles.hideSm}`}>{inr(totals.gross)}</td>
                  {hasConcession && <td className={`${styles.num} ${styles.hideSm} ${shared.success}`}>−{inr(totals.concession)}</td>}
                  <td className={`${styles.num} ${styles.hideSm} ${shared.danger}`}>{totals.late ? `+${inr(totals.late)}` : "—"}</td>
                  <td className={`${styles.num} ${styles.hideSm}`}>{inr(totals.paid)}</td>
                  <td className={styles.num}>{inr(totals.dueNow + totals.upcoming)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <aside className={styles.payPanel} aria-label="Payment summary">
          <h2 className={styles.panelTitle}>Payment summary</h2>
          {payable.length === 0 && prevTotal === 0 ? (
            <div className={styles.allPaid}>
              <span className={styles.allPaidIcon}>✓</span>
              <strong>No dues right now</strong>
              <span className={styles.dim}>All issued fees are paid. Thank you!</span>
            </div>
          ) : (
            <>
              {!customOpen ? (
                <>
                  <ul className={styles.payList}>
                    {prevDues.map((d) => (
                      <li key={`prev-${d.sessionId}`}>
                        <span>
                          Previous dues · {d.sessionName}
                          <small className={shared.danger}> {d.months.length} month{d.months.length === 1 ? "" : "s"}, settled first</small>
                        </span>
                        <span>{inr(d.outstanding)}</span>
                      </li>
                    ))}
                    {selectedMonths.length === 0 && payable.length > 0 && <li className={styles.dim}>Select months in the fee schedule.</li>}
                    {selectedMonths.map((m) => (
                      <li key={m.periodCode}>
                        <span>
                          {m.monthName} {m.year}
                          {m.lateFeeAmount > 0 && <small className={shared.danger}> incl. {inr(m.lateFeeAmount)} late fee</small>}
                        </span>
                        <span>{inr(m.balanceDue)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.quickPick}>
                    {payable.length > 1 && (
                      <button type="button" className={styles.linkBtn} onClick={() => setSelected(payable.map((m) => m.periodCode))}>
                        Select all dues
                      </button>
                    )}
                    <button type="button" className={styles.linkBtn} onClick={() => { setCustomOpen(true); setCustomAmount(""); }}>
                      Pay a different amount
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.custom}>
                  <Input label="Amount (₹)" inputMode="decimal" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} hint={`Up to ${inr(outstandingCap)} · settles the oldest dues first`} autoFocus />
                  <button type="button" className={styles.linkBtn} onClick={() => setCustomOpen(false)}>
                    Back to month selection
                  </button>
                </div>
              )}
              <div className={styles.payTotal}>
                <span>Total payable</span>
                <strong>{inr(round2(payAmount))}</strong>
              </div>
              <Button fullWidth onClick={payOnline} isLoading={isPaying} disabled={!(payAmount > 0)}>
                Pay {inr(round2(payAmount))} securely
              </Button>
              <p className={styles.secure}>🔒 Secured by Razorpay · UPI, cards, net banking & wallets. A receipt is generated instantly.</p>
            </>
          )}
          <p className={styles.panelNote}>To pay in advance for upcoming months, or to pay by cash/cheque, please visit the school fee counter.</p>
        </aside>
      </div>

      {/* Records */}
      <div className={shared.tabs} role="tablist">
        {(
          [
            ["history", `Payment history (${payments.length})`],
            ["statement", "Statement"],
            ["structure", "Fee structure"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${shared.tab} ${tab === key ? shared.tabActive : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <section className={styles.records}>
          {ledgerLoading ? (
            <Spinner />
          ) : payments.length === 0 ? (
            <EmptyState title="No payments yet" description="Your receipts will appear here after you pay." />
          ) : (
            <ul className={styles.receipts}>
              {payments.map((p) => {
                const max = Number(p.credit) - (refundedByPayment.get(p.paymentId!) ?? 0);
                const r = refunds.filter((x) => x.paymentId === p.paymentId);
                return (
                  <li key={p.paymentId} className={styles.receipt}>
                    <span className={styles.receiptIcon} aria-hidden="true">₹</span>
                    <div className={styles.receiptMain}>
                      <strong>{inr(p.credit)}</strong>
                      <span className={styles.dim}>
                        {fmtDate(p.date)}
                        {p.referenceNo ? ` · Receipt ${p.referenceNo}` : ""}
                      </span>
                      {r.length > 0 && (
                        <span className={styles.receiptRefunds}>
                          {r.map((x) => (
                            <Badge key={x.id} tone={x.status === "REFUND_PROCESSED" ? "success" : x.status === "REFUND_REJECTED" ? "danger" : "warning"}>
                              Refund {x.status.replace("REFUND_", "").toLowerCase()} · {inr(x.amount)}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className={shared.rowActions}>
                      <Button size="sm" variant="outline" onClick={() => setReceiptId(p.paymentId!)}>
                        View receipt
                      </Button>
                      {max > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRefundFor({ paymentId: p.paymentId!, max, ref: p.referenceNo ?? "" });
                            setRefundAmount("");
                            setRefundReason("");
                          }}
                        >
                          Request refund
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "statement" && (
        <section className={styles.records}>
          <div className={styles.recordsHead}>
            <p className={styles.panelSub}>Every charge, concession, payment and refund with your running balance.</p>
            <Button size="sm" variant="outline" disabled={statementRows.length === 0} onClick={() => downloadStatement(statementRows, chart.student.admissionNo)}>
              Download statement
            </Button>
          </div>
          {ledgerLoading ? <Spinner /> : <Table columns={statementColumns} data={statementRows.map((e, i) => ({ ...e, _k: i }))} keyField="_k" emptyMessage="No fee activity yet." />}
        </section>
      )}

      {tab === "structure" && (
        <section className={styles.records}>
          {structure.length === 0 ? (
            <EmptyState title="No fee structure" description="The school hasn't published the fee structure for your class yet." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fee head</th>
                    <th className={styles.num}>Months</th>
                    <th className={styles.num}>Annual amount</th>
                    <th className={styles.num}>Concession</th>
                    <th className={styles.num}>Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.map((h) => (
                    <tr key={h.head}>
                      <td>
                        <strong>{h.head}</strong>
                      </td>
                      <td className={styles.num}>{h.months}</td>
                      <td className={styles.num}>{inr(h.gross)}</td>
                      <td className={`${styles.num} ${shared.success}`}>{h.concession ? `−${inr(h.concession)}` : "—"}</td>
                      <td className={`${styles.num} ${styles.strong}`}>{inr(h.gross - h.concession)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td className={styles.num}>{inr(totals.gross)}</td>
                    <td className={`${styles.num} ${shared.success}`}>{totals.concession ? `−${inr(totals.concession)}` : "—"}</td>
                    <td className={styles.num}>{inr(totals.annualNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      {receiptId !== null && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}

      {refundFor && (
        <Modal title="Request a refund" onClose={() => setRefundFor(null)}>
          <div className={shared.formStack}>
            <p className={shared.muted}>For payment {refundFor.ref}. The school office reviews every request; you'll see the status under Payment history.</p>
            <Input label="Amount (₹)" inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} hint={`Up to ${inr(refundFor.max)}`} />
            <Input label="Reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Paid twice by mistake" />
          </div>
          <div className={shared.formActions}>
            <Button variant="outline" onClick={() => setRefundFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitRefund} isLoading={requestingRefund}>
              Send request
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentFeesPage;
