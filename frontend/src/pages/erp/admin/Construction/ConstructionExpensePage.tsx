import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  type TableColumn,
} from "../../../../components/ui";
import BreakdownList from "../../../../components/shared/BreakdownList/BreakdownList";
import {
  useGetConstructionExpensesQuery,
  useGetConstructionProjectsQuery,
  useGetConstructionSummaryQuery,
  type ConstructionExpense,
  type ConstructionExpenseFilters,
} from "../../../../store/api/construction.api";
import {
  CATEGORY_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PROJECT_STATUS_LABEL,
  formatDay,
  formatINR,
  toOptions,
} from "./constructionFormat";
import ExpenseFormModal from "./ExpenseFormModal";
import ExpenseDetailModal from "./ExpenseDetailModal";
import VoidExpenseModal from "./VoidExpenseModal";
import ProjectsModal from "./ProjectsModal";
import styles from "./ConstructionExpensePage.module.css";

const EMPTY_FILTERS: ConstructionExpenseFilters = { sortBy: "expenseDate", sortOrder: "desc", includeVoid: false };

const ConstructionExpensePage = () => {
  const [filters, setFilters] = useState<ConstructionExpenseFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [formExpense, setFormExpense] = useState<ConstructionExpense | "new" | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [voiding, setVoiding] = useState<ConstructionExpense | null>(null);
  const [showProjects, setShowProjects] = useState(false);

  const { data: summary, isError: isSummaryError } = useGetConstructionSummaryQuery();
  const { data: projects = [], isLoading: isLoadingProjects } = useGetConstructionProjectsQuery();
  const { data, isLoading, isFetching, isError, refetch } = useGetConstructionExpensesQuery(filters);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() || undefined })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const setFilter = (key: keyof ConstructionExpenseFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const resetFilters = () => {
    setSearchInput("");
    setFilters(EMPTY_FILTERS);
  };

  const isFiltered = Object.entries(filters).some(
    ([k, v]) => !["sortBy", "sortOrder", "includeVoid"].includes(k) && v !== undefined && v !== ""
  );

  const categoryItems = useMemo(
    () =>
      (summary?.byCategory ?? []).map((c) => ({
        label: CATEGORY_LABEL[c.category],
        value: Number(c.amount),
        display: formatINR(c.amount),
        hint: `${c.count} ${c.count === 1 ? "entry" : "entries"}`,
      })),
    [summary]
  );

  const openNewExpense = () => {
    if (projects.length === 0) {
      setShowProjects(true);
      return;
    }
    setFormExpense("new");
  };

  const columns: TableColumn<ConstructionExpense>[] = [
    { key: "expenseDate", label: "Date", render: (e) => formatDay(e.expenseDate) },
    {
      key: "title",
      label: "Expense",
      render: (e) => (
        <div className={e.isVoid ? styles.voidRow : undefined}>
          <div className={styles.primaryText}>{e.title}</div>
          <div className={styles.mutedText}>
            {[e.vendorName, e.invoiceNumber && `Inv ${e.invoiceNumber}`].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      ),
    },
    { key: "project", label: "Project", render: (e) => e.project.name },
    { key: "category", label: "Category", render: (e) => <Badge tone="neutral">{CATEGORY_LABEL[e.category]}</Badge> },
    {
      key: "amount",
      label: "Amount",
      render: (e) => <span className={e.isVoid ? styles.voidAmount : styles.amount}>{formatINR(e.amount)}</span>,
    },
    {
      key: "paymentStatus",
      label: "Payment",
      render: (e) =>
        e.isVoid ? (
          <Badge tone="danger">Void</Badge>
        ) : (
          <div>
            <Badge tone={PAYMENT_STATUS_TONE[e.paymentStatus]}>{PAYMENT_STATUS_LABEL[e.paymentStatus]}</Badge>
            {e.paymentMode && <div className={styles.mutedText}>{PAYMENT_MODE_LABEL[e.paymentMode]}</div>}
          </div>
        ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (e) => (
        <div className={styles.rowActions}>
          <Button type="button" size="sm" variant="outline" onClick={() => setViewingId(e.id)}>
            View
          </Button>
          {!e.isVoid && (
            <>
              <Button type="button" size="sm" variant="primary" onClick={() => setFormExpense(e)}>
                Edit
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setVoiding(e)}>
                Void
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title="Building Construction Expenses"
        subtitle="Track spending on school building and construction projects"
        actions={
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={() => setShowProjects(true)}>
              Manage Projects
            </Button>
            <Button type="button" icon={<Icon name="plus" />} onClick={openNewExpense} disabled={isLoadingProjects}>
              Record Expense
            </Button>
          </div>
        }
      />

      <div className={styles.statsGrid}>
        <StatCard label="Total Construction Spend" value={summary ? formatINR(summary.totalAmount) : "—"} icon={<Icon name="hardHat" />} />
        <StatCard
          label="Spent This Month"
          value={summary ? formatINR(summary.currentMonthAmount) : "—"}
          icon={<Icon name="calendar" />}
        />
        <StatCard label="Expense Entries" value={summary ? summary.entryCount : "—"} icon={<Icon name="fileText" />} />
        <StatCard label="Projects" value={projects.length} icon={<Icon name="building" />} />
      </div>

      {isSummaryError && <p className={styles.mutedText}>Summary figures couldn't be loaded.</p>}

      <div className={styles.breakdownGrid}>
        <Card title="Spend by Category" subtitle="All recorded (non-void) expenses">
          <BreakdownList items={categoryItems} emptyMessage="No expenses recorded yet" />
        </Card>
        <Card title="Project Budgets" subtitle="Spent against budget, where a budget is set">
          {summary && summary.projects.length > 0 ? (
            <ul className={styles.projectList}>
              {summary.projects.map((p) => {
                const spent = Number(p.totalSpent);
                const budget = p.budget ? Number(p.budget) : null;
                const pct = budget ? Math.min(100, (spent / budget) * 100) : null;
                return (
                  <li key={p.id} className={styles.projectItem}>
                    <div className={styles.projectRow}>
                      <span className={styles.primaryText}>{p.name}</span>
                      <span className={styles.mutedText}>{PROJECT_STATUS_LABEL[p.status]}</span>
                    </div>
                    <div className={styles.projectRow}>
                      <span>
                        {formatINR(p.totalSpent)}
                        {budget !== null && <span className={styles.mutedText}> of {formatINR(budget)}</span>}
                      </span>
                      {budget !== null && (
                        <span className={spent > budget ? styles.overBudget : styles.mutedText}>
                          {Math.round((spent / budget) * 100)}%
                        </span>
                      )}
                    </div>
                    {pct !== null && (
                      <div className={styles.track}>
                        <div
                          className={spent > (budget ?? 0) ? styles.barOver : styles.bar}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.mutedText}>No projects yet. Add one from “Manage Projects”.</p>
          )}
        </Card>
      </div>

      <Card
        title="Expense Records"
        subtitle={
          data
            ? `${data.totals.count} ${data.totals.count === 1 ? "entry" : "entries"} · ${formatINR(data.totals.amount)}${
                isFiltered ? " (filtered)" : ""
              }${filters.includeVoid ? " · voided entries shown but not counted" : ""}`
            : undefined
        }
        action={
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            Reset filters
          </Button>
        }
      >
        <div className={styles.filtersGrid}>
          <div className={styles.searchField}>
            <Input
              label="Search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Title, vendor, invoice no or remarks…"
            />
          </div>
          <Select
            label="Project"
            options={[{ label: "All Projects", value: "" }, ...projects.map((p) => ({ label: p.name, value: String(p.id) }))]}
            value={filters.projectId ?? ""}
            onChange={(e) => setFilter("projectId", e.target.value)}
          />
          <Select
            label="Category"
            options={[{ label: "All Categories", value: "" }, ...toOptions(CATEGORY_LABEL)]}
            value={filters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value)}
          />
          <Select
            label="Payment Status"
            options={[{ label: "All", value: "" }, ...toOptions(PAYMENT_STATUS_LABEL)]}
            value={filters.paymentStatus ?? ""}
            onChange={(e) => setFilter("paymentStatus", e.target.value)}
          />
          <Input label="From" type="date" value={filters.from ?? ""} max={filters.to} onChange={(e) => setFilter("from", e.target.value)} />
          <Input label="To" type="date" value={filters.to ?? ""} min={filters.from} onChange={(e) => setFilter("to", e.target.value)} />
          <Select
            label="Sort By"
            options={[
              { label: "Date (Newest)", value: "expenseDate:desc" },
              { label: "Date (Oldest)", value: "expenseDate:asc" },
              { label: "Amount (High–Low)", value: "amount:desc" },
              { label: "Amount (Low–High)", value: "amount:asc" },
              { label: "Recently Recorded", value: "createdAt:desc" },
              { label: "Title (A–Z)", value: "title:asc" },
            ]}
            value={`${filters.sortBy}:${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split(":") as [
                ConstructionExpenseFilters["sortBy"],
                ConstructionExpenseFilters["sortOrder"],
              ];
              setFilters((f) => ({ ...f, sortBy, sortOrder }));
            }}
          />
          <Select
            label="Voided Entries"
            options={[
              { label: "Hide voided", value: "" },
              { label: "Show voided", value: "true" },
            ]}
            value={filters.includeVoid ? "true" : ""}
            onChange={(e) => setFilters((f) => ({ ...f, includeVoid: e.target.value === "true" }))}
          />
        </div>

        <div className={styles.tableArea}>
          {isError ? (
            <EmptyState
              title="Couldn't load expenses"
              description="Check your connection and try again."
              action={
                <Button type="button" variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : isLoading || isFetching ? (
            <Spinner />
          ) : !isFiltered && data?.rows.length === 0 ? (
            <EmptyState
              title="No construction expenses recorded yet"
              description={projects.length === 0 ? "Start by adding a construction project, then record its expenses." : "Record the first expense for a project."}
              action={
                <Button type="button" onClick={openNewExpense}>
                  {projects.length === 0 ? "Add Project" : "Record Expense"}
                </Button>
              }
            />
          ) : (
            <Table
              columns={columns}
              data={data?.rows ?? []}
              keyField="id"
              emptyMessage="No expenses match the selected filters."
            />
          )}
        </div>
      </Card>

      {formExpense && (
        <ExpenseFormModal
          projects={projects}
          expense={formExpense === "new" ? null : formExpense}
          onClose={() => setFormExpense(null)}
        />
      )}
      {viewingId !== null && <ExpenseDetailModal id={viewingId} onClose={() => setViewingId(null)} />}
      {voiding && <VoidExpenseModal expense={voiding} onClose={() => setVoiding(null)} />}
      {showProjects && <ProjectsModal projects={projects} onClose={() => setShowProjects(false)} />}
    </div>
  );
};

export default ConstructionExpensePage;
