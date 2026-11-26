import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  ISSUE_STATUS,
  useGetInventoryCategoriesQuery,
  useGetInventoryDocsQuery,
  useGetInventoryItemsQuery,
  useGetPendingReturnsQuery,
  useSaveInventoryCategoryMutation,
  type InventoryCategory,
  type InventoryDoc,
  type InventoryItem,
  type PendingReturn,
} from "../../../../store/api/inventory.api";
import { useDownloadExportMutation } from "../../../../store/api/exports.api";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useCan } from "../../../../store/permissions";
import { fmtDate, getErrorMessage, inr } from "../Fees/feeUtils";
import { AdjustModal, IssueModal, ItemModal, ReceiptModal, qty } from "./InventoryForms";
import { DocModal, LedgerModal } from "./InventoryDetails";
import { printStockRegister } from "./inventoryPrint";
import styles from "./Inventory.module.css";

type Tab = "items" | "receipts" | "issues" | "pending" | "adjustments" | "categories";
type Form = { kind: "receipt" | "issue" | "adjust"; itemId?: number } | null;
const TABS: Array<[Tab, string]> = [
  ["items", "Items & stock"],
  ["issues", "Issued items"],
  ["pending", "To be returned"],
  ["receipts", "Stock received"],
  ["adjustments", "Stock checks & damage"],
  ["categories", "Categories"],
];
const docItems = (d: InventoryDoc) => d.lines.map((l) => `${l.item} × ${qty(l.quantity)}`).join(", ");

// Inventory: standard stock keeping with numbered documents.
const InventoryPage = () => {
  const can = useCan();
  const canEdit = can("inventory.edit");
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "items") as Tab;
  const setTab = (t: Tab) => setParams(t === "items" ? {} : { tab: t }, { replace: true });
  const { data: items = [] } = useGetInventoryItemsQuery();
  const { data: pending = [] } = useGetPendingReturnsQuery();
  const { data: site } = useGetPublicWebsiteDataQuery();
  const [download, { isLoading: downloading }] = useDownloadExportMutation();
  const [form, setForm] = useState<Form>(null);
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const [openDoc, setOpenDoc] = useState<number | null>(null);
  const [ledger, setLedger] = useState<number | null>(null);
  const overdue = pending.filter((p) => p.overdue).length;

  const saved = (d: InventoryDoc) => {
    setForm(null);
    setOpenDoc(d.id); // show the saved document, ready to print
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="The school's stock — what's in the store, what's given out, and every entry"
        actions={
          <div className={styles.addButtons}>
            <Button variant="outline" icon={<Icon name="printer" size={16} />} onClick={() => printStockRegister(items, pending, site?.settings)}>
              Stock register
            </Button>
            <Button
              variant="outline"
              icon={<Icon name="download" size={16} />}
              isLoading={downloading}
              onClick={async () => {
                try {
                  await download({ path: "inventory" }).unwrap();
                } catch (e) {
                  toast.error(getErrorMessage(e, "Couldn't download"));
                }
              }}
            >
              Excel
            </Button>
          </div>
        }
      />

      {canEdit && (
        <div className={styles.flow} aria-label="How inventory works">
          <FlowStep n={1} title="Add items" text="The things the school keeps" action="New item" onClick={() => setEditing("new")} />
          <FlowStep n={2} title="Receive stock" text="Bought or donated — stock goes up" action="Receive stock" onClick={() => setForm({ kind: "receipt" })} disabled={!items.length} />
          <FlowStep n={3} title="Issue items" text="Give to staff or a room — stock goes down" action="Issue items" onClick={() => setForm({ kind: "issue" })} disabled={!items.length} />
          <FlowStep
            n={4}
            title="Receive back"
            text={pending.length ? `${pending.length} item${pending.length > 1 ? "s" : ""} out${overdue ? `, ${overdue} overdue` : ""}` : "Nothing out right now"}
            action="See what's out"
            onClick={() => setTab("pending")}
            warn={overdue > 0}
          />
        </div>
      )}

      <div className={styles.tabs} role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} onClick={() => setTab(key)}>
            {label}
            {key === "pending" && pending.length > 0 && <span className={`${styles.tabCount} ${overdue ? styles.tabCountWarn : ""}`}>{pending.length}</span>}
          </button>
        ))}
      </div>

      {tab === "items" && <ItemsTab canEdit={canEdit} onEdit={setEditing} onLedger={setLedger} onForm={setForm} pendingCount={pending.length} />}
      {tab === "issues" && <DocsTab kind="ISSUE" canEdit={canEdit} onOpen={setOpenDoc} onNew={() => setForm({ kind: "issue" })} />}
      {tab === "pending" && <PendingTab rows={pending} onOpen={setOpenDoc} />}
      {tab === "receipts" && <DocsTab kind="RECEIPT" canEdit={canEdit} onOpen={setOpenDoc} onNew={() => setForm({ kind: "receipt" })} />}
      {tab === "adjustments" && <DocsTab kind="ADJUST" canEdit={canEdit} onOpen={setOpenDoc} onNew={() => setForm({ kind: "adjust" })} />}
      {tab === "categories" && <CategoriesTab canEdit={canEdit} />}

      {form?.kind === "receipt" && <ReceiptModal items={items} startItemId={form.itemId} onClose={() => setForm(null)} onSaved={saved} />}
      {form?.kind === "issue" && <IssueModal items={items} startItemId={form.itemId} onClose={() => setForm(null)} onSaved={saved} />}
      {form?.kind === "adjust" && <AdjustModal items={items} startItemId={form.itemId} onClose={() => setForm(null)} onSaved={saved} />}
      {editing && <ItemModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {ledger && <LedgerModal itemId={ledger} onClose={() => setLedger(null)} onOpenDoc={(id) => (setLedger(null), setOpenDoc(id))} />}
      {openDoc && <DocModal id={openDoc} canEdit={canEdit} onClose={() => setOpenDoc(null)} onOpenDoc={setOpenDoc} />}
    </div>
  );
};

