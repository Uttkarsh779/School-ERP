import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, PageHeader, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import ReceiptModal from "../../../../components/shared/FeeReceipt/ReceiptModal";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import {
  useCreateRazorpayOrderMutation,
  useGetRefundsQuery,
  useGetStudentDueSummaryQuery,
  useGetStudentLedgerQuery,
  useRequestRefundMutation,
  useVerifyRazorpayPaymentMutation,
  type DueCharge,
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

type MonthDue = {
  key: string;
  label: string;
  dueDate: string;
  lines: Array<{ head: string; base: number; discount: number; late: number; paid: number; outstanding: number }>;
  outstanding: number;
  late: number;
  overdue: boolean;
};

// Student fees: what's due (by month, incl. late fees from the school's rule — the same
// calculation the fee counter uses), pay online, payment history with receipts, the full
// statement, and refund requests.
const StudentFeesPage = () => {
  const [tab, setTab] = useState<"dues" | "payments" | "statement">("dues");
  const [payAmount, setPayAmount] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [refundFor, setRefundFor] = useState<{ paymentId: number; max: number; ref: string } | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const { data: profile, isLoading: profileLoading } = useGetMyStudentProfileQuery();
  const studentId = profile?.id ?? 0;
  const { data: due, isLoading: dueLoading, isError: dueError, refetch: refetchDue } = useGetStudentDueSummaryQuery(studentId, { skip: !profile });
  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } = useGetStudentLedgerQuery(studentId, { skip: !profile });
  const { data: refunds = [] } = useGetRefundsQuery(profile ? { studentId } : undefined, { skip: !profile });
  const [createOrder] = useCreateRazorpayOrderMutation();
  const [verifyPayment] = useVerifyRazorpayPaymentMutation();
  const [requestRefund, { isLoading: requestingRefund }] = useRequestRefundMutation();

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const months: MonthDue[] = useMemo(() => {
    const groups = new Map<string, MonthDue>();
    const now = new Date();
    for (const c of (due?.charges ?? []) as unknown as DueCharge[]) {
      if (c.outstandingAmount <= 0) continue;
      const key = `${c.billingYear}-${String(c.billingMonth).padStart(2, "0")}`;
      const g: MonthDue = groups.get(key) ?? {
        key,
        label: `${MONTH_NAMES[c.billingMonth - 1]} ${c.billingYear}`,
        dueDate: c.dueDate,
        lines: [],
        outstanding: 0,
        late: 0,
        overdue: false,
      };
      g.lines.push({
        head: c.feeHead?.name ?? "Fee",
        base: Number(c.baseAmount),
        discount: Number(c.discountAmount),
        late: Number(c.calculatedLateFee ?? 0),
        paid: Number(c.paidAmount),
        outstanding: Number(c.outstandingAmount),
      });
      g.outstanding += Number(c.outstandingAmount);
      g.late += Number(c.calculatedLateFee ?? 0);
      g.overdue = g.overdue || new Date(c.dueDate) < now;
      if (new Date(c.dueDate) < new Date(g.dueDate)) g.dueDate = c.dueDate;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [due]);

  const totalOutstanding = Number(due?.totalOutstanding ?? 0);
  const overdueTotal = months.filter((m) => m.overdue).reduce((s, m) => s + m.outstanding, 0);
  const firstMonth = months[0];

  useEffect(() => {
    if (!payAmount && firstMonth) setPayAmount(String(Math.round(firstMonth.outstanding * 100) / 100));
  }, [firstMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const payments = useMemo(
    () => (ledger?.entries ?? []).filter((e) => e.type === "PAYMENT" && e.paymentId).reverse(),
    [ledger]
  );
  const refundedByPayment = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of refunds) {
      if (r.paymentId && r.status !== "REFUND_REJECTED") m.set(r.paymentId, (m.get(r.paymentId) ?? 0) + Number(r.amount));
    }
    return m;
  }, [refunds]);

  const afterPayment = (paymentId?: number) => {
    toast.success("Payment received — thank you!");
    setPayAmount("");
    refetchDue();
    refetchLedger();
    if (paymentId) setReceiptId(paymentId);
  };

  const payOnline = async () => {
    if (!profile) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) return toast.error("Enter the amount you want to pay");
    if (amount > totalOutstanding) return toast.error(`You can pay at most ${inr(totalOutstanding)}`);
    setIsPaying(true);
    try {
      const order = await createOrder({ studentId: profile.id, requestedAmount: amount }).unwrap();

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
        description: `Fee payment · ${profile.name} (${profile.admissionNo})`,
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

  if (profileLoading || (profile && dueLoading)) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fees & Payments" />
        <Spinner />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className={shared.page}>
        <PageHeader title="Fees & Payments" />
        <EmptyState title="Your student record isn't linked yet" description="Please contact the school office." />
      </div>
    );
  }

  const statementColumns: TableColumn<LedgerEntry & { _k: number }>[] = [
    { key: "date", label: "Date", render: (e) => fmtDate(e.date) },
    { key: "description", label: "Details" },
    { key: "debit", label: "Charged", render: (e) => (e.debit ? inr(e.debit) : "—") },
    { key: "credit", label: "Paid / discount", render: (e) => (e.credit ? <span className={shared.success}>{inr(e.credit)}</span> : "—") },
    { key: "balance", label: "Balance", render: (e) => <strong>{inr(e.balance)}</strong> },
  ];

  const paymentColumns: TableColumn<LedgerEntry>[] = [
    { key: "date", label: "Date", render: (e) => fmtDate(e.date) },
    { key: "referenceNo", label: "Receipt", render: (e) => e.referenceNo ?? "—" },
    { key: "credit", label: "Amount", render: (e) => <strong>{inr(e.credit)}</strong> },
    {
      key: "refund",
      label: "Refund",
      render: (e) => {
        const r = refunds.filter((x) => x.paymentId === e.paymentId);
        return r.length ? r.map((x) => <Badge key={x.id} tone={x.status === "REFUND_PROCESSED" ? "success" : x.status === "REFUND_REJECTED" ? "danger" : "warning"}>{x.status.replace("REFUND_", "").toLowerCase()} {inr(x.amount)}</Badge>) : "—";
      },
    },
    {
      key: "actions",
      label: "",
      render: (e) => {
        const max = Number(e.credit) - (refundedByPayment.get(e.paymentId!) ?? 0);
        return (
          <div className={shared.rowActions}>
            <Button size="sm" variant="outline" onClick={() => setReceiptId(e.paymentId!)}>
              Receipt
            </Button>
            {max > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRefundFor({ paymentId: e.paymentId!, max, ref: e.referenceNo ?? "" });
                  setRefundAmount("");
                  setRefundReason("");
                }}
              >
                Request refund
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className={shared.page}>
      <PageHeader
        title="Fees & Payments"
        subtitle={`${profile.name} · ${profile.classSection ? `${profile.classSection.className} - ${profile.classSection.section}` : ""} · Adm ${profile.admissionNo}`}
      />

      {dueError ? (
        <Card>
          <EmptyState title="Couldn't load your fees" action={<Button variant="outline" onClick={() => refetchDue()}>Retry</Button>} />
        </Card>
      ) : (
        <>
          <div className={shared.statsGrid}>
            <StatCard label="Total outstanding" value={inr(totalOutstanding)} icon={<Icon name="building" />} />
            <StatCard label="Overdue" value={inr(overdueTotal)} icon={<Icon name="bell" />} />
            <StatCard label="Next due" value={firstMonth ? fmtDate(firstMonth.dueDate) : "—"} icon={<Icon name="calendar" />} />
            <StatCard label="Advance credit" value={inr(due?.totalAdvanceAvailable ?? 0)} icon={<Icon name="check" />} />
          </div>

          {totalOutstanding > 0 ? (
            <Card title="Pay online" subtitle="Secure payment via Razorpay (UPI, cards, net banking). You'll get a receipt immediately.">
              <div className={styles.payRow}>
                <div className={styles.payInput}>
                  <Input label="Amount (₹)" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} hint={`Up to ${inr(totalOutstanding)}`} />
                </div>
                <div className={shared.rowActions}>
                  {firstMonth && (
                    <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(firstMonth.outstanding * 100) / 100))}>
                      {firstMonth.label} · {inr(firstMonth.outstanding)}
                    </Button>
                  )}
                  {overdueTotal > 0 && overdueTotal !== firstMonth?.outstanding && (
                    <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(overdueTotal * 100) / 100))}>
                      All overdue · {inr(overdueTotal)}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setPayAmount(String(Math.round(totalOutstanding * 100) / 100))}>
                    Everything · {inr(totalOutstanding)}
                  </Button>
                </div>
                <Button onClick={payOnline} isLoading={isPaying} disabled={!(Number(payAmount) > 0)}>
                  Pay {inr(Number(payAmount) || 0)}
                </Button>
              </div>
              <p className={shared.muted} style={{ marginTop: "0.75rem" }}>
                Payments settle the oldest dues first. To pay fees in advance for future months, please visit the school fee counter.
              </p>
            </Card>
          ) : (
            <div className={shared.notice}>All your fees are paid. Thank you!</div>
          )}

          <div className={shared.tabs} role="tablist">
            {(
              [
                ["dues", `Dues (${months.length})`],
                ["payments", `Payments (${payments.length})`],
                ["statement", "Statement"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${shared.tab} ${tab === key ? shared.tabActive : ""}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "dues" &&
            (months.length === 0 ? (
              <Card>
                <EmptyState title="Nothing due" description="New fees appear here when the school issues them." />
              </Card>
            ) : (
              <div className={styles.monthList}>
                {months.map((m) => (
                  <Card
                    key={m.key}
                    title={m.label}
                    subtitle={`Due ${fmtDate(m.dueDate)}`}
                    action={m.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="info">Due</Badge>}
                  >
                    <table className={shared.itemsTable}>
                      <thead>
                        <tr>
                          <th>Fee</th>
                          <th>Amount</th>
                          <th>Discount</th>
                          <th>Late fee</th>
                          <th>Paid</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.lines.map((l, i) => (
                          <tr key={i}>
                            <td>{l.head}</td>
                            <td>{inr(l.base)}</td>
                            <td>{l.discount ? <span className={shared.success}>−{inr(l.discount)}</span> : "—"}</td>
                            <td>{l.late ? <span className={shared.danger}>+{inr(l.late)}</span> : "—"}</td>
                            <td>{l.paid ? inr(l.paid) : "—"}</td>
                            <td className={shared.strong}>{inr(l.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className={shared.summaryTotal}>
                      <span>Balance for {m.label}</span>
                      <span>{inr(m.outstanding)}</span>
                    </div>
                    {m.late > 0 && <p className={shared.muted}>Includes {inr(m.late)} late fee as per the school's late-fee rule.</p>}
                  </Card>
                ))}
              </div>
            ))}

          {tab === "payments" && (
            <Card title="Payment history" subtitle="Download a receipt or request a refund for any payment">
              {ledgerLoading ? <Spinner /> : <Table columns={paymentColumns} data={payments} keyField="paymentId" emptyMessage="No payments yet." />}
            </Card>
          )}

          {tab === "statement" && (
            <Card title="Fee statement" subtitle="Every charge, discount, payment and refund with your running balance">
              {ledgerLoading ? (
                <Spinner />
              ) : (
                <Table columns={statementColumns} data={[...(ledger?.entries ?? [])].reverse().map((e, i) => ({ ...e, _k: i }))} keyField="_k" emptyMessage="No fee activity yet." />
              )}
            </Card>
          )}
        </>
      )}

      {receiptId !== null && <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />}

      {refundFor && (
        <Modal title="Request a refund" onClose={() => setRefundFor(null)}>
          <div className={shared.formStack}>
            <p className={shared.muted}>
              For payment {refundFor.ref}. The school office reviews every request; you'll see the status under Payments.
            </p>
            <Input label="Amount (₹)" inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} hint={`Up to ${inr(refundFor.max)}`} />
            <Input label="Reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Paid twice by mistake" />
          </div>
          <div className={shared.formActions}>
            <Button variant="outline" onClick={() => setRefundFor(null)}>Cancel</Button>
            <Button onClick={submitRefund} isLoading={requestingRefund}>Send request</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentFeesPage;
