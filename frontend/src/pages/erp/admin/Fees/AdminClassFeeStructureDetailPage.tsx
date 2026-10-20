import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import {
  useGetFeeHeadsQuery,
  useGetFeeStructureByIdQuery,
  useGetStudentMonthsChartQuery,
  useUpdateFeeStructureMutation,
} from "../../../../store/api/fees.api";
import FeeItemsEditor, { ACADEMIC_MONTHS, annualTotal, itemFromApi, itemsToApi, validateItems, type FeeItemDraft } from "./FeeItemsEditor";
import { MONTH_NAMES, classLabel, getErrorMessage, inr } from "./feeUtils";
import styles from "./Fees.module.css";

// One class's fee plan, on real data: edit the structure's items (saved through the API —
// already-billed fee heads can't be removed, only re-priced), see the month-by-month
// schedule, and check what a real student of the class owes per month.
const AdminClassFeeStructureDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const structureId = Number(id);

  const { data: structure, isLoading, isError } = useGetFeeStructureByIdQuery(structureId, { skip: !structureId });
  const { data: feeHeads = [] } = useGetFeeHeadsQuery();
  const [updateStructure, { isLoading: saving }] = useUpdateFeeStructureMutation();

  const [items, setItems] = useState<FeeItemDraft[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"plan" | "student">("plan");

  const resetFromServer = () => {
    if (!structure) return;
    setItems((structure.items ?? []).map(itemFromApi));
    setName(structure.name ?? "");
    setDescription(structure.description ?? "");
  };
  useEffect(resetFromServer, [structure]);

  // Month-by-month schedule from the (draft) items.
  const schedule = useMemo(
    () =>
      ACADEMIC_MONTHS.map((m) => {
        const lines = items
          .filter((it) => it.applicableMonths.includes(m) && Number(it.amount) > 0)
          .map((it) => ({ head: feeHeads.find((h) => h.id === Number(it.feeHeadId))?.name ?? "Fee", amount: Number(it.amount), dueDay: Number(it.dueDateDay) }));
        return { month: m, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
      }),
    [items, feeHeads]
  );

  const save = async () => {
    const err = validateItems(items);
    if (err) return toast.error(err);
    try {
      await updateStructure({
        id: structureId,
        body: { name: name.trim() || structure?.name, description: description.trim() || undefined, items: itemsToApi(items) },
      }).unwrap();
      toast.success("Fee plan saved");
      setEditing(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the fee plan"));
    }
  };

  const title = structure?.classSection ? `${classLabel(structure.classSection)} — Fee plan` : "Fee plan";

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Fee plan" />
        <Spinner />
      </div>
    );
  }
  if (isError || !structure) {
    return (
      <div className={styles.page}>
        <PageHeader title="Fee plan" />
        <EmptyState
          title="Fee structure not found"
          action={<Button variant="outline" onClick={() => navigate("/admin/fees?tab=structures")}>Back to fee structures</Button>}
        />
      </div>
    );
  }

  const monthly = schedule.map((s) => s.total);

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        subtitle={`${structure.name}${structure.session ? ` · Session ${structure.session.name}` : ""}`}
        actions={
          <div className={styles.rowActions}>
            <Button variant="outline" icon={<Icon name="arrowLeft" size={16} />} onClick={() => navigate("/admin/fees?tab=structures")}>
              Fee structures
            </Button>
            {!editing ? (
              <Button icon={<Icon name="edit" size={16} />} onClick={() => setEditing(true)}>
                Edit plan
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetFromServer();
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={save} isLoading={saving}>
                  Save plan
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className={styles.statsGrid}>
        <StatCard label="Fee items" value={items.length} icon={<Icon name="layers" />} />
        <StatCard label="Annual total (per student)" value={inr(annualTotal(items))} icon={<Icon name="building" />} />
        <StatCard label="Lowest month" value={inr(Math.min(...monthly))} icon={<Icon name="calendar" />} />
        <StatCard label="Highest month" value={inr(Math.max(...monthly))} icon={<Icon name="calendar" />} />
      </div>

      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === "plan"} className={`${styles.tab} ${tab === "plan" ? styles.tabActive : ""}`} onClick={() => setTab("plan")}>
          Plan & schedule
        </button>
        <button type="button" role="tab" aria-selected={tab === "student"} className={`${styles.tab} ${tab === "student" ? styles.tabActive : ""}`} onClick={() => setTab("student")}>
          Check a student
        </button>
      </div>

      {tab === "plan" ? (
        <>
          <Card title="Fee items" subtitle={editing ? "Changes apply to bills generated after saving; existing bills stay as they are" : undefined}>
            {editing && (
              <div className={styles.filters}>
                <Input label="Plan name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className={styles.wide}>
                  <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
            )}
            {items.length === 0 && !editing ? (
              <EmptyState title="No fee items yet" description="Edit the plan to add fees for this class." />
            ) : (
              <FeeItemsEditor items={items} onChange={setItems} feeHeads={feeHeads} disabled={!editing} />
            )}
          </Card>

          <Card title="Month-by-month schedule" subtitle="What one student of this class is billed each month (before transport, concessions and late fees)">
            <div className={styles.statsGrid}>
              {schedule.map((s) => (
                <div key={s.month} className={styles.summaryBox}>
                  <div className={styles.summaryLine}>
                    <strong>{MONTH_NAMES[s.month - 1]}</strong>
                    <strong>{inr(s.total)}</strong>
                  </div>
                  {s.lines.length === 0 ? (
                    <span className={styles.muted}>Nothing billed</span>
                  ) : (
                    s.lines.map((l, i) => (
                      <div key={i} className={`${styles.summaryLine} ${styles.muted}`}>
                        <span>
                          {l.head} · due {l.dueDay}
                        </span>
                        <span>{inr(l.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <StudentCheck classSectionId={structure.classSectionId ?? undefined} />
      )}
    </div>
  );
};

// Real per-month dues for one student of the class (same data as the payment desk).
const StudentCheck = ({ classSectionId }: { classSectionId?: number }) => {
  const { data: students = [] } = useGetStudentsQuery(classSectionId ? { classSectionId } : undefined);
  const [studentId, setStudentId] = useState("");
  const { data: chart, isFetching } = useGetStudentMonthsChartQuery({ studentId: Number(studentId) }, { skip: !studentId });

  type ChartMonth = {
    periodCode: string;
    monthName: string;
    year: number;
    status: string;
    baseAmount: number;
    lateFeeAmount: number;
    paidAmount: number;
    balanceDue: number;
    heads: Array<{ headName: string; baseAmount: number }>;
  };
  const columns: TableColumn<ChartMonth>[] = [
    { key: "month", label: "Month", render: (m) => <strong>{m.monthName} {m.year}</strong> },
    { key: "heads", label: "Fees", render: (m) => m.heads.map((h) => `${h.headName} ${inr(h.baseAmount)}`).join(" · ") || "—" },
    { key: "baseAmount", label: "Billed", render: (m) => inr(m.baseAmount) },
    { key: "lateFeeAmount", label: "Late fee", render: (m) => (m.lateFeeAmount ? inr(m.lateFeeAmount) : "—") },
    { key: "paidAmount", label: "Paid", render: (m) => inr(m.paidAmount) },
    { key: "balanceDue", label: "Balance", render: (m) => (m.status === "PAID" ? inr(0) : inr(m.balanceDue)) },
    {
      key: "status",
      label: "Status",
      render: (m) => (
        <Badge tone={m.status === "PAID" ? "success" : m.status === "OVERDUE" ? "danger" : m.status === "PARTIALLY_PAID" ? "warning" : m.status === "DUE" ? "info" : "neutral"}>
          {m.status === "UNBILLED" ? "Not billed yet" : m.status.replace("_", " ").toLowerCase()}
        </Badge>
      ),
    },
  ];

  return (
    <Card title="Check a student" subtitle="Includes transport, discounts, payments and late fees already applied">
      <div className={styles.filters}>
        <div className={styles.wide}>
          <Select
            label="Student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            options={[
              { label: students.length ? "Select a student…" : "No students in this class", value: "" },
              ...students.map((s) => ({ label: `${s.name} · Roll ${s.rollNo} · Adm ${s.admissionNo}`, value: String(s.id) })),
            ]}
          />
        </div>
      </div>
      {!studentId ? (
        <p className={styles.muted}>Pick a student to see their real month-by-month fees.</p>
      ) : isFetching || !chart ? (
        <Spinner />
      ) : (
        <>
          <div className={styles.statsGrid} style={{ marginBottom: "1rem" }}>
            <StatCard label="Annual fee" value={inr(chart.totals.totalAnnualProjected)} />
            <StatCard label="Paid so far" value={inr(chart.totals.totalPaidSoFar)} />
            <StatCard label="Outstanding" value={inr(chart.totals.totalOutstanding)} />
          </div>
          <Table columns={columns} data={chart.months} keyField="periodCode" showPagination={false} stackBelow={900} />
        </>
      )}
    </Card>
  );
};

export default AdminClassFeeStructureDetailPage;
