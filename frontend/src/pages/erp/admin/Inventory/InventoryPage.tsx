import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  MOVEMENT_LABEL,
  useGetInventoryCategoriesQuery,
  useGetInventoryItemsQuery,
  useGetInventoryMovementsQuery,
  useGetItemsWithStaffQuery,
  useSaveInventoryCategoryMutation,
  useVoidInventoryMovementMutation,
  type HeldItem,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMovement,
  type MovementType,
} from "../../../../store/api/inventory.api";
import { useDownloadExportMutation } from "../../../../store/api/exports.api";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { useCan } from "../../../../store/permissions";
import { fmtDate, getErrorMessage, inr } from "../Fees/feeUtils";
import { ItemModal, MovementModal, qty } from "./InventoryModals";
import { printStockRegister } from "./inventoryPrint";
import styles from "./Inventory.module.css";

type Tab = "stock" | "entries" | "held" | "categories";
type EntryStart = { type: MovementType; itemId?: number; staffId?: number | null; issuedTo?: string | null; quantity?: number };
const localDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// Inventory: the school's own stock — what's in the store, who has what, and every change.
const InventoryPage = () => {
  const can = useCan();
  const canEdit = can("inventory.edit");
  const [tab, setTab] = useState<Tab>("stock");
  const { data: allItems = [] } = useGetInventoryItemsQuery();
  const { data: held = [] } = useGetItemsWithStaffQuery();
  const { data: site } = useGetPublicWebsiteDataQuery();
  const [download, { isLoading: downloading }] = useDownloadExportMutation();
  const [entry, setEntry] = useState<EntryStart | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);

  const excel = async () => {
    try {
      await download({ path: "inventory" }).unwrap();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't download the stock register"));
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="School stock — what's in the store, what's with staff, and every entry"
        actions={
          <div className={styles.addButtons}>
            <Button variant="outline" icon={<Icon name="printer" size={16} />} onClick={() => printStockRegister(allItems, held, site?.settings)}>
              Print
            </Button>
            <Button variant="outline" icon={<Icon name="download" size={16} />} isLoading={downloading} onClick={excel}>
              Excel
            </Button>
            {canEdit && (
              <>
                <Button variant="outline" icon={<Icon name="plus" size={16} />} onClick={() => setEditing("new")}>
                  Add item
                </Button>
                <Button icon={<Icon name="box" size={16} />} disabled={!allItems.length} onClick={() => setEntry({ type: "ISSUE" })}>
                  Stock entry
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className={styles.tabs} role="tablist">
        {(
          [
            ["stock", "Stock"],
            ["entries", "Entries"],
            ["held", `With staff${held.length ? ` (${held.length})` : ""}`],
            ["categories", "Categories"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "stock" && <StockTab canEdit={canEdit} onEntry={setEntry} onEdit={setEditing} onPrintCheck={(items) => printStockRegister(items, held, site?.settings, { blankCount: true })} />}
      {tab === "entries" && <EntriesTab canEdit={canEdit} items={allItems} />}
      {tab === "held" && <HeldTab held={held} canEdit={canEdit} onReturn={(h) => setEntry({ type: "RETURN", itemId: h.itemId, staffId: h.staffId, issuedTo: h.issuedTo, quantity: h.quantity })} />}
      {tab === "categories" && <CategoriesTab canEdit={canEdit} />}

      {entry && <MovementModal items={allItems} initial={entry} onClose={() => setEntry(null)} />}
      {editing && <ItemModal item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const StockTab = ({
  canEdit,
  onEntry,
  onEdit,
  onPrintCheck,
}: {
  canEdit: boolean;
  onEntry: (e: EntryStart) => void;
  onEdit: (i: InventoryItem) => void;
  onPrintCheck: (items: InventoryItem[]) => void;
}) => {
  const [filters, setFilters] = useState({ q: "", categoryId: "", low: false, includeInactive: false });
  const set = (k: keyof typeof filters, v: string | boolean) => setFilters((f) => ({ ...f, [k]: v }));
  const { data: items = [], isFetching, isLoading } = useGetInventoryItemsQuery(filters);
  const { data: categories = [] } = useGetInventoryCategoriesQuery();
  const { data: all = [] } = useGetInventoryItemsQuery();

  const stats = useMemo(
    () => ({
      items: all.length,
      low: all.filter((i) => i.isLow).length,
      withStaff: all.filter((i) => i.withStaff > 0).length,
      value: all.reduce((s, i) => s + (i.stockValue ?? 0), 0),
    }),
    [all]
  );

  const columns: TableColumn<InventoryItem>[] = [
    {
      key: "name",
      label: "Item",
      render: (i) => (
        <div>
          <div className={styles.strong}>
            {i.name} {!i.isActive && <Badge tone="neutral">Not used</Badge>}
          </div>
          <div className={styles.muted}>
            {i.category}
            {i.location ? ` · ${i.location}` : ""}
            {i.returnable ? " · returnable" : ""}
          </div>
        </div>
      ),
    },
    {
      key: "stock",
      label: "In stock",
      render: (i) => (
        <div>
          <span className={i.isLow ? styles.lowText : styles.strong}>{qty(i.stock, i.unit)}</span>
          {i.isLow && (
            <div>
              <Badge tone="danger">Low — reorder</Badge>
            </div>
          )}
          {i.minStock > 0 && !i.isLow && <div className={styles.muted}>warn at {qty(i.minStock)}</div>}
        </div>
      ),
    },
    { key: "withStaff", label: "With staff", render: (i) => (i.returnable ? (i.withStaff ? qty(i.withStaff, i.unit) : "—") : <span className={styles.muted}>consumable</span>) },
    { key: "stockValue", label: "Value", render: (i) => (i.stockValue === null ? <span className={styles.muted}>no cost entered</span> : inr(i.stockValue)) },
    ...(canEdit
      ? [
          {
            key: "actions",
            label: "",
            render: (i: InventoryItem) =>
              i.isActive ? (
                <div className={styles.rowActions}>
                  <Button size="sm" variant="outline" onClick={() => onEntry({ type: "IN", itemId: i.id })}>
                    Receive
                  </Button>
                  <Button size="sm" variant="outline" disabled={i.stock <= 0} onClick={() => onEntry({ type: "ISSUE", itemId: i.id })}>
                    Issue
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEntry({ type: "ADJUST", itemId: i.id })}>
                    Count
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>
                    Edit
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onEdit(i)}>
                  Edit
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label="Items" value={stats.items} icon={<Icon name="box" size={18} />} />
        <StatCard label="Low stock" value={stats.low} icon={<Icon name="alert" size={18} />} />
        <StatCard label="Items with staff" value={stats.withStaff} icon={<Icon name="users" size={18} />} />
        <StatCard label="Stock value" value={inr(Math.round(stats.value))} icon={<Icon name="wallet" size={18} />} />
      </div>
      <Card
        title="Stock"
        subtitle="Value uses the latest purchase cost entered for each item"
        action={
          <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} disabled={!items.length} onClick={() => onPrintCheck(items)}>
            Stock check sheet
          </Button>
        }
      >
        <div className={styles.filters}>
          <Input label="Search" placeholder="Item or place" value={filters.q} onChange={(e) => set("q", e.target.value)} />
          <Select
            label="Category"
            value={filters.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            options={[{ label: "All categories", value: "" }, ...categories.map((c) => ({ label: c.name, value: String(c.id) }))]}
          />
          <label className={styles.check}>
            <input type="checkbox" checked={filters.low} onChange={(e) => set("low", e.target.checked)} /> Low stock only
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={filters.includeInactive} onChange={(e) => set("includeInactive", e.target.checked)} /> Show items not used
          </label>
        </div>
        {isLoading ? (
          <Spinner />
        ) : !all.length ? (
          <EmptyState title="No items yet" description={canEdit ? "Add the things the school keeps in stock — chalk, A4 paper, footballs, chairs …" : "The office hasn't added any items yet."} />
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

const EntriesTab = ({ canEdit, items }: { canEdit: boolean; items: InventoryItem[] }) => {
  const now = new Date();
  const [filters, setFilters] = useState({ from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: localDay(now), type: "", itemId: "", includeVoid: false });
  const set = (k: keyof typeof filters, v: string | boolean) => setFilters((f) => ({ ...f, [k]: v }));
  const { data: rows = [], isFetching } = useGetInventoryMovementsQuery(filters);
  const [voiding, setVoiding] = useState<InventoryMovement | null>(null);
  const [reason, setReason] = useState("");
  const [voidEntry, { isLoading }] = useVoidInventoryMovementMutation();

  const confirmVoid = async () => {
    if (!voiding) return;
    try {
      await voidEntry({ id: voiding.id, reason: reason.trim() }).unwrap();
      toast.success("Entry voided — stock corrected");
      setVoiding(null);
      setReason("");
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't void the entry"));
    }
  };

  const columns: TableColumn<InventoryMovement>[] = [
    { key: "movedOn", label: "Date", render: (m) => fmtDate(m.movedOn) },
    {
      key: "item",
      label: "Entry",
      render: (m) => (
        <div className={m.isVoid ? styles.voided : undefined}>
          <div className={styles.strong}>
            {MOVEMENT_LABEL[m.type]} · {m.item}
          </div>
          <div className={styles.muted}>
            {[
              m.holder && (m.type === "RETURN" ? `from ${m.holder}` : `to ${m.holder}`),
              m.supplier && `from ${m.supplier}`,
              m.billNo && `bill ${m.billNo}`,
              m.unitCost !== null && `${inr(m.unitCost)} each`,
              m.note,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {m.isVoid && <div className={styles.danger}>Voided: {m.voidReason}</div>}
        </div>
      ),
    },
    {
      key: "change",
      label: "Stock",
      render: (m) => <strong className={`${m.change < 0 ? styles.danger : styles.success} ${m.isVoid ? styles.voided : ""}`}>{`${m.change > 0 ? "+" : "−"}${qty(Math.abs(m.change), m.unit)}`}</strong>,
    },
    { key: "createdBy", label: "By", render: (m) => <span className={styles.muted}>{m.createdBy}</span> },
    ...(canEdit
      ? [
          {
            key: "actions",
            label: "",
            render: (m: InventoryMovement) =>
              !m.isVoid && (
                <Button size="sm" variant="ghost" onClick={() => setVoiding(m)}>
                  Void
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <Card title="Entries" subtitle="Every change to stock. A wrong entry is voided (stock put back), never edited.">
      <div className={styles.filters}>
        <Input label="From" type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} />
        <Input label="To" type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} />
        <Select
          label="What"
          value={filters.type}
          onChange={(e) => set("type", e.target.value)}
          options={[{ label: "All entries", value: "" }, ...(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => ({ label: MOVEMENT_LABEL[t], value: t }))]}
        />
        <Select label="Item" value={filters.itemId} onChange={(e) => set("itemId", e.target.value)} options={[{ label: "All items", value: "" }, ...items.map((i) => ({ label: i.name, value: String(i.id) }))]} />
        <label className={styles.check}>
          <input type="checkbox" checked={filters.includeVoid} onChange={(e) => set("includeVoid", e.target.checked)} /> Show voided
        </label>
      </div>
      <div style={{ opacity: isFetching ? 0.6 : 1 }}>
        <Table columns={columns} data={rows} keyField="id" emptyMessage="No entries in this period" stackBelow={900} />
      </div>

      {voiding && (
        <Modal title="Void this entry?" size="sm" onClose={() => setVoiding(null)}>
          <p className={styles.muted}>
            {MOVEMENT_LABEL[voiding.type]} · {voiding.item} · {qty(voiding.quantity, voiding.unit)}. The stock is put back as if it never happened; the entry stays listed as voided.
          </p>
          <Input label="Reason" required value={reason} placeholder="e.g. Entered twice" onChange={(e) => setReason(e.target.value)} />
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setVoiding(null)}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={isLoading} disabled={reason.trim().length < 3} onClick={confirmVoid}>
              Void entry
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000));

const HeldTab = ({ held, canEdit, onReturn }: { held: HeldItem[]; canEdit: boolean; onReturn: (h: HeldItem) => void }) => {
  const columns: TableColumn<HeldItem>[] = [
    { key: "holder", label: "With", render: (h) => <span className={styles.strong}>{h.holder}</span> },
    { key: "item", label: "Item" },
    { key: "quantity", label: "Qty", render: (h) => qty(h.quantity, h.unit) },
    { key: "since", label: "Since", render: (h) => `${fmtDate(h.since)} (${daysSince(h.since)} days)` },
    ...(canEdit
      ? [
          {
            key: "actions",
            label: "",
            render: (h: HeldItem) => (
              <Button size="sm" variant="outline" onClick={() => onReturn(h)}>
                Record return
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <Card title="With staff" subtitle="Returnable items issued and not yet back, oldest first">
      {held.length ? (
        <Table columns={columns} data={held.map((h, i) => ({ ...h, key: i }))} keyField={"key" as keyof HeldItem} emptyMessage="" />
      ) : (
        <EmptyState title="Nothing is out" description="Returnable items (sports kit, tools, lab equipment) show here while someone has them." />
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
    <Card title="Categories">
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
