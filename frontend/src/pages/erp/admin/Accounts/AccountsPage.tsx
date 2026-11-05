import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, Icon, Input, Modal, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useCreateAccountCategoryMutation,
  useGetAccountCategoriesQuery,
  useGetAccountEntriesQuery,
  useGetAccountSummaryQuery,
  useUpdateAccountCategoryMutation,
  useVoidAccountEntryMutation,
  type AccountEntry,
  type AccountType,
} from "../../../../store/api/accounts.api";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useAppSelector } from "../../../../store/store";
import { fmtDate, getErrorMessage, inr } from "../Fees/feeUtils";
import EntryFormModal, { MODE_OPTIONS } from "./EntryFormModal";
import { printAccountSummary } from "./accountsPrint";
import styles from "./Accounts.module.css";
import { useNavigate } from "react-router-dom";

type Tab = "entries" | "summary" | "categories";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const modeLabel = (m: string) => MODE_OPTIONS.find((o) => o.value === m)?.label ?? m;

// Accounts: the school's income & expense book (fee collection is counted automatically).
const AccountsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("entries");
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";

  return (
    <div>
      <PageHeader
        title="Expenses & Accounts"
        subtitle="School expenses and other income — fee collection is added automatically"
        actions={
          isSuperAdmin && (
            <Button variant="outline" icon={<Icon name="hardHat" size={16} />} onClick={() => navigate("/admin/construction")}>
              Construction expenses
            </Button>
          )
        }
      />
      <div className={styles.tabs} role="tablist">
        {(
          [
            ["entries", "Expenses & income"],
            ["summary", "Monthly summary"],
            ["categories", "Categories"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "entries" && <EntriesTab isSuperAdmin={isSuperAdmin} />}
      {tab === "summary" && <SummaryTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const EntriesTab = ({ isSuperAdmin }: { isSuperAdmin: boolean }) => {
  const now = new Date();
  const [filters, setFilters] = useState({
    from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDay(now),
    type: "",
    categoryId: "",
    q: "",
    includeVoid: false,
  });
  const set = (k: keyof typeof filters, v: string | boolean) => setFilters((f) => ({ ...f, [k]: v }));
  const { data, isFetching } = useGetAccountEntriesQuery(filters);
  const { data: categories = [] } = useGetAccountCategoriesQuery();
  const [adding, setAdding] = useState<AccountType | null>(null);
  const [editing, setEditing] = useState<AccountEntry | null>(null);
  const [voiding, setVoiding] = useState<AccountEntry | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidEntry, { isLoading: voidingNow }] = useVoidAccountEntryMutation();

  const confirmVoid = async () => {
    if (!voiding) return;
    try {
      await voidEntry({ id: voiding.id, reason: voidReason }).unwrap();
      toast.success(`${voiding.voucherNo} voided`);
      setVoiding(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't void the entry"));
    }
  };

  const columns: TableColumn<AccountEntry>[] = [
    {
      key: "entryDate",
      label: "Date",
      render: (e) => (
        <div>
          <div>{fmtDate(e.entryDate)}</div>
          <div className={styles.muted}>{e.voucherNo}</div>
        </div>
      ),
    },
    {
      key: "description",
      label: "Details",
      render: (e) => (
        <div className={e.isVoid ? styles.voided : undefined}>
          <div className={styles.strong}>{e.description}</div>
          <div className={styles.muted}>
            {e.category.name}
            {e.party ? ` · ${e.type === "EXPENSE" ? "to" : "from"} ${e.party}` : ""}
            {e.billNumber ? ` · bill ${e.billNumber}` : ""}
          </div>
          {e.isVoid && <div className={styles.danger}>Voided: {e.voidReason}</div>}
        </div>
      ),
    },
    {
      key: "paymentMode",
      label: "Mode",
      render: (e) => (
        <div>
          <div>{modeLabel(e.paymentMode)}</div>
          {e.referenceNo && <div className={styles.muted}>{e.referenceNo}</div>}
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (e) => (
        <strong className={`${e.type === "EXPENSE" ? styles.danger : styles.success} ${e.isVoid ? styles.voided : ""}`}>
          {e.type === "EXPENSE" ? "−" : "+"}
          {inr(Number(e.amount))}
        </strong>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (e) => (
        <div className={styles.rowActions}>
          {e.attachmentUrl && (
            <a href={e.attachmentUrl} target="_blank" rel="noreferrer" className={styles.link}>
              Bill
            </a>
          )}
          {!e.isVoid && (
            <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
              Edit
            </Button>
          )}
          {!e.isVoid && isSuperAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVoiding(e);
                setVoidReason("");
              }}
            >
              Void
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totals = data?.totals;
  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label={`Expenses (${totals?.expenseCount ?? 0})`} value={inr(totals?.expense ?? 0)} />
        <StatCard label={`Other income (${totals?.incomeCount ?? 0})`} value={inr(totals?.income ?? 0)} />
        <div className={styles.addButtons}>
          <Button icon={<Icon name="plus" size={16} />} onClick={() => setAdding("EXPENSE")}>
            Add expense
          </Button>
          <Button variant="outline" icon={<Icon name="plus" size={16} />} onClick={() => setAdding("INCOME")}>
            Add income
          </Button>
        </div>
      </div>

      <Card>
        <div className={styles.filters}>
          <Input label="From" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} />
          <Input label="To" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} />
          <Select
            label="Type"
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, categoryId: "" }))}
            options={[
              { label: "Expenses & income", value: "" },
              { label: "Expenses", value: "EXPENSE" },
              { label: "Income", value: "INCOME" },
            ]}
          />
          <Select
            label="Category"
            value={filters.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            options={[
              { label: "All categories", value: "" },
              ...categories.filter((c) => !filters.type || c.type === filters.type).map((c) => ({ label: `${c.name}${filters.type ? "" : c.type === "INCOME" ? " (income)" : ""}`, value: String(c.id) })),
            ]}
          />
          <div className={styles.wide}>
            <Input label="Search" value={filters.q} placeholder="Voucher no, description, party, bill no…" onChange={(e) => set("q", e.target.value)} />
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={filters.includeVoid} onChange={(e) => set("includeVoid", e.target.checked)} /> Show voided
          </label>
        </div>
        {isFetching && !data ? (
          <Spinner />
        ) : (
          <Table columns={columns} data={data?.entries ?? []} keyField="id" mobilePrimary="description" stackBelow={900} emptyMessage="No entries in this period." />
        )}
      </Card>

      {(adding || editing) && <EntryFormModal type={editing?.type ?? adding!} entry={editing} onClose={() => (setAdding(null), setEditing(null))} />}

      {voiding && (
        <Modal title={`Void ${voiding.voucherNo}?`} onClose={() => setVoiding(null)}>
          <p className={styles.muted}>
            {voiding.description} · {inr(Number(voiding.amount))}. The voucher stays on record marked void and is left out of all totals.
          </p>
          <Input label="Reason" required value={voidReason} placeholder="e.g. Entered twice" onChange={(e) => setVoidReason(e.target.value)} />
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={voidingNow} disabled={voidReason.trim().length < 3} onClick={confirmVoid}>
              Void entry
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SummaryTab = () => {
  const [range, setRange] = useState({ from: "", to: "" });
  const { data, isFetching } = useGetAccountSummaryQuery(range);
  const { data: site } = useGetPublicWebsiteDataQuery();
  const t = data?.totals;

  const columns: TableColumn<NonNullable<typeof data>["months"][number]>[] = useMemo(
    () => [
      { key: "month", label: "Month", render: (r) => <strong>{monthLabel(r.month)}</strong> },
      { key: "feeIncome", label: "Fee collection", render: (r) => inr(r.feeIncome) },
      { key: "otherIncome", label: "Other income", render: (r) => inr(r.otherIncome) },
      { key: "expense", label: "Expenses", render: (r) => inr(r.expense) },
      ...(data?.showsConstruction ? [{ key: "construction", label: "Construction", render: (r: any) => inr(r.construction) }] : []),
      { key: "net", label: "Surplus / deficit", render: (r) => <strong className={r.net < 0 ? styles.danger : styles.success}>{inr(r.net)}</strong> },
    ],
    [data?.showsConstruction]
  );

  return (
    <div className={styles.section}>
      <Card
        title="Income vs expenses"
        subtitle={data ? `${fmtDate(data.from)} – ${fmtDate(data.to)}${range.from ? "" : " (current session)"}` : undefined}
        action={
          <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} disabled={!data} onClick={() => data && printAccountSummary(data, site?.settings)}>
            Print
          </Button>
        }
      >
        <div className={styles.filters}>
          <Input label="From" type="date" value={range.from || data?.from || ""} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <Input label="To" type="date" value={range.to || data?.to || ""} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        {isFetching && !data ? (
          <Spinner />
        ) : t ? (
          <>
            <div className={styles.statsGrid}>
              <StatCard label="Fee collection" value={inr(t.feeIncome)} />
              <StatCard label="Other income" value={inr(t.otherIncome)} />
              <StatCard label={data?.showsConstruction ? "Expenses + construction" : "Expenses"} value={inr(t.spent)} />
              <StatCard label={t.net < 0 ? "Deficit" : "Surplus"} value={inr(Math.abs(t.net))} />
            </div>
            <Table columns={columns} data={data!.months} keyField="month" showPagination={false} mobilePrimary="month" stackBelow={760} />
          </>
        ) : null}
      </Card>

      {data && data.categories.length > 0 && (
        <Card title="By category" subtitle="Expenses and other income in this period">
          <ul className={styles.list}>
            {data.categories.map((c) => (
              <li key={`${c.type}:${c.name}`} className={styles.listItem}>
                <span className={styles.listMain}>{c.name}</span>
                <Badge tone={c.type === "INCOME" ? "success" : "neutral"}>{c.type === "INCOME" ? "Income" : "Expense"}</Badge>
                <strong>{inr(c.amount)}</strong>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const CategoriesTab = () => {
  const { data: categories = [], isLoading } = useGetAccountCategoriesQuery();
  const [createCategory, { isLoading: creating }] = useCreateAccountCategoryMutation();
  const [updateCategory] = useUpdateAccountCategoryMutation();
  const [form, setForm] = useState({ name: "", type: "EXPENSE" as AccountType });
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  const add = async () => {
    if (!form.name.trim()) return toast.error("Enter a name");
    try {
      await createCategory({ name: form.name.trim(), type: form.type }).unwrap();
      toast.success("Category added");
      setForm({ ...form, name: "" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't add the category"));
    }
  };
  const save = async (id: number, body: { name?: string; isActive?: boolean }) => {
    try {
      await updateCategory({ id, ...body }).unwrap();
      setRenaming(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't save the category"));
    }
  };

  if (isLoading) return <Spinner />;
  return (
    <div className={styles.section}>
      <Card title="Add a category">
        <div className={styles.filters}>
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
            options={[
              { label: "Expense", value: "EXPENSE" },
              { label: "Income", value: "INCOME" },
            ]}
          />
          <div className={styles.wide}>
            <Input label="Name" value={form.name} maxLength={60} placeholder="e.g. Generator fuel" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className={styles.alignEnd}>
            <Button onClick={add} isLoading={creating}>
              Add
            </Button>
          </div>
        </div>
      </Card>
      <div className={styles.twoCol}>
        {(["EXPENSE", "INCOME"] as const).map((type) => (
          <Card key={type} title={type === "EXPENSE" ? "Expense categories" : "Income categories"} subtitle="Hidden categories keep their old entries">
            <ul className={styles.list}>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    {renaming?.id === c.id ? (
                      <>
                        <span className={styles.listMain}>
                          <Input aria-label="Name" value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                        </span>
                        <Button size="sm" onClick={() => save(c.id, { name: renaming.name })}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className={`${styles.listMain} ${c.isActive ? "" : styles.voided}`}>
                          {c.name} <span className={styles.muted}>· {c._count?.entries ?? 0} entries</span>
                        </span>
                        {!c.isActive && <Badge tone="neutral">Hidden</Badge>}
                        <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: c.id, name: c.name })}>
                          Rename
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => save(c.id, { isActive: !c.isActive })}>
                          {c.isActive ? "Hide" : "Show"}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AccountsPage;
