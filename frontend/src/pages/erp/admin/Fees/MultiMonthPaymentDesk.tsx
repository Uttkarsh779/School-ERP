import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "../../../../components/ui";
import ReceiptModal from "../../../../components/shared/FeeReceipt/ReceiptModal";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useGetStudentMonthsChartQuery, useRecordMultiMonthPaymentMutation } from "../../../../store/api/fees.api";
import { useAppSelector } from "../../../../store/store";
import { classLabel, getErrorMessage, inr } from "./feeUtils";
import styles from "./MultiMonthPaymentDesk.module.css";
import shared from "./Fees.module.css";

interface MultiMonthPaymentDeskProps {
  initialStudentId?: number;
  onPaymentSuccess?: () => void;
}

type MonthRow = {
  month: number;
  year: number;
  monthName: string;
  quarter: string;
  status: "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "DUE" | "UNBILLED" | "NOT_APPLICABLE";
  statusReason?: string;
  baseAmount: number;
  lateFeeAmount: number;
  paidAmount: number;
  balanceDue: number;
  heads: Array<{ feeHeadId: number; headName: string; baseAmount: number; balanceDue: number }>;
};

const STATUS_META: Record<MonthRow["status"], { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  PAID: { label: "Paid", tone: "success" },
  PARTIALLY_PAID: { label: "Part paid", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  DUE: { label: "Due", tone: "info" },
  UNBILLED: { label: "Upcoming", tone: "neutral" },
  NOT_APPLICABLE: { label: "Not enrolled", tone: "neutral" },
};

// Months that can't be selected for payment: already paid, or the student wasn't on roll.
const isLocked = (m: MonthRow) => m.status === "PAID" || m.status === "NOT_APPLICABLE";

const keyOf = (m: { month: number; year: number }) => `${m.month}-${m.year}`;

// Counter payment desk: pick a student, select months on the 12-month calendar, review the
// amount and record the payment. Late fees come from the configured rule (server); waivers
// and discounts can be applied by Admins and Super Admins, each recorded with its reason.
// Phone picker shows at most this many students; search or the class filter narrows the rest.
const PICK_LIMIT = 50;

const MultiMonthPaymentDesk = ({ initialStudentId, onPaymentSuccess }: MultiMonthPaymentDeskProps) => {
  const role = useAppSelector((s) => s.auth.user?.role);
  const canWaive = role === "SUPER_ADMIN" || role === "ADMIN";

  const [filterClassId, setFilterClassId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  // Phone student picker: list stays open until a student is chosen
  const [pickerOpen, setPickerOpen] = useState(!initialStudentId);
  const [selectedStudentId, setSelectedStudentId] = useState<number | "">(initialStudentId ?? "");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const collectRef = useRef<HTMLDivElement>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  // Super Admin only
  const [waiveLateFines, setWaiveLateFines] = useState(false);
  const [headWaivers, setHeadWaivers] = useState<Record<string, { amount: string; reason: string }>>({});
  const [lumpType, setLumpType] = useState<"FIXED_AMOUNT" | "PERCENTAGE">("FIXED_AMOUNT");
  const [lumpValue, setLumpValue] = useState("");
  const [lumpReason, setLumpReason] = useState("");

  const [paymentMode, setPaymentMode] = useState<"CASH" | "BANK_TRANSFER" | "UPI_MANUAL">("CASH");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [receipt, setReceipt] = useState<{ paymentId: number; note: string } | null>(null);
  // Session shown on the calendar: undefined = current; set to collect an older session's dues.
  const [viewSessionId, setViewSessionId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (initialStudentId) setSelectedStudentId(initialStudentId);
  }, [initialStudentId]);

  useEffect(() => setViewSessionId(undefined), [selectedStudentId]);

  const { data: classSections } = useGetClassSectionsQuery();
  const { data: students } = useGetStudentsQuery();
  const { data: chart, isFetching: chartLoading, refetch } = useGetStudentMonthsChartQuery(
    { studentId: Number(selectedStudentId), sessionId: viewSessionId },
    { skip: !selectedStudentId }
  );
  const otherDues: Array<{ sessionId: number; sessionName: string; outstanding: number; months: string[]; isPrevious: boolean }> = chart?.otherSessionDues ?? [];
  const [recordPayment, { isLoading: isSubmitting }] = useRecordMultiMonthPaymentMutation();

  const months: MonthRow[] = useMemo(() => chart?.months ?? [], [chart]);
  const student = useMemo(() => students?.find((s) => s.id === Number(selectedStudentId)) ?? null, [students, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (students ?? []).filter(
      (s) =>
        s.isActive &&
        (!filterClassId || s.classSectionId === Number(filterClassId)) &&
        (!q || s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q) || (s.rollNo ?? "").toLowerCase().includes(q))
    );
  }, [students, filterClassId, searchQuery]);

  // New student / refreshed chart: preselect the earliest unpaid month, reset waivers.
  useEffect(() => {
    const firstOpen = months.find((m) => !isLocked(m) && m.balanceDue > 0);
    setSelectedKeys(firstOpen ? [keyOf(firstOpen)] : []);
    setHeadWaivers({});
    setLumpValue("");
    setLumpReason("");
    setWaiveLateFines(false);
  }, [months]);

  const selected = months.filter((m) => selectedKeys.includes(keyOf(m)));

  const summary = useMemo(() => {
    const due = selected.reduce((s, m) => s + Math.max(0, m.balanceDue - (m.lateFeeAmount || 0)), 0);
    const late = selected.reduce((s, m) => s + (m.lateFeeAmount || 0), 0);
    const lateWaived = canWaive && waiveLateFines ? late : 0;
    const heads = canWaive
      ? Object.entries(headWaivers)
          .filter(([k]) => selectedKeys.some((sk) => k.startsWith(`${sk}-`)))
          .reduce((s, [, w]) => s + (Number(w.amount) > 0 ? Number(w.amount) : 0), 0)
      : 0;
    const beforeLump = Math.max(0, due + late - lateWaived - heads);
    const lv = Number(lumpValue);
    const lump = canWaive && lv > 0 ? (lumpType === "PERCENTAGE" ? Math.round((beforeLump * Math.min(lv, 100)) / 100) : Math.min(lv, beforeLump)) : 0;
    return { due, late, lateWaived, heads, lump, net: Math.max(0, beforeLump - lump) };
  }, [selected, selectedKeys, waiveLateFines, headWaivers, lumpType, lumpValue, canWaive]);

  useEffect(() => {
    setPayAmount(summary.net > 0 ? String(Math.round(summary.net * 100) / 100) : "");
  }, [summary.net]);

  const toggle = (m: MonthRow) => {
    if (isLocked(m)) return;
    const k = keyOf(m);
    setSelectedKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const selectWhere = (pred: (m: MonthRow) => boolean) =>
    setSelectedKeys(months.filter((m) => !isLocked(m) && pred(m)).map(keyOf));

  const submit = async () => {
    if (!student || selected.length === 0) return;
    const amount = Number(payAmount);
    if (!(amount > 0)) {
      toast.error("Enter the amount being collected.");
      return;
    }
    if (paymentMode !== "CASH" && !transactionRef.trim()) {
      toast.error("Enter the UPI / bank / cheque reference for non-cash payments.");
      return;
    }
    try {
      const res = await recordPayment({
        studentId: student.id,
        sessionId: chart?.session?.id,
        selectedMonths: selected.map((m) => ({
          month: m.month,
          year: m.year,
          headWaivers: canWaive
            ? Object.entries(headWaivers)
                .filter(([k, w]) => k.startsWith(`${keyOf(m)}-`) && Number(w.amount) > 0)
                .map(([k, w]) => ({
                  feeHeadId: Number(k.split("-")[2]),
                  waiverAmount: Number(w.amount),
                  reason: w.reason.trim() || "Fee head waiver",
                }))
            : [],
        })),
        lumpSumDiscount:
          canWaive && Number(lumpValue) > 0
            ? { type: lumpType, value: Number(lumpValue), reason: lumpReason.trim() || "Discount at payment desk" }
            : undefined,
        waiveLateFines: canWaive && waiveLateFines,
        paymentAmount: amount,
        paymentMode,
        transactionRef: transactionRef.trim() || undefined,
        notes: notes.trim() || undefined,
      }).unwrap();

      toast.success(`Payment recorded — receipt ${res.receiptNumber}`);
      const parts = [`Months covered: ${(res.clearedMonths ?? []).join(", ")}`];
      if (res.excessCreditedAsAdvance > 0) parts.push(`${inr(res.excessCreditedAsAdvance)} kept as advance credit.`);
      setReceipt({ paymentId: res.paymentId, note: parts.join(" · ") });
      setTransactionRef("");
      setNotes("");
      refetch();
      onPaymentSuccess?.();
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't record the payment"));
    }
  };

  const totals = chart?.totals;

  return (
    <div className={shared.section}>
      <Card title="Find student">
        <div className={shared.filters} style={{ marginBottom: 0 }}>
          <Select
            label="Class"
            value={filterClassId}
            onChange={(e) => {
              setFilterClassId(e.target.value);
              setSelectedStudentId("");
              setPickerOpen(true);
            }}
            options={[{ label: "All classes", value: "" }, ...(classSections ?? []).map((cs) => ({ label: classLabel(cs), value: String(cs.id) }))]}
          />
          <Input
            label="Search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPickerOpen(true);
            }}
            placeholder="Name, admission or roll no…"
          />
          <div className={`${shared.wide} ${styles.studentSelect}`}>
            <Select
              label="Student"
              value={selectedStudentId === "" ? "" : String(selectedStudentId)}
              onChange={(e) => setSelectedStudentId(e.target.value ? Number(e.target.value) : "")}
              options={[
                { label: filteredStudents.length ? "Select a student…" : "No matching students", value: "" },
                ...filteredStudents.map((s) => ({
                  label: `${s.name} · Adm ${s.admissionNo}${s.rollNo ? ` · Roll ${s.rollNo}` : ""} · ${classLabel(s.classSection)}`,
                  value: String(s.id),
                })),
              ]}
            />
          </div>

          {/* Phones: a tappable list instead of a native dropdown that spills off-screen */}
          <div className={`${shared.wide} ${styles.studentPicker}`}>
            <span className={styles.pickerLabel}>Student</span>
            {student && !pickerOpen ? (
              <div className={`${styles.pickRow} ${styles.pickRowSelected}`}>
                <span className={styles.pickMain}>
                  <strong>{student.name}</strong>
                  <small>
                    {student.rollNo ? `Roll ${student.rollNo} · ` : ""}
                    {classLabel(student.classSection)} · Adm {student.admissionNo}
                  </small>
                </span>
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                  Change
                </Button>
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className={shared.muted}>No matching students</p>
            ) : (
              <ul className={styles.pickList}>
                {filteredStudents.slice(0, PICK_LIMIT).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`${styles.pickRow} ${s.id === selectedStudentId ? styles.pickRowSelected : ""}`}
                      onClick={() => {
                        setSelectedStudentId(s.id);
                        setPickerOpen(false);
                      }}
                    >
                      <span className={styles.pickMain}>
                        <strong>{s.name}</strong>
                        <small>
                          {s.rollNo ? `Roll ${s.rollNo} · ` : ""}
                          {classLabel(s.classSection)} · Adm {s.admissionNo}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
                {filteredStudents.length > PICK_LIMIT && (
                  <li className={styles.pickMore}>
                    Showing {PICK_LIMIT} of {filteredStudents.length} — pick a class or search to narrow down
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {!student ? (
        <Card>
          <EmptyState title="No student selected" description="Choose a student to see their 12-month fee calendar and collect a payment." />
        </Card>
      ) : chartLoading && !chart ? (
        <Spinner />
      ) : !chart ? null : (
        <>
          <Card>
            <div className={styles.identity}>
              <div className={styles.avatar}>{student.name.charAt(0).toUpperCase()}</div>
              <div className={styles.identityMain}>
                <div className={styles.name}>
                  {student.name} <Badge tone="neutral">{classLabel(student.classSection)}</Badge>
                </div>
                <div className={shared.muted}>
                  Adm {student.admissionNo} · Roll {student.rollNo || "—"} · Father {student.fatherName || "—"} · {student.fatherContact || student.contactNumber || "No phone"}
                </div>
              </div>
              <div className={styles.kpis}>
                <div><span>Annual fee</span><strong>{inr(totals?.totalAnnualProjected)}</strong></div>
                <div><span>Paid so far</span><strong className={shared.success}>{inr(totals?.totalPaidSoFar)}</strong></div>
                <div><span>Outstanding</span><strong className={totals?.totalOutstanding ? shared.danger : undefined}>{inr(totals?.totalOutstanding)}</strong></div>
                <div><span>Advance credit</span><strong>{inr(totals?.totalAdvanceAvailable)}</strong></div>
              </div>
            </div>
          </Card>

          {!chart.session?.isCurrent && (
            <div className={`${shared.notice} ${styles.sessionNotice}`}>
              <span>
                Showing session <strong>{chart.session?.name}</strong> (class {chart.student?.classSection}). Payments recorded here settle {chart.session?.name} fees.
              </span>
              <Button size="sm" variant="outline" onClick={() => setViewSessionId(undefined)}>
                Back to current session
              </Button>
            </div>
          )}

          {otherDues.length > 0 && (
            <div className={`${shared.notice} ${shared.noticeDanger} ${styles.sessionNotice}`}>
              <span>
                {otherDues.map((d) => (
                  <span key={d.sessionId} className={styles.prevDue}>
                    <strong>{d.isPrevious ? "Previous session dues" : "Other session dues"} · {d.sessionName}: {inr(d.outstanding)}</strong>
                    <small> ({d.months.join(", ")})</small>
                  </span>
                ))}
              </span>
              {otherDues.map((d) => (
                <Button key={d.sessionId} size="sm" onClick={() => setViewSessionId(d.sessionId)}>
                  Collect {d.sessionName} dues
                </Button>
              ))}
            </div>
          )}

          {chart.feeStructureMissing && (
            <div className={`${shared.notice} ${shared.noticeDanger}`}>
              No fee structure is set up for {chart.student?.classSection ?? classLabel(student.classSection)} in session {chart.session?.name}. Months that
              haven't been billed yet show ₹0 and can't be collected — create the class fee structure first (Fee Structures tab).
            </div>
          )}

          <Card
            title={`Fee calendar · Session ${chart.session?.name ?? ""}`}
            subtitle={
              chart.classFeeHeads?.length
                ? (chart.classFeeHeads as Array<{ headName: string; amount: number }>).map((h) => `${h.headName} ${inr(h.amount)}`).join(" · ")
                : undefined
            }
            action={
              <div className={`${shared.rowActions} ${styles.quickPicks}`}>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.status === "OVERDUE")}>Overdue</Button>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.balanceDue > 0 && m.status !== "UNBILLED")}>All due</Button>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.month >= 4 && m.month <= 6)}>Q1</Button>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.month >= 7 && m.month <= 9)}>Q2</Button>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.month >= 10)}>Q3</Button>
                <Button size="sm" variant="ghost" onClick={() => selectWhere((m) => m.month <= 3)}>Q4</Button>
                {selectedKeys.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedKeys([])}>Clear</Button>}
              </div>
            }
          >
            <div className={styles.monthsGrid}>
              {months.map((m) => {
                const k = keyOf(m);
                const isSel = selectedKeys.includes(k);
                const isPaid = m.status === "PAID";
                const notEnrolled = m.status === "NOT_APPLICABLE";
                const open = expandedKeys.includes(k);
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={isLocked(m) ? -1 : 0}
                    title={notEnrolled ? m.statusReason : undefined}
                    aria-pressed={isSel}
                    className={`${styles.month} ${isSel ? styles.monthSelected : ""} ${isLocked(m) ? styles.monthPaid : ""}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      toggle(m);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(m);
                      }
                    }}
                  >
                    <div className={styles.monthTop}>
                      <span className={styles.monthName}>
                        {m.monthName.slice(0, 3)} {m.year}
                      </span>
                      <Badge tone={STATUS_META[m.status].tone}>{STATUS_META[m.status].label}</Badge>
                    </div>
                    <div className={styles.monthAmount}>{isPaid ? inr(m.paidAmount) : inr(m.balanceDue)}</div>
                    <div className={shared.muted}>
                      {notEnrolled ? "not on roll" : isPaid ? "paid" : `of ${inr(m.baseAmount)} fee`}
                      {m.lateFeeAmount > 0 && !isPaid && <span className={shared.danger}> · +{inr(m.lateFeeAmount)} late</span>}
                    </div>
                    {open && (
                      <ul className={styles.heads}>
                        {m.heads.map((h, i) => (
                          <li key={i}>
                            <span>{h.headName}</span>
                            <span>{inr(h.baseAmount)}</span>
                          </li>
                        ))}
                        {m.heads.length === 0 && <li className={shared.muted}>No fee heads</li>}
                      </ul>
                    )}
                    <button
                      type="button"
                      className={styles.detailsBtn}
                      onClick={() => setExpandedKeys((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
                    >
                      {open ? "Hide details" : "Details"}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className={shared.twoCol}>
            {canWaive ? (
              <Card title="Waivers & discounts" subtitle="Every waiver is recorded with its reason and who applied it">
                {selected.length === 0 ? (
                  <p className={shared.muted}>Select months to apply waivers.</p>
                ) : (
                  <div className={shared.formStack}>
                    {summary.late > 0 && (
                      <label className={styles.checkRow}>
                        <input type="checkbox" checked={waiveLateFines} onChange={(e) => setWaiveLateFines(e.target.checked)} />
                        <span>
                          Waive late fees of <strong>{inr(summary.late)}</strong> on the selected months
                        </span>
                      </label>
                    )}
                    <table className={shared.itemsTable}>
                      <thead>
                        <tr>
                          <th>Month · Fee head</th>
                          <th>Waive ₹</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.flatMap((m) =>
                          m.heads.map((h) => {
                            const wk = `${keyOf(m)}-${h.feeHeadId}`;
                            const w = headWaivers[wk] ?? { amount: "", reason: "" };
                            return (
                              <tr key={wk}>
                                <td>
                                  {m.monthName.slice(0, 3)} · {h.headName} <span className={shared.muted}>({inr(h.baseAmount)})</span>
                                </td>
                                <td>
                                  <input
                                    className={shared.cellInput}
                                    inputMode="decimal"
                                    value={w.amount}
                                    onChange={(e) => setHeadWaivers((p) => ({ ...p, [wk]: { ...w, amount: e.target.value } }))}
                                  />
                                </td>
                                <td>
                                  <input
                                    className={shared.cellInput}
                                    value={w.reason}
                                    placeholder="Reason"
                                    onChange={(e) => setHeadWaivers((p) => ({ ...p, [wk]: { ...w, reason: e.target.value } }))}
                                  />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    <div className={shared.filters} style={{ marginBottom: 0 }}>
                      <Select
                        label="Overall discount"
                        value={lumpType}
                        onChange={(e) => setLumpType(e.target.value as "FIXED_AMOUNT" | "PERCENTAGE")}
                        options={[
                          { label: "Fixed amount (₹)", value: "FIXED_AMOUNT" },
                          { label: "Percentage (%)", value: "PERCENTAGE" },
                        ]}
                      />
                      <Input label="Value" inputMode="decimal" value={lumpValue} onChange={(e) => setLumpValue(e.target.value)} />
                      <div className={shared.wide}>
                        <Input label="Reason" value={lumpReason} onChange={(e) => setLumpReason(e.target.value)} placeholder="e.g. Early quarterly payment" />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card title="Waivers & discounts">
                <p className={shared.muted}>
                  Waivers and discounts can be applied by an Admin or Super Admin. Late fees shown are calculated from the school's late-fee
                  rule.
                </p>
              </Card>
            )}

            <div ref={collectRef} className={styles.collectAnchor}>
            <Card title="Collect payment">
              <div className={shared.formStack}>
                <div className={shared.summaryBox}>
                  <div className={shared.summaryLine}>
                    <span>Months selected</span>
                    <strong>{selected.map((m) => m.monthName.slice(0, 3)).join(", ") || "None"}</strong>
                  </div>
                  <div className={shared.summaryLine}>
                    <span>Fees due</span>
                    <span>{inr(summary.due)}</span>
                  </div>
                  {summary.late > 0 && (
                    <div className={shared.summaryLine}>
                      <span>Late fees</span>
                      <span>+{inr(summary.late)}</span>
                    </div>
                  )}
                  {summary.lateWaived > 0 && (
                    <div className={`${shared.summaryLine} ${shared.discount}`}>
                      <span>Late fees waived</span>
                      <span>−{inr(summary.lateWaived)}</span>
                    </div>
                  )}
                  {summary.heads > 0 && (
                    <div className={`${shared.summaryLine} ${shared.discount}`}>
                      <span>Fee head waivers</span>
                      <span>−{inr(summary.heads)}</span>
                    </div>
                  )}
                  {summary.lump > 0 && (
                    <div className={`${shared.summaryLine} ${shared.discount}`}>
                      <span>Overall discount</span>
                      <span>−{inr(summary.lump)}</span>
                    </div>
                  )}
                  <div className={shared.summaryTotal}>
                    <span>To collect</span>
                    <span>{inr(summary.net)}</span>
                  </div>
                </div>
                <Input label="Amount received (₹)" inputMode="decimal" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} hint="Anything above the amount due is kept as advance credit." />
                <Select
                  label="Payment mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}
                  options={[
                    { label: "Cash", value: "CASH" },
                    { label: "UPI", value: "UPI_MANUAL" },
                    { label: "Bank transfer / Cheque", value: "BANK_TRANSFER" },
                  ]}
                />
                <Input
                  label={paymentMode === "CASH" ? "Reference (optional)" : "UTR / Cheque / UPI reference"}
                  required={paymentMode !== "CASH"}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                />
                <Input label="Notes (internal)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button onClick={submit} isLoading={isSubmitting} disabled={selected.length === 0 || !(Number(payAmount) > 0)} fullWidth>
                  Record payment of {inr(Number(payAmount) || 0)}
                </Button>
              </div>
            </Card>
            </div>
          </div>

          {/* Phones/tablets: the payment form is far below the month grid, so keep the total in reach */}
          {selected.length > 0 && <div className={styles.collectSpacer} aria-hidden="true" />}
          {selected.length > 0 && (
            <div className={styles.collectBar}>
              <div className={styles.collectBarText}>
                <span>
                  {selected.length} month{selected.length > 1 ? "s" : ""} · {selected.map((m) => m.monthName.slice(0, 3)).join(", ")}
                </span>
                <strong>{inr(summary.net)}</strong>
              </div>
              <Button onClick={() => collectRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Collect</Button>
            </div>
          )}
        </>
      )}

      {receipt && <ReceiptModal paymentId={receipt.paymentId} extraNote={receipt.note} onClose={() => setReceipt(null)} />}
    </div>
  );
};

export default MultiMonthPaymentDesk;
