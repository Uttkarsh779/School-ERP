import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, EmptyState, Icon, Input, Modal, PageHeader, Spinner } from "../../../../components/ui";
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
import { MONTH_NAMES, fmtDate, getErrorMessage, inr } from "../../admin/Fees/feeUtils";
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
  student: {
    name: string;
    admissionNo: string;
    rollNo: string;
    classSection: string;
    fatherName: string;
  };
  session: { name: string };
  months: ChartMonth[];
  feeStructureMissing: boolean;
  // Unpaid fees of other sessions (previous-year dues carried forward).
  otherSessionDues?: Array<{
    sessionId: number;
    sessionName: string;
    outstanding: number;
    months: string[];
    isPrevious: boolean;
  }>;
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

// The statement in plain terms: each month's fee lines (and their concessions) become one
// "<Month> fees" bill, payments and refunds stay as their own rows. Newest first.
type StatementItem =
  | {
      kind: "bill";
      key: string;
      date: string;
      title: string;
      lines: { name: string; amount: number }[];
      discount: number;
      amount: number;
      balance: number;
    }
  | {
      kind: "payment";
      key: string;
      date: string;
      title: string;
      sub: string;
      amount: number;
      balance: number;
    }
  | {
      kind: "other";
      key: string;
      date: string;
      title: string;
      amount: number;
      credit: boolean;
      balance: number;
    };

const PERIOD_RE = /^(Discount on )?(.+) \((\d{1,2})\/(\d{4})\)$/;
const modeLabel = (mode?: string) => {
  if (!mode) return "";
  if (/razorpay|online/i.test(mode)) return "Online";
  return mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
};

const buildStatement = (entries: LedgerEntry[]): StatementItem[] => {
  const items: StatementItem[] = [];
  const bills = new Map<string, Extract<StatementItem, { kind: "bill" }>>();
  for (const e of entries) {
    const m = e.type === "CHARGE" || e.type === "ADJUSTMENT" ? PERIOD_RE.exec(e.description) : null;
    if (m) {
      const period = `${m[4]}-${m[3]}`;
      let bill = bills.get(period);
      if (!bill) {
        bill = {
          kind: "bill",
          key: `bill-${period}`,
          date: e.date,
          title: `${MONTH_NAMES[Number(m[3]) - 1]} ${m[4]} fees`,
          lines: [],
          discount: 0,
          amount: 0,
          balance: e.balance,
        };
        bills.set(period, bill);
        items.push(bill);
      }
      if (m[1]) bill.discount += e.credit;
      else bill.lines.push({ name: m[2], amount: e.debit });
      bill.amount += e.debit - e.credit;
      bill.balance = e.balance;
    } else if (e.type === "PAYMENT") {
      const sub = [modeLabel(/\(([^)]+)\)/.exec(e.description)?.[1]), e.referenceNo ? `Receipt ${e.referenceNo}` : ""].filter(Boolean).join(" · ");
      items.push({
        kind: "payment",
        key: `pay-${e.paymentId ?? items.length}`,
        date: e.date,
        title: "Payment received",
        sub,
        amount: e.credit,
        balance: e.balance,
      });
    } else {
      const title = e.type === "REFUND" ? "Refund to you" : e.description.replace(/^Discount\/Adjustment: /, "Adjustment: ");
      items.push({
        kind: "other",
        key: `other-${items.length}`,
        date: e.date,
        title,
        amount: e.debit || e.credit,
        credit: e.credit > 0,
        balance: e.balance,
      });
    }
  }
  return items.reverse();
};

// "₹2,000 × 12 months", "Once a year", or "4 months" when the monthly amount varies.
const headSchedule = (amounts: number[]) => {
  if (amounts.length === 1) return "Once a year";
  if (amounts.every((a) => a === amounts[0])) return `${inr(amounts[0])} × ${amounts.length} months`;
  return `${amounts.length} months`;
};

