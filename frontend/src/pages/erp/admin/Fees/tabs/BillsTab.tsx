import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, Input, Modal, Select, Spinner, StatCard, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { useGetSessionsQuery } from "../../../../../store/api/sessions.api";
import { useGetClassSectionsQuery } from "../../../../../store/api/classSections.api";
import {
  useBulkInvoiceActionMutation,
  useCancelInvoiceMutation,
  useRecalculateInvoiceMutation,
  useExtendDueDateMutation,
  useGenerateCollectionPeriodBillsMutation,
  useGetCollectionPeriodOverviewQuery,
  useGetInvoicesQuery,
  usePreviewCollectionPeriodMutation,
  type BulkBillResult,
  type CollectionPeriodPreview,
} from "../../../../../store/api/fees.api";
import { MONTH_NAMES, classLabel, fmtDate, getErrorMessage, humanize, inr } from "../feeUtils";
import styles from "../Fees.module.css";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  ISSUED: "info",
  DRAFT: "neutral",
  CANCELLED: "neutral",
  VOID: "neutral",
};

// Monthly bills: per-month collection summary, "generate missing bills" (idempotent), the
// bills list, due-date extension (which also moves the bill's charge due dates so late
// fees stop accruing) and corrections: recalculate an unpaid bill from the current fee
// structure, cancel a wrong bill (Super Admin) or restore a cancelled one — singly or for a
// whole month/class. Bills with payments are never changed; cancel the receipt first.
const BillsTab = ({ isSuperAdmin }: { isSuperAdmin: boolean }) => {
  const { data: sessions } = useGetSessionsQuery();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [period, setPeriod] = useState<{ month: number; year: number } | null>(null);
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<CollectionPeriodPreview | null>(null);
  const [extending, setExtending] = useState<IInvoice | null>(null);
  const [newDueDate, setNewDueDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [cancelling, setCancelling] = useState<IInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [bulkAction, setBulkAction] = useState<"cancel" | "recalculate" | null>(null);
  const [bulkClassId, setBulkClassId] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkBillResult | null>(null);

  const session = useMemo(
    () => sessions?.find((s) => s.id === sessionId) ?? sessions?.find((s) => s.isCurrent) ?? sessions?.[0] ?? null,
    [sessions, sessionId]
  );
  const { data: classSections } = useGetClassSectionsQuery(session ? { sessionId: session.id } : undefined);
  const startYear = session ? new Date(session.startDate).getFullYear() : new Date().getFullYear();
  const periodOptions = useMemo(
    () => [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m) => ({ month: m, year: m >= 4 ? startYear : startYear + 1 })),
    [startYear]
  );

  // Default to the current month if it falls in the session, otherwise the session's first month.
  useEffect(() => {
    if (period || !session) return;
    const now = new Date();
    const match = periodOptions.find((p) => p.month === now.getMonth() + 1 && p.year === now.getFullYear());
    setPeriod(match ?? periodOptions[0]);
  }, [session, period, periodOptions]);

  const { data: overview, isFetching: overviewLoading } = useGetCollectionPeriodOverviewQuery(
    period && session ? { month: period.month, year: period.year, sessionId: session.id } : undefined,
    { skip: !period || !session }
  );
  const { data: invoices, isLoading: invoicesLoading } = useGetInvoicesQuery(session ? { sessionId: session.id } : undefined, { skip: !session });
  const [previewBills, { isLoading: previewing }] = usePreviewCollectionPeriodMutation();
  const [generateBills, { isLoading: generating }] = useGenerateCollectionPeriodBillsMutation();
  const [extendDueDate, { isLoading: savingExtension }] = useExtendDueDateMutation();
  const [cancelInvoice, { isLoading: cancellingBill }] = useCancelInvoiceMutation();
  const [recalculateInvoice] = useRecalculateInvoiceMutation();
  const [recalculatingId, setRecalculatingId] = useState<number | null>(null);
  const [bulkInvoiceAction, { isLoading: bulkRunning }] = useBulkInvoiceActionMutation();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (invoices ?? []).filter((inv) => {
      const csId = inv.student?.classSectionId ?? inv.student?.classSection?.id;
      return (
        (!classId || csId === Number(classId)) &&
        (!status || inv.status === status) &&
        (!q ||
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          inv.student?.name?.toLowerCase().includes(q) ||
          inv.student?.admissionNo?.toLowerCase().includes(q))
      );
    });
  }, [invoices, classId, status, search]);

  const openPreview = async () => {
    if (!period || !session) return;
    try {
      setPreview(await previewBills({ billingMonth: period.month, billingYear: period.year, sessionId: session.id }).unwrap());
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't preview the bills"));
    }
  };

  const confirmGenerate = async () => {
    if (!period || !session) return;
    try {
      const res = await generateBills({ billingMonth: period.month, billingYear: period.year, sessionId: session.id }).unwrap();
      toast.success(`${res.newlyGenerated} bill(s) generated · ${res.alreadyBilled} already existed`);
      setPreview(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't generate bills"));
    }
  };

  const saveExtension = async () => {
    if (!extending || !newDueDate) return;
    try {
      await extendDueDate({ invoiceId: extending.id, newDueDate, reason: extendReason.trim() || undefined }).unwrap();
      toast.success("Due date extended");
      setExtending(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't extend the due date"));
    }
  };

  const recalculate = async (inv: IInvoice) => {
    setRecalculatingId(inv.id);
    try {
      const r = await recalculateInvoice(inv.id).unwrap();
      if (inv.status === "CANCELLED") toast.success(r.status === "CANCELLED" ? "No fee applies to this student for the month — the bill stays cancelled" : `Bill restored — ${inr(r.totalAmount)}`);
      else toast.success(r.totalAmount === r.oldTotal ? "Recalculated — amount unchanged" : `Recalculated: ${inr(r.oldTotal)} → ${inr(r.totalAmount)}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't recalculate the bill"));
    } finally {
      setRecalculatingId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await cancelInvoice({ invoiceId: cancelling.id, reason: cancelReason }).unwrap();
      toast.success(`${cancelling.invoiceNumber} cancelled`);
      setCancelling(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't cancel the bill"));
    }
  };

  const runBulk = async () => {
    if (!bulkAction || !period || !session) return;
    try {
      const r = await bulkInvoiceAction({
        action: bulkAction,
        sessionId: session.id,
        billingMonth: period.month,
        billingYear: period.year,
        classSectionId: bulkClassId ? Number(bulkClassId) : undefined,
        reason: bulkAction === "cancel" ? bulkReason : undefined,
      }).unwrap();
      setBulkResult(r);
      toast.success(`${r.done} bill(s) ${bulkAction === "cancel" ? "cancelled" : "recalculated"}${r.skipped.length ? ` · ${r.skipped.length} left unchanged` : ""}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't update the bills"));
    }
  };

  const openBulk = (action: "cancel" | "recalculate") => {
    setBulkAction(action);
    setBulkClassId(classId);
    setBulkReason("");
    setBulkResult(null);
  };

  const columns: TableColumn<IInvoice>[] = [
    { key: "invoiceNumber", label: "Bill No", render: (r) => <strong>{r.invoiceNumber}</strong> },
    {
      key: "student",
      label: "Student",
      render: (r) => (
        <div>
          <div className={styles.itemTitle}>{r.student?.name ?? "—"}</div>
          <div className={styles.muted}>
            {classLabel(r.student?.classSection)} · Adm {r.student?.admissionNo}
          </div>
        </div>
      ),
    },
    { key: "period", label: "Period", render: (r) => r.collectionPeriodCode?.replace("_", " ") ?? "—" },
    { key: "totalAmount", label: "Amount", render: (r) => inr(r.totalAmount) },
    { key: "paidAmount", label: "Paid", render: (r) => inr(r.paidAmount) },
    {
      key: "balance",
      label: "Balance",
      render: (r) => {
        const bal = Math.max(0, Number(r.totalAmount) - Number(r.paidAmount || 0));
        return <span className={bal > 0 ? `${styles.danger} ${styles.strong}` : styles.success}>{inr(bal)}</span>;
      },
    },
    { key: "dueDate", label: "Due", render: (r) => fmtDate(r.dueDate) },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <div>
          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{humanize(r.status)}</Badge>
          {r.status === "CANCELLED" && r.cancelReason && <div className={styles.muted}>{r.cancelReason}</div>}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r) => {
        if (r.status === "VOID") return null;
        if (r.status === "CANCELLED") {
          return (
            <Button size="sm" variant="outline" isLoading={recalculatingId === r.id} onClick={() => recalculate(r)}>
              Restore
            </Button>
          );
        }
        const unpaid = Number(r.paidAmount || 0) === 0;
        return (
          <div className={styles.rowActions}>
            {r.status !== "PAID" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setExtending(r);
                  setNewDueDate("");
                  setExtendReason("");
                }}
              >
                Extend due date
              </Button>
            )}
            {unpaid && (
              <Button size="sm" variant="ghost" isLoading={recalculatingId === r.id} onClick={() => recalculate(r)} title="Re-work this bill from the current fee structure, transport and concessions">
                Recalculate
              </Button>
            )}
            {unpaid && isSuperAdmin && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCancelling(r);
                  setCancelReason("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const periodLabelText = period ? `${MONTH_NAMES[period.month - 1]} ${period.year}` : "";

  return (
    <div className={styles.section}>
      <Card
        title={`Monthly collection · ${periodLabelText}`}
        action={
          <div className={styles.rowActions}>
            <Select
              aria-label="Session"
              value={session ? String(session.id) : ""}
              onChange={(e) => {
                setSessionId(Number(e.target.value));
                setPeriod(null);
              }}
              options={(sessions ?? []).map((s) => ({ label: `Session ${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }))}
            />
            <Select
              aria-label="Month"
              value={period ? `${period.month}-${period.year}` : ""}
              onChange={(e) => {
                const [m, y] = e.target.value.split("-").map(Number);
                setPeriod({ month: m, year: y });
              }}
              options={periodOptions.map((p) => ({ label: `${MONTH_NAMES[p.month - 1]} ${p.year}`, value: `${p.month}-${p.year}` }))}
            />
            <Button size="sm" onClick={openPreview} isLoading={previewing}>
              Generate missing bills
            </Button>
            <Button size="sm" variant="outline" onClick={() => openBulk("recalculate")} title="After fixing a fee structure or concession">
              Recalculate unpaid
            </Button>
            {isSuperAdmin && (
              <Button size="sm" variant="ghost" onClick={() => openBulk("cancel")} title="Undo bills generated by mistake">
                Cancel unpaid…
              </Button>
            )}
          </div>
        }
      >
        {overviewLoading || !overview ? (
          <Spinner />
        ) : (
          <>
            <div className={styles.statsGrid}>
              <StatCard label="Eligible students" value={overview.eligibleStudents ?? 0} />
              <StatCard label="Bills issued" value={overview.feeBillsGenerated ?? 0} />
              <StatCard label="Paid / part paid" value={`${overview.paidCount ?? 0} / ${overview.partiallyPaidCount ?? 0}`} />
              <StatCard label="Pending / overdue" value={`${overview.pendingCount ?? 0} / ${overview.overdueCount ?? 0}`} />
            </div>
            <div className={styles.summaryBox} style={{ marginTop: "1rem" }}>
              <div className={styles.summaryLine}>
                <span>Expected</span>
                <strong>{inr(overview.expectedCollectionAmount)}</strong>
              </div>
              <div className={styles.summaryLine}>
                <span>Collected</span>
                <strong className={styles.success}>{inr(overview.collectedAmount)}</strong>
              </div>
              <div className={styles.summaryTotal}>
                <span>Remaining</span>
                <span className={Number(overview.remainingAmount) > 0 ? styles.danger : undefined}>{inr(overview.remainingAmount)}</span>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card title="Fee bills" subtitle={session ? `Session ${session.name}` : undefined}>
        <div className={styles.filters}>
          <Select
            label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={[{ label: "All classes", value: "" }, ...(classSections ?? []).map((cs) => ({ label: classLabel(cs), value: String(cs.id) }))]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { label: "All statuses", value: "" },
              { label: "Issued (unpaid)", value: "ISSUED" },
              { label: "Partially paid", value: "PARTIALLY_PAID" },
              { label: "Paid", value: "PAID" },
              { label: "Overdue", value: "OVERDUE" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
          />
          <div className={styles.wide}>
            <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bill no, student name or admission no…" />
          </div>
        </div>
        {invoicesLoading ? <Spinner /> : <Table columns={columns} data={filtered} keyField="id" mobilePrimary="student" stackBelow={900} emptyMessage="No bills match these filters." />}
      </Card>

      {preview && (
        <Modal title={`Generate bills · ${periodLabelText}`} onClose={() => setPreview(null)}>
          <div className={styles.summaryBox}>
            <div className={styles.summaryLine}><span>Eligible students</span><strong>{preview.totalEligible}</strong></div>
            <div className={styles.summaryLine}><span>Already billed (skipped)</span><strong>{preview.alreadyBilled}</strong></div>
            <div className={styles.summaryLine}><span>New bills to create</span><strong className={styles.success}>{preview.newlyGenerated}</strong></div>
            <div className={styles.summaryTotal}><span>Expected total</span><span>{inr(preview.expectedAmount)}</span></div>
          </div>
          <p className={styles.muted} style={{ marginTop: "0.75rem" }}>
            Running this again is safe — students who already have a bill for this month are skipped.
          </p>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button onClick={confirmGenerate} isLoading={generating} disabled={!preview.newlyGenerated}>
              Generate {preview.newlyGenerated} bill(s)
            </Button>
          </div>
        </Modal>
      )}

      {cancelling && (
        <Modal title={`Cancel bill · ${cancelling.invoiceNumber}`} onClose={() => setCancelling(null)}>
          <div className={styles.formStack}>
            <p className={styles.muted}>
              {cancelling.student?.name} · {cancelling.collectionPeriodCode?.replace("_", " ")} · {inr(cancelling.totalAmount)}. The bill stays on record marked
              cancelled and is no longer due. You can bring it back later with <strong>Restore</strong>.
            </p>
            <Input label="Reason" required value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Student left in March, billed by mistake" />
          </div>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep bill</Button>
            <Button variant="danger" onClick={confirmCancel} isLoading={cancellingBill} disabled={cancelReason.trim().length < 3}>
              Cancel bill
            </Button>
          </div>
        </Modal>
      )}

      {bulkAction && (
        <Modal title={`${bulkAction === "cancel" ? "Cancel" : "Recalculate"} unpaid bills · ${periodLabelText}`} onClose={() => setBulkAction(null)}>
          {bulkResult ? (
            <>
              <div className={styles.summaryBox}>
                <div className={styles.summaryLine}>
                  <span>{bulkAction === "cancel" ? "Cancelled" : "Recalculated"}</span>
                  <strong className={styles.success}>{bulkResult.done}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Left unchanged</span>
                  <strong>{bulkResult.skipped.length}</strong>
                </div>
              </div>
              {bulkResult.skipped.length > 0 && (
                <ul className={styles.list} style={{ marginTop: "0.75rem", maxHeight: 260, overflowY: "auto" }}>
                  {bulkResult.skipped.map((s) => (
                    <li key={s.invoiceNumber} className={styles.listItem}>
                      <div className={styles.listMain}>
                        <div className={styles.itemTitle}>
                          {s.student} · {s.invoiceNumber}
                        </div>
                        <div className={styles.muted}>{s.reason}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.formActions}>
                <Button onClick={() => setBulkAction(null)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.formStack}>
                <p className={styles.muted}>
                  {bulkAction === "cancel"
                    ? "Use this to undo bills generated by mistake. Bills that already have a payment are left as they are."
                    : "Re-works every unpaid bill of the month from the current fee structure, transport and concessions — use it after fixing a wrong amount. Paid bills and bills with waivers are left as they are."}
                </p>
                <Select
                  label="Class"
                  value={bulkClassId}
                  onChange={(e) => setBulkClassId(e.target.value)}
                  options={[{ label: "All classes", value: "" }, ...(classSections ?? []).map((cs) => ({ label: classLabel(cs), value: String(cs.id) }))]}
                />
                {bulkAction === "cancel" && (
                  <Input label="Reason" required value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. Generated for the wrong month" />
                )}
              </div>
              <div className={styles.formActions}>
                <Button variant="outline" onClick={() => setBulkAction(null)}>Close</Button>
                <Button
                  variant={bulkAction === "cancel" ? "danger" : "primary"}
                  onClick={runBulk}
                  isLoading={bulkRunning}
                  disabled={bulkAction === "cancel" && bulkReason.trim().length < 3}
                >
                  {bulkAction === "cancel" ? "Cancel unpaid bills" : "Recalculate unpaid bills"}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {extending && (
        <Modal title={`Extend due date · ${extending.invoiceNumber}`} onClose={() => setExtending(null)}>
          <div className={styles.formStack}>
            <p className={styles.muted}>
              Current due date: <strong>{fmtDate(extending.dueDate)}</strong>. Late fees are calculated from the new date.
            </p>
            <Input label="New due date" type="date" required value={newDueDate} min={extending.dueDate.slice(0, 10)} onChange={(e) => setNewDueDate(e.target.value)} />
            <Input label="Reason" value={extendReason} onChange={(e) => setExtendReason(e.target.value)} placeholder="e.g. Approved by principal" />
          </div>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setExtending(null)}>Cancel</Button>
            <Button onClick={saveExtension} isLoading={savingExtension} disabled={!newDueDate}>Save</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default BillsTab;