const FlowStep = ({ n, title, text, action, onClick, disabled, warn }: { n: number; title: string; text: string; action: string; onClick: () => void; disabled?: boolean; warn?: boolean }) => (
  <div className={`${styles.flowStep} ${warn ? styles.flowWarn : ""}`}>
    <span className={styles.flowNum}>{n}</span>
    <div className={styles.flowBody}>
      <strong>{title}</strong>
      <span className={styles.muted}>{text}</span>
    </div>
    <Button size="sm" variant={n === 4 ? "outline" : "primary"} disabled={disabled} onClick={onClick}>
      {action}
    </Button>
  </div>
);

// ---------------------------------------------------------------------------

const ItemsTab = ({
  canEdit,
  onEdit,
  onLedger,
  onForm,
  pendingCount,
}: {
  canEdit: boolean;
  onEdit: (i: InventoryItem) => void;
  onLedger: (id: number) => void;
  onForm: (f: Form) => void;
  pendingCount: number;
}) => {
  const [filters, setFilters] = useState({ q: "", categoryId: "", low: false, includeInactive: false });
  const set = (k: keyof typeof filters, v: string | boolean) => setFilters((f) => ({ ...f, [k]: v }));
  const { data: items = [], isLoading, isFetching } = useGetInventoryItemsQuery(filters);
  const { data: all = [] } = useGetInventoryItemsQuery();
  const { data: categories = [] } = useGetInventoryCategoriesQuery();
  const { data: site } = useGetPublicWebsiteDataQuery();
  const { data: pending = [] } = useGetPendingReturnsQuery();
  const stats = useMemo(() => ({ items: all.length, reorder: all.filter((i) => i.needsReorder).length, value: all.reduce((s, i) => s + (i.stockValue ?? 0), 0) }), [all]);

  const columns: TableColumn<InventoryItem>[] = [
    {
      key: "name",
      label: "Item",
      render: (i) => (
        <button type="button" className={styles.rowButton} onClick={() => onLedger(i.id)} title="Open stock ledger">
          <div className={styles.strong}>
            {i.name} {!i.isActive && <Badge tone="neutral">Not used</Badge>}
          </div>
          <div className={styles.muted}>
            {i.category}
            {i.location ? ` · ${i.location}` : ""}
            {i.returnable ? " · equipment (returned)" : " · consumable"}
          </div>
        </button>
      ),
    },
    {
      key: "stock",
      label: "In store",
      render: (i) => (
        <div>
          <span className={i.needsReorder ? styles.lowText : styles.strong}>{qty(i.stock, i.unit)}</span>
          {i.needsReorder && (
            <div>
              <Badge tone="danger">Reorder</Badge>
            </div>
          )}
        </div>
      ),
    },
    { key: "issuedOut", label: "Given out", render: (i) => (i.issuedOut ? <span>{qty(i.issuedOut, i.unit)}</span> : <span className={styles.muted}>—</span>) },
    { key: "total", label: "Total owned", render: (i) => qty(i.total, i.unit) },
    { key: "reorderLevel", label: "Reorder at", render: (i) => (i.reorderLevel ? qty(i.reorderLevel) : <span className={styles.muted}>—</span>) },
    { key: "stockValue", label: "Value in store", render: (i) => (i.stockValue === null ? <span className={styles.muted}>no rate</span> : inr(i.stockValue)) },
    ...(canEdit
      ? [
          {
            key: "actions",
            label: "",
            render: (i: InventoryItem) => (
              <div className={styles.rowActions}>
                {i.isActive && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onForm({ kind: "issue", itemId: i.id })} disabled={i.stock <= 0}>
                      Issue
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onForm({ kind: "receipt", itemId: i.id })}>
                      Receive
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>
                  Edit
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label="Items" value={stats.items} icon={<Icon name="box" size={18} />} />
        <StatCard label="Need reorder" value={stats.reorder} icon={<Icon name="alert" size={18} />} />
        <StatCard label="Given out, to be returned" value={pendingCount} icon={<Icon name="users" size={18} />} />
        <StatCard label="Value in store" value={inr(Math.round(stats.value))} icon={<Icon name="wallet" size={18} />} />
      </div>
      <Card
        title="Items & stock"
        subtitle="In store = on the shelf now · Given out = with staff, to be returned · Click an item for its full history"
        action={
          <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} disabled={!items.length} onClick={() => printStockRegister(items, pending, site?.settings, { blankCount: true })}>
            Stock check sheet
          </Button>
        }
      >
        <div className={styles.filters}>
          <Input label="Search" placeholder="Item or place" value={filters.q} onChange={(e) => set("q", e.target.value)} />
          <Select label="Category" value={filters.categoryId} onChange={(e) => set("categoryId", e.target.value)} options={[{ label: "All categories", value: "" }, ...categories.map((c) => ({ label: c.name, value: String(c.id) }))]} />
          <label className={styles.check}>
            <input type="checkbox" checked={filters.low} onChange={(e) => set("low", e.target.checked)} /> Needs reorder only
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={filters.includeInactive} onChange={(e) => set("includeInactive", e.target.checked)} /> Show items not used
          </label>
        </div>
        {isLoading ? (
          <Spinner />
        ) : !all.length ? (
          <EmptyState title="No items yet" description={canEdit ? 'Start with step 1: "New item" — e.g. A4 paper, chalk, footballs, computer monitors.' : "The office hasn't added any items yet."} />
        ) : (
          <div style={{ opacity: isFetching ? 0.6 : 1 }}>
            <Table columns={columns} data={items} keyField="id" emptyMessage="No items match these filters" stackBelow={900} />
          </div>
        )}
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------

const DOCS_COPY: Record<"ISSUE" | "RECEIPT" | "ADJUST", { title: string; subtitle: string; newLabel: string; empty: string }> = {
  ISSUE: { title: "Issued items", subtitle: "Every issue slip. Open one to receive items back or close what won't come back.", newLabel: "Issue items", empty: "Nothing issued yet." },
  RECEIPT: { title: "Stock received", subtitle: "Goods receipts — items bought or donated.", newLabel: "Receive stock", empty: "No stock received yet." },
  ADJUST: { title: "Stock checks & damage", subtitle: "Corrections after counting the store, and damaged / lost / expired / found items.", newLabel: "Stock check / damage", empty: "No adjustments yet." },
};
const ISSUE_FILTERS: Array<[string, string]> = [
  ["PENDING", "To be returned"],
  ["OVERDUE", "Overdue"],
  ["SETTLED", "All returned"],
  ["CONSUMED", "Consumed"],
  ["", "All"],
];

const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const DocsTab = ({ kind, canEdit, onOpen, onNew }: { kind: "ISSUE" | "RECEIPT" | "ADJUST"; canEdit: boolean; onOpen: (id: number) => void; onNew: () => void }) => {
  const copy = DOCS_COPY[kind];
  const [status, setStatus] = useState(kind === "ISSUE" ? "" : "");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ from: "", to: localDay(new Date()) });
  const [includeVoid, setIncludeVoid] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data: docs = [], isLoading, isFetching } = useGetInventoryDocsQuery({ kind, status, q: search, from: range.from, to: range.to, includeVoid });

  const columns: TableColumn<InventoryDoc>[] = [
    {
      key: "docNo",
      label: "Document",
      render: (d) => (
        <button type="button" className={styles.rowButton} onClick={() => onOpen(d.id)}>
          <div className={`${styles.strong} ${d.isVoid ? styles.voided : ""}`}>{d.docNo}</div>
          <div className={styles.muted}>{fmtDate(d.docDate)}</div>
        </button>
      ),
    },
    {
      key: "party",
      label: kind === "ISSUE" ? "Given to" : kind === "RECEIPT" ? "Supplier" : "Reason",
      render: (d) => (
        <div>
          <div>{kind === "ISSUE" ? d.issuedTo : kind === "RECEIPT" ? d.supplier : d.reasonLabel}</div>
          <div className={styles.muted}>{kind === "RECEIPT" ? (d.billNo ? `Bill ${d.billNo}` : "") : kind === "ISSUE" ? d.purpose ?? "" : d.note ?? ""}</div>
        </div>
      ),
    },
    { key: "items", label: "Items", render: (d) => <span className={d.isVoid ? styles.voided : undefined}>{docItems(d)}</span> },
    ...(kind === "RECEIPT" ? [{ key: "amount", label: "Amount", render: (d: InventoryDoc) => { const t = d.lines.reduce((s, l) => s + (l.amount ?? 0), 0); return t ? inr(t) : <span className={styles.muted}>—</span>; } }] : []),
    ...(kind === "ISSUE"
      ? [
          {
            key: "status",
            label: "Status",
            render: (d: InventoryDoc) =>
              d.status ? (
                <div>
                  <Badge tone={ISSUE_STATUS[d.status].tone}>{ISSUE_STATUS[d.status].label}</Badge>
                  {d.expectedReturnOn && ["OUT", "PART_RETURNED", "OVERDUE"].includes(d.status) && <div className={styles.muted}>due {fmtDate(d.expectedReturnOn)}</div>}
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Card
      title={copy.title}
      subtitle={copy.subtitle}
      action={
        canEdit && (
          <Button size="sm" icon={<Icon name="plus" size={15} />} onClick={onNew}>
            {copy.newLabel}
          </Button>
        )
      }
    >
      {kind === "ISSUE" && (
        <div className={styles.typePicker} role="tablist" aria-label="Filter issue slips">
          {ISSUE_FILTERS.map(([k, label]) => (
            <button key={k || "all"} type="button" role="tab" aria-selected={status === k} className={`${styles.typeBtn} ${status === k ? styles.typeBtnActive : ""}`} onClick={() => setStatus(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className={styles.filters}>
        <Input label="Search" placeholder={kind === "ISSUE" ? "Slip no., person, item" : "Document no., supplier, item"} value={q} onChange={(e) => setQ(e.target.value)} />
        <Input label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <label className={styles.check}>
          <input type="checkbox" checked={includeVoid} onChange={(e) => setIncludeVoid(e.target.checked)} /> Show voided
        </label>
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1 }}>
          <Table columns={columns} data={docs} keyField="id" emptyMessage={copy.empty} stackBelow={900} />
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const PendingTab = ({ rows, onOpen }: { rows: PendingReturn[]; onOpen: (issueId: number) => void }) => {
  const columns: TableColumn<PendingReturn & { key: number }>[] = [
    {
      key: "holder",
      label: "With",
      render: (r) => (
        <div>
          <div className={styles.strong}>{r.holder}</div>
          {r.purpose && <div className={styles.muted}>{r.purpose}</div>}
        </div>
      ),
    },
    {
      key: "item",
      label: "Item",
      render: (r) => (
        <div>
          <div>
            {r.item} × {qty(r.out, r.unit)}
          </div>
          {r.remark && <div className={styles.muted}>{r.remark}</div>}
        </div>
      ),
    },
    { key: "issuedOn", label: "Given on", render: (r) => `${fmtDate(r.issuedOn)} (${r.daysOut} days)` },
    { key: "expectedReturnOn", label: "Due back", render: (r) => (r.expectedReturnOn ? <span className={r.overdue ? styles.lowText : undefined}>{fmtDate(r.expectedReturnOn)}{r.overdue ? " · overdue" : ""}</span> : <span className={styles.muted}>no date</span>) },
    {
      key: "issueNo",
      label: "",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => onOpen(r.issueId)}>
          Open {r.issueNo} to receive back
        </Button>
      ),
    },
  ];
  return (
    <Card title="To be returned" subtitle="Everything given out that should come back, overdue first. Open the issue slip to receive it back.">
      {rows.length ? (
        <Table columns={columns} data={rows.map((r) => ({ ...r, key: r.lineId }))} keyField="key" emptyMessage="" stackBelow={900} />
      ) : (
        <EmptyState title="Nothing is out" description='Items issued with "To be returned" ticked show here until they come back.' />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const CategoriesTab = ({ canEdit }: { canEdit: boolean }) => {
  const { data: categories = [], isLoading } = useGetInventoryCategoriesQuery();
  const [save, { isLoading: saving }] = useSaveInventoryCategoryMutation();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<InventoryCategory | null>(null);
  const [newName, setNewName] = useState("");

  const run = async (body: { id?: number; name: string; isActive?: boolean }, done: string) => {
    try {
      await save(body).unwrap();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the category"));
      return false;
    }
  };

  if (isLoading) return <Spinner />;
  return (
    <Card title="Categories" subtitle="Groups for the item list and the stock register.">
      {canEdit && (
        <div className={styles.filters}>
          <Input label="New category" value={name} placeholder="e.g. Music instruments" onChange={(e) => setName(e.target.value)} />
          <div className={styles.alignEnd}>
            <Button isLoading={saving} disabled={!name.trim()} onClick={async () => (await run({ name: name.trim() }, "Category added")) && setName("")}>
              Add
            </Button>
          </div>
        </div>
      )}
      <ul className={styles.list}>
        {categories.map((c) => (
          <li key={c.id} className={styles.listItem}>
            <div className={styles.listMain}>
              <span className={styles.strong}>{c.name}</span> <span className={styles.muted}>· {c._count.items} items</span>
            </div>
            {!c.isActive && <Badge tone="neutral">Hidden</Badge>}
            {canEdit && (
              <div className={styles.rowActions}>
                <Button size="sm" variant="ghost" onClick={() => (setRenaming(c), setNewName(c.name))}>
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run({ id: c.id, name: c.name, isActive: !c.isActive }, c.isActive ? "Category hidden" : "Category shown")}>
                  {c.isActive ? "Hide" : "Show"}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {renaming && (
        <Modal title={`Rename ${renaming.name}`} size="sm" onClose={() => setRenaming(null)}>
          <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button isLoading={saving} disabled={!newName.trim()} onClick={async () => (await run({ id: renaming.id, name: newName.trim() }, "Category renamed")) && setRenaming(null)}>
              Save
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
};

export default InventoryPage;