// Student fees, phone first: one "Pay fees" card (what is due, pick months, pay), then
// tabs for the month-by-month view, receipts, the statement and the fee structure.
const StudentFeesPage = () => {
  const [tab, setTab] = useState<"months" | "history" | "statement" | "structure">("months");
  const [openBill, setOpenBill] = useState<string | null>(null);
  const [showAllStatement, setShowAllStatement] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null); // periodCodes; null = default (all payable)
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [refundFor, setRefundFor] = useState<{
    paymentId: number;
    max: number;
    ref: string;
  } | null>(null);
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
    return {
      gross,
      concession,
      late,
      paid,
      overdue,
      dueNow,
      upcoming,
      annualNet,
      pct: annualNet > 0 ? Math.min(100, Math.round((paid / annualNet) * 100)) : 0,
    };
  }, [months, payable]);

  // The office's outstanding figure is the payment cap (it is what the server checks).
  const outstandingCap = Number(due?.totalOutstanding ?? totals.dueNow);
  // Previous sessions' dues are settled first (online payments clear the oldest dues first),
  // so they are always part of the amount.
  const prevDues = (chart?.otherSessionDues ?? []).filter((d) => d.isPrevious && d.outstanding > 0);
  const prevTotal = round2(prevDues.reduce((s, d) => s + d.outstanding, 0));
  const selectedTotal = round2(selectedMonths.reduce((s, m) => s + m.balanceDue, 0));
  const payAmount = customOpen ? Number(customAmount) || 0 : Math.min(prevTotal + selectedTotal, outstandingCap);

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
    const byHead = new Map<
      string,
      {
        head: string;
        months: number;
        gross: number;
        concession: number;
        amounts: number[];
      }
    >();
    for (const m of months) {
      if (m.status === "NOT_APPLICABLE") continue;
      for (const h of m.heads) {
        const row = byHead.get(h.headName) ?? {
          head: h.headName,
          months: 0,
          gross: 0,
          concession: 0,
          amounts: [],
        };
        row.months += 1;
        row.amounts.push(h.baseAmount);
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
      const order = await createOrder({
        studentId: profile.id,
        requestedAmount: amount,
      }).unwrap();

      // Development mock mode (server-controlled): no Razorpay window, confirm directly.
      if (order.mock) {
        await verifyPayment({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: `pay_mock_${Date.now()}`,
          razorpaySignature: "mock",
          studentId: profile.id,
        }).unwrap();
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
        prefill: {
          name: profile.name,
          contact: profile.contactNumber || profile.fatherContact || "",
        },
        theme: {
          color: getComputedStyle(document.documentElement).getPropertyValue("--erp-primary-600").trim() || "#fa8c39",
        },
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
      await requestRefund({
        studentId: profile.id,
        paymentId: refundFor.paymentId,
        amount,
        reason: refundReason.trim(),
      }).unwrap();
      toast.success("Refund request sent to the school office");
      setRefundFor(null);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't send the refund request"));
    }
  };

  if (profileLoading || (profile && chartLoading)) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fees" />
        <Spinner />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fees" />
        <EmptyState title="Your student record isn't linked yet" description="Please contact the school office." />
      </div>
    );
  }
  if (chartError || !chart) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fees" />
        <EmptyState
          title="Couldn't load your fee details"
          action={
            <Button variant="outline" onClick={() => refetchChart()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const ledgerRows = ledger?.entries ?? [];
  const statement = buildStatement(ledgerRows);
  const statementShown = showAllStatement ? statement : statement.slice(0, 12);
  const balanceNow = Number(ledger?.finalBalance ?? (ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0));
  const overdueMonths = months.filter((m) => m.status === "OVERDUE");
  const upcomingMonths = months.filter((m) => m.status === "UNBILLED");
  const nothingDue = payable.length === 0 && prevTotal === 0;
  const dueTotal = round2(Math.min(prevTotal + totals.dueNow, outstandingCap || prevTotal + totals.dueNow));
  const advance = Number(due?.totalAdvanceAvailable ?? 0);
  const monthAmount = (m: ChartMonth) => (m.status === "PAID" ? m.paidAmount : m.balanceDue);

  return (
    <div className={shared.page}>
      <PageHeader title="Fees" subtitle={`${chart.session.name} · ${chart.student.classSection} · Adm. No ${chart.student.admissionNo}`} />

      {chart.feeStructureMissing && (
        <div className={shared.notice}>The fee structure for your class hasn't been published yet. Please check with the school office.</div>
      )}

      {/* Phone: one column. Desktop: the pay card on the left (sticky), records on the right. */}
      <div className={styles.layout}>
        <div className={styles.side}>
          {/* Pay fees: what is due, pick the months, pay */}
          <section className={styles.payCard} aria-label="Pay fees">
            {nothingDue ? (
              <div className={styles.allPaid}>
                <span className={styles.allPaidIcon} aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>No dues right now</strong>
                  <span className={styles.dim}>All issued fees are paid. Thank you!</span>
                </div>
              </div>
            ) : (
              <>
                <div className={`${styles.dueHead} ${overdueMonths.length ? styles.dueHeadLate : ""}`}>
                  <span className={styles.dueLabel}>{overdueMonths.length ? "Overdue · please pay" : "Due now"}</span>
                  <span className={styles.dueBig}>{inr(dueTotal)}</span>
                  <span className={styles.dueSub}>
                    {payable.length > 0 && `${payable.length} month${payable.length === 1 ? "" : "s"} unpaid`}
                    {totals.late > 0 && ` · includes ${inr(totals.late)} late fee`}
                    {prevTotal > 0 && `${payable.length ? " · " : ""}${inr(prevTotal)} from last session`}
                  </span>
                </div>

                {!customOpen ? (
                  <>
                    <div className={styles.pickHead}>
                      <span>Choose what to pay</span>
                      {payable.length > 1 && selectedMonths.length < payable.length && (
                        <button type="button" className={styles.linkBtn} onClick={() => setSelected(payable.map((m) => m.periodCode))}>
                          Select all
                        </button>
                      )}
                    </div>
                    <ul className={styles.dueList}>
                      {prevDues.map((d) => (
                        <li key={`prev-${d.sessionId}`}>
                          <div className={`${styles.dueRow} ${styles.dueRowOn} ${styles.dueRowFixed}`}>
                            <input type="checkbox" className={styles.check} checked disabled aria-label={`${d.sessionName} dues`} />
                            <span className={styles.dueWhat}>
                              <strong>Last session dues</strong>
                              <small>
                                {d.sessionName} · {d.months.join(", ")} · always paid first
                              </small>
                            </span>
                            <span className={styles.dueAmt}>{inr(d.outstanding)}</span>
                          </div>
                        </li>
                      ))}
                      {payable.map((m) => {
                        const on = selectedCodes.includes(m.periodCode);
                        return (
                          <li key={m.periodCode}>
                            <label className={`${styles.dueRow} ${on ? styles.dueRowOn : ""}`}>
                              <input type="checkbox" className={styles.check} checked={on} onChange={() => toggleMonth(m.periodCode)} />
                              <span className={styles.dueWhat}>
                                <strong>
                                  {m.monthName} {m.year}
                                </strong>
                                <small className={m.status === "OVERDUE" ? styles.lateText : undefined}>
                                  {m.status === "OVERDUE" ? `Overdue since ${fmtDate(m.dueDate)}` : `Due ${fmtDate(m.dueDate)}`}
                                  {m.lateFeeAmount > 0 && ` · ${inr(m.lateFeeAmount)} late fee`}
                                </small>
                              </span>
                              <span className={styles.dueAmt}>{inr(m.balanceDue)}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    {payable.length > 1 && <p className={styles.hint}>Months are paid in order, oldest first.</p>}
                  </>
                ) : (
                  <div className={styles.custom}>
                    <Input
                      label="Amount (₹)"
                      inputMode="decimal"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      hint={`Up to ${inr(outstandingCap)} · clears the oldest dues first`}
                      autoFocus
                    />
                  </div>
                )}

                <Button fullWidth onClick={payOnline} isLoading={isPaying} disabled={!(payAmount > 0)}>
                  {payAmount > 0 ? `Pay ${inr(round2(payAmount))}` : customOpen ? "Enter an amount" : "Select a month to pay"}
                </Button>
                <button
                  type="button"
                  className={`${styles.linkBtn} ${styles.centerLink}`}
                  onClick={() => {
                    setCustomOpen((o) => !o);
                    setCustomAmount("");
                  }}
                >
                  {customOpen ? "Choose months instead" : "Pay a different amount"}
                </button>
                <p className={styles.secure}>🔒 Secure payment by Razorpay · UPI, cards, net banking. Receipt is instant.</p>
              </>
            )}

            {/* The year at a glance */}
            <div className={styles.year}>
              <div className={styles.yearHead}>
                <span>
                  Paid <strong>{inr(totals.paid)}</strong> of {inr(totals.annualNet)} this year
                </span>
                <strong className={styles.yearPct}>{totals.pct}%</strong>
              </div>
              <div className={styles.progress} role="progressbar" aria-valuenow={totals.pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${totals.pct}%` }} />
              </div>
              {(upcomingMonths.length > 0 || advance > 0 || totals.concession > 0) && (
                <div className={styles.yearFoot}>
                  {upcomingMonths.length > 0 && (
                    <span>
                      {inr(totals.upcoming)} still to come ({short(upcomingMonths[0])}
                      {upcomingMonths.length > 1 ? ` – ${short(upcomingMonths[upcomingMonths.length - 1])}` : ""})
                    </span>
                  )}
                  {totals.concession > 0 && <span className={shared.success}>{inr(totals.concession)} concession applied</span>}
                  {advance > 0 && <span className={shared.success}>{inr(advance)} advance credit</span>}
                </div>
              )}
            </div>
          </section>
          <p className={styles.panelNote}>To pay in advance for upcoming months, or to pay by cash or cheque, please visit the school fee counter.</p>
        </div>

        <div className={styles.main}>
          {/* Records */}
          <div className={`${shared.tabs} ${styles.tabs}`} role="tablist">
            {(
              [
                ["months", "Months"],
                ["history", `Receipts${payments.length ? ` (${payments.length})` : ""}`],
                ["statement", "Statement"],
                ["structure", "Fee structure"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`${shared.tab} ${tab === key ? shared.tabActive : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "months" && (
            <section className={styles.records}>
              <p className={styles.recordsIntro}>Every month of {chart.session.name}. Tap a month to see what it includes.</p>
              <ul className={styles.list}>
                {months.map((m) => {
                  const na = m.status === "NOT_APPLICABLE";
                  const open = expanded === m.periodCode;
                  return (
                    <li key={m.periodCode} className={`${styles.item} ${na || m.status === "UNBILLED" ? styles.itemMuted : ""}`}>
                      <button
                        type="button"
                        className={styles.itemBtn}
                        disabled={na}
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : m.periodCode)}
                      >
                        <span className={`${styles.dot} ${styles[`dot${m.status}`]}`} aria-hidden="true" />
                        <span className={styles.itemMain}>
                          <strong>
                            {m.monthName} {m.year}
                          </strong>
                          <small>
                            {na
                              ? m.statusReason || "Not applicable"
                              : m.status === "PAID"
                                ? "Paid in full"
                                : m.status === "UNBILLED"
                                  ? `Due ${fmtDate(m.dueDate)} · estimate`
                                  : `Due ${fmtDate(m.dueDate)}`}
                          </small>
                        </span>
                        <span className={styles.itemEnd}>
                          <span className={styles.itemAmt}>{na ? "—" : inr(monthAmount(m))}</span>
                          <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                        </span>
                        {!na && (
                          <span className={`${styles.chev} ${open ? styles.chevOpen : ""}`} aria-hidden="true">
                            ›
                          </span>
                        )}
                      </button>
                      {open && (
                        <div className={styles.breakdown}>
                          {m.heads.map((h) => (
                            <div key={h.headName} className={styles.bdRow}>
                              <span>{h.headName}</span>
                              <span>{inr(h.baseAmount)}</span>
                            </div>
                          ))}
                          {m.discountAmount > 0 && (
                            <div className={`${styles.bdRow} ${shared.success}`}>
                              <span>Concession</span>
                              <span>−{inr(m.discountAmount)}</span>
                            </div>
                          )}
                          {m.lateFeeAmount > 0 && (
                            <div className={`${styles.bdRow} ${shared.danger}`}>
                              <span>Late fee</span>
                              <span>+{inr(m.lateFeeAmount)}</span>
                            </div>
                          )}
                          {m.paidAmount > 0 && (
                            <div className={`${styles.bdRow} ${shared.success}`}>
                              <span>Paid</span>
                              <span>−{inr(m.paidAmount)}</span>
                            </div>
                          )}
                          <div className={`${styles.bdRow} ${styles.bdTotal}`}>
                            <span>{m.status === "PAID" ? "Balance" : "To pay"}</span>
                            <span>{inr(m.balanceDue)}</span>
                          </div>
                          {m.status === "UNBILLED" && (
                            <p className={styles.hint}>Estimated from your class fee structure. The bill is issued closer to the month.</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {tab === "history" && (
            <section className={styles.records}>
              {ledgerLoading ? (
                <Spinner />
              ) : payments.length === 0 ? (
                <EmptyState title="No payments yet" description="Your receipts will appear here after you pay." />
              ) : (
                <ul className={styles.list}>
                  {payments.map((p) => {
                    const max = Number(p.credit) - (refundedByPayment.get(p.paymentId!) ?? 0);
                    const r = refunds.filter((x) => x.paymentId === p.paymentId);
                    return (
                      <li key={p.paymentId} className={styles.receipt}>
                        <span className={styles.receiptIcon} aria-hidden="true">
                          ₹
                        </span>
                        <div className={styles.receiptMain}>
                          <strong>{inr(p.credit)}</strong>
                          <span className={styles.dim}>
                            {fmtDate(p.date)}
                            {p.referenceNo ? ` · ${p.referenceNo}` : ""}
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
                        <div className={styles.receiptActions}>
                          <Button size="sm" variant="outline" onClick={() => setReceiptId(p.paymentId!)}>
                            Receipt
                          </Button>
                          {max > 0 && (
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() => {
                                setRefundFor({
                                  paymentId: p.paymentId!,
                                  max,
                                  ref: p.referenceNo ?? "",
                                });
                                setRefundAmount("");
                                setRefundReason("");
                              }}
                            >
                              Request refund
                            </button>
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
              <div className={styles.balanceBox}>
                <div>
                  <span className={styles.dim}>Balance you owe today</span>
                  <strong className={styles.balanceBig}>{inr(Math.max(0, balanceNow))}</strong>
                  {balanceNow < 0 && <span className={shared.success}>{inr(-balanceNow)} paid in advance</span>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ledgerRows.length === 0}
                  onClick={() => downloadStatement([...ledgerRows].reverse(), chart.student.admissionNo)}
                >
                  Download
                </Button>
              </div>
              <p className={styles.recordsIntro}>
                Fees added to your account each month, and the payments you made. Newest first. The balance after each line is shown under it.
              </p>
              {ledgerLoading ? (
                <Spinner />
              ) : statement.length === 0 ? (
                <EmptyState title="No fee activity yet" description="Bills and payments will appear here." />
              ) : (
                <>
                  <ul className={styles.list}>
                    {statementShown.map((it) => {
                      const open = it.kind === "bill" && openBill === it.key;
                      const credit = it.kind === "payment" || (it.kind === "other" && it.credit);
                      const body = (
                        <>
                          <span className={`${styles.stIcon} ${credit ? styles.stIconIn : ""}`} aria-hidden="true">
                            <Icon name={it.kind === "bill" ? "fileText" : credit ? "check" : "arrowLeft"} size={16} />
                          </span>
                          <span className={styles.itemMain}>
                            <strong>{it.title}</strong>
                            <small>
                              {fmtDate(it.date)}
                              {it.kind === "payment" && it.sub ? ` · ${it.sub}` : ""}
                              {it.kind === "bill" ? ` · ${it.lines.length} item${it.lines.length === 1 ? "" : "s"}` : ""}
                            </small>
                          </span>
                          <span className={styles.itemEnd}>
                            <span className={`${styles.itemAmt} ${credit ? shared.success : ""}`}>
                              {credit ? "−" : "+"}
                              {inr(it.amount)}
                            </span>
                            <small className={styles.balAfter}>{it.balance < 0 ? `${inr(-it.balance)} in advance` : `Balance ${inr(it.balance)}`}</small>
                          </span>
                          {/* Rows without details keep an empty slot so amounts line up */}
                          <span className={`${styles.chev} ${open ? styles.chevOpen : ""}`} style={it.kind === "bill" ? undefined : { visibility: "hidden" }} aria-hidden="true">
                            ›
                          </span>
                        </>
                      );
                      return (
                        <li key={it.key} className={styles.item}>
                          {it.kind === "bill" ? (
                            <button type="button" className={styles.itemBtn} aria-expanded={open} onClick={() => setOpenBill(open ? null : it.key)}>
                              {body}
                            </button>
                          ) : (
                            <div className={styles.itemBtn}>{body}</div>
                          )}
                          {open && it.kind === "bill" && (
                            <div className={styles.breakdown}>
                              {it.lines.map((l, i) => (
                                <div key={i} className={styles.bdRow}>
                                  <span>{l.name}</span>
                                  <span>{inr(l.amount)}</span>
                                </div>
                              ))}
                              {it.discount > 0 && (
                                <div className={`${styles.bdRow} ${shared.success}`}>
                                  <span>Concession</span>
                                  <span>−{inr(it.discount)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {statement.length > statementShown.length && (
                    <button type="button" className={`${styles.linkBtn} ${styles.centerLink}`} onClick={() => setShowAllStatement(true)}>
                      Show older ({statement.length - statementShown.length})
                    </button>
                  )}
                  <p className={styles.legend}>
                    <span>+ fee added</span>
                    <span className={shared.success}>− payment / concession</span>
                  </p>
                </>
              )}
            </section>
          )}

          {tab === "structure" && (
            <section className={styles.records}>
              {structure.length === 0 ? (
                <EmptyState title="No fee structure" description="The school hasn't published the fee structure for your class yet." />
              ) : (
                <>
                  <p className={styles.recordsIntro}>What your class pays in {chart.session.name}, fee by fee.</p>
                  <ul className={styles.list}>
                    {structure.map((h) => (
                      <li key={h.head} className={`${styles.item} ${styles.itemBtn}`}>
                        <span className={styles.itemMain}>
                          <strong>{h.head}</strong>
                          <small>{headSchedule(h.amounts)}</small>
                        </span>
                        <span className={styles.itemEnd}>
                          <span className={styles.itemAmt}>{inr(h.gross - h.concession)}</span>
                          {h.concession > 0 && <small className={shared.success}>{inr(h.concession)} off</small>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.structureTotal}>
                    <span>
                      Total for the year
                      {totals.concession > 0 && <small>after {inr(totals.concession)} concession</small>}
                    </span>
                    <strong>{inr(totals.annualNet)}</strong>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {receiptId !== null && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}

      {refundFor && (
        <Modal title="Request a refund" onClose={() => setRefundFor(null)}>
          <div className={shared.formStack}>
            <p className={shared.muted}>For payment {refundFor.ref}. The school office reviews every request; you'll see the status under Receipts.</p>
            <Input
              label="Amount (₹)"
              inputMode="decimal"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              hint={`Up to ${inr(refundFor.max)}`}
            />
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
