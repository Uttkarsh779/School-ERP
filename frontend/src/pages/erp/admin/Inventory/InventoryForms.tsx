import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import {
  ADJUST_REASONS,
  UNITS,
  useCreateAdjustmentMutation,
  useCreateIssueMutation,
  useCreateReceiptMutation,
  useGetInventoryCategoriesQuery,
  useGetIssuableStaffQuery,
  useGetSuppliersQuery,
  useSaveInventoryItemMutation,
  type InventoryDoc,
  type InventoryItem,
} from "../../../../store/api/inventory.api";
import { getErrorMessage, inr } from "../Fees/feeUtils";
import styles from "./Inventory.module.css";

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
export const qty = (n: number, unit?: string) => `${Number.isInteger(n) ? n : n.toFixed(2)}${unit ? ` ${unit}` : ""}`;

const Help = ({ children }: { children: React.ReactNode }) => <p className={styles.help}>{children}</p>;

const Footer = ({ onClose, busy, disabled, label, onSave }: { onClose: () => void; busy: boolean; disabled?: boolean; label: string; onSave: () => void }) => (
  <div className={styles.actions}>
    <Button variant="ghost" onClick={onClose}>
      Cancel
    </Button>
    <Button isLoading={busy} disabled={disabled} onClick={onSave}>
      {label}
    </Button>
  </div>
);

// ---------------------------------------------------------------------------
// Item master
// ---------------------------------------------------------------------------

export const ItemModal = ({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) => {
  const { data: categories = [] } = useGetInventoryCategoriesQuery();
  const [save, { isLoading }] = useSaveInventoryItemMutation();
  const [f, setF] = useState({
    name: item?.name ?? "",
    categoryId: item ? String(item.categoryId) : "",
    unit: item?.unit ?? "pcs",
    returnable: item?.returnable ?? false,
    reorderLevel: item?.reorderLevel ? String(item.reorderLevel) : "",
    location: item?.location ?? "",
    notes: item?.notes ?? "",
    isActive: item?.isActive ?? true,
    openingStock: "",
    rate: "",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const units = UNITS.includes(f.unit) ? UNITS : [f.unit, ...UNITS];

  const submit = async () => {
    try {
      const { openingStock, rate, ...rest } = f;
      await save({ id: item?.id, ...rest, categoryId: Number(f.categoryId), ...(item ? {} : { openingStock, rate }) }).unwrap();
      toast.success(item ? "Item saved" : `${f.name.trim()} added`);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the item"));
    }
  };

  return (
    <Modal title={item ? `Edit ${item.name}` : "New item"} size="md" onClose={onClose}>
      <Help>An item is one kind of thing the school keeps (e.g. "A4 paper ream", "Football", "Computer monitor"). Stock changes only through receipts, issues and adjustments.</Help>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <Input label="Item name" required value={f.name} maxLength={100} placeholder="e.g. Football (size 5)" onChange={(e) => set("name", e.target.value)} />
        </div>
        <Select
          label="Category"
          required
          value={f.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          options={[{ label: "Choose…", value: "" }, ...categories.filter((c) => c.isActive || String(c.id) === f.categoryId).map((c) => ({ label: c.name, value: String(c.id) }))]}
        />
        <Select label="Counted in (unit)" value={f.unit} onChange={(e) => set("unit", e.target.value)} options={units.map((u) => ({ label: u, value: u }))} />
        <Input label="Reorder level" type="number" min={0} step="any" value={f.reorderLevel} placeholder="Warn when stock falls to this" onChange={(e) => set("reorderLevel", e.target.value)} />
        <Input label="Kept at" value={f.location} placeholder="e.g. Store room, Computer lab" onChange={(e) => set("location", e.target.value)} />
        <label className={`${styles.check} ${styles.wide}`}>
          <input type="checkbox" checked={f.returnable} onChange={(e) => set("returnable", e.target.checked)} />
          <span>
            <strong>Usually given out and returned</strong> (equipment: monitors, sports kit, tools). Untick for things that get used up (chalk, paper).
          </span>
        </label>
        {!item && (
          <>
            <Input label="Opening stock (in hand now)" type="number" min={0} step="any" value={f.openingStock} onChange={(e) => set("openingStock", e.target.value)} />
            <Input label="Rate per unit (₹, optional)" type="number" min={0} step="any" value={f.rate} onChange={(e) => set("rate", e.target.value)} />
          </>
        )}
        <div className={styles.wide}>
          <Input label="Notes" value={f.notes} maxLength={500} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {item && (
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" checked={!f.isActive} onChange={(e) => set("isActive", !e.target.checked)} />
            No longer used — hide from lists (its history is kept)
          </label>
        )}
      </div>
      <Footer onClose={onClose} busy={isLoading} disabled={!f.name.trim() || !f.categoryId} label={item ? "Save" : "Add item"} onSave={submit} />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Lines editor (several items on one document)
// ---------------------------------------------------------------------------

type Line = { key: number; itemId: string; quantity: string; rate: string; toReturn: boolean; remark: string; counted: string };
let lineKey = 0;
const newLine = (itemId = "", items: InventoryItem[] = []): Line => {
  const it = items.find((i) => String(i.id) === itemId);
  return { key: ++lineKey, itemId, quantity: "", rate: it?.lastRate ? String(it.lastRate) : "", toReturn: !!it?.returnable, remark: "", counted: "" };
};

const LinesEditor = ({
  items,
  lines,
  setLines,
  mode,
}: {
  items: InventoryItem[];
  lines: Line[];
  setLines: (l: Line[]) => void;
  mode: "RECEIPT" | "ISSUE" | "COUNT" | "QTY";
}) => {
  const active = items.filter((i) => i.isActive);
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: number, itemId: string) => {
    const it = active.find((i) => String(i.id) === itemId);
    update(key, { itemId, toReturn: !!it?.returnable, rate: it?.lastRate ? String(it.lastRate) : "" });
  };
  return (
    <div className={styles.lines}>
      {lines.map((l, idx) => {
        const it = active.find((i) => String(i.id) === l.itemId);
        const taken = new Set(lines.filter((x) => x.key !== l.key).map((x) => x.itemId));
        return (
          <div key={l.key} className={styles.lineRow}>
            <div className={styles.lineItem}>
              <Select
                label={idx === 0 ? "Item" : undefined}
                aria-label="Item"
                value={l.itemId}
                onChange={(e) => pickItem(l.key, e.target.value)}
                options={[{ label: "Choose item…", value: "" }, ...active.filter((i) => !taken.has(String(i.id))).map((i) => ({ label: `${i.name} — ${qty(i.stock, i.unit)} in store`, value: String(i.id) }))]}
              />
            </div>
            {mode === "COUNT" ? (
              <Input label={idx === 0 ? "Counted" : undefined} aria-label="Counted quantity" type="number" min={0} step="any" value={l.counted} placeholder={it ? `book: ${qty(it.stock)}` : ""} onChange={(e) => update(l.key, { counted: e.target.value })} />
            ) : (
              <Input label={idx === 0 ? `Qty${it ? ` (${it.unit})` : ""}` : undefined} aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
            )}
            {mode === "RECEIPT" && <Input label={idx === 0 ? "Rate (₹)" : undefined} aria-label="Rate" type="number" min={0} step="any" value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} />}
            {mode === "ISSUE" && (
              <>
                <label className={styles.lineCheck}>
                  <input type="checkbox" checked={l.toReturn} onChange={(e) => update(l.key, { toReturn: e.target.checked })} />
                  To be returned
                </label>
                <Input label={idx === 0 ? "Serial / tag no." : undefined} aria-label="Serial or remark" value={l.remark} placeholder="optional" onChange={(e) => update(l.key, { remark: e.target.value })} />
              </>
            )}
            {mode === "QTY" && <Input label={idx === 0 ? "Remark" : undefined} aria-label="Remark" value={l.remark} onChange={(e) => update(l.key, { remark: e.target.value })} />}
            <button type="button" className={styles.lineRemove} aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
              ×
            </button>
          </div>
        );
      })}
      <Button size="sm" variant="ghost" onClick={() => setLines([...lines, newLine()])}>
        + Add another item
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Goods receipt (GRN)
// ---------------------------------------------------------------------------

export const ReceiptModal = ({ items, startItemId, onClose, onSaved }: { items: InventoryItem[]; startItemId?: number; onClose: () => void; onSaved: (d: InventoryDoc) => void }) => {
  const { data: suppliers = [] } = useGetSuppliersQuery();
  const [save, { isLoading }] = useCreateReceiptMutation();
  const [f, setF] = useState({ docDate: today(), supplier: "", billNo: "", note: "" });
  const [lines, setLines] = useState<Line[]>(() => [newLine(startItemId ? String(startItemId) : "", items)]);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const ok = f.supplier.trim() && lines.every((l) => l.itemId && Number(l.quantity) > 0);

  const submit = async () => {
    try {
      const doc = await save({ ...f, lines: lines.map((l) => ({ itemId: Number(l.itemId), quantity: l.quantity, rate: l.rate })) }).unwrap();
      toast.success(`${doc.docNo} saved — stock added`);
      onSaved(doc);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  return (
    <Modal title="Receive stock (Goods Receipt)" size="lg" onClose={onClose}>
      <Help>Use this when items arrive — bought from a shop or supplier, or donated. Everything on the bill goes on one receipt. Stock goes up.</Help>
      <div className={styles.formGrid}>
        <Input label="Supplier / donor" required list="inv-suppliers" value={f.supplier} placeholder="e.g. Sharma Stationers" onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        <datalist id="inv-suppliers">
          {suppliers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Input label="Bill / invoice no." value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} />
        <Input label="Date received" type="date" max={today()} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} />
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <LinesEditor items={items} lines={lines} setLines={setLines} mode="RECEIPT" />
      {total > 0 && <p className={styles.totalLine}>Bill total: {inr(Math.round(total * 100) / 100)}</p>}
      <Footer onClose={onClose} busy={isLoading} disabled={!ok} label="Save receipt" onSave={submit} />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Issue slip
// ---------------------------------------------------------------------------

export const IssueModal = ({ items, startItemId, onClose, onSaved }: { items: InventoryItem[]; startItemId?: number; onClose: () => void; onSaved: (d: InventoryDoc) => void }) => {
  const { data: staff = [] } = useGetIssuableStaffQuery();
  const [save, { isLoading }] = useCreateIssueMutation();
  const [f, setF] = useState({ docDate: today(), to: "", department: "", purpose: "", expectedReturnOn: "", note: "" });
  const [lines, setLines] = useState<Line[]>(() => [newLine(startItemId ? String(startItemId) : "", items)]);
  const anyReturn = lines.some((l) => l.toReturn);
  const whoOk = f.to.startsWith("s") || (f.to === "dept" && f.department.trim());
  const ok = whoOk && lines.every((l) => l.itemId && Number(l.quantity) > 0);
  const staffOptions = useMemo(() => staff.map((s) => ({ label: `${s.name}${s.employeeCode ? ` (${s.employeeCode})` : ""}`, value: `s${s.id}` })), [staff]);

  const submit = async () => {
    try {
      const doc = await save({
        docDate: f.docDate,
        ...(f.to.startsWith("s") ? { staffId: Number(f.to.slice(1)) } : { department: f.department.trim() }),
        purpose: f.purpose,
        expectedReturnOn: anyReturn ? f.expectedReturnOn : "",
        note: f.note,
        lines: lines.map((l) => ({ itemId: Number(l.itemId), quantity: l.quantity, toReturn: l.toReturn, remark: l.remark })),
      }).unwrap();
      toast.success(`${doc.docNo} saved — print the slip and get it signed`);
      onSaved(doc);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  return (
    <Modal title="Issue items (Issue Slip)" size="lg" onClose={onClose}>
      <Help>
        Use this when you give items to a staff member or a department. Tick <strong>To be returned</strong> for things that must come back (monitors, sports kit) — they
        stay on the slip until you receive them back. Untick for things that get used up (chalk, paper).
      </Help>
      <div className={styles.formGrid}>
        <Select
          label="Issued to"
          required
          value={f.to}
          onChange={(e) => setF({ ...f, to: e.target.value })}
          options={[{ label: "Choose…", value: "" }, ...staffOptions, { label: "A department / room / class…", value: "dept" }]}
        />
        {f.to === "dept" ? (
          <Input label="Department / room / class" required value={f.department} placeholder="e.g. Computer lab, Class 5A" onChange={(e) => setF({ ...f, department: e.target.value })} />
        ) : (
          <Input label="Purpose" value={f.purpose} placeholder="e.g. Sports day, Lab practical" onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        )}
        {f.to === "dept" && <Input label="Purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />}
        <Input label="Issue date" type="date" max={today()} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} />
      </div>
      <LinesEditor items={items} lines={lines} setLines={setLines} mode="ISSUE" />
      <div className={styles.formGrid}>
        {anyReturn && <Input label="Return by (optional)" type="date" min={f.docDate} value={f.expectedReturnOn} onChange={(e) => setF({ ...f, expectedReturnOn: e.target.value })} />}
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <Footer onClose={onClose} busy={isLoading} disabled={!ok} label="Save issue slip" onSave={submit} />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Stock check / damage / lost / expired / found
// ---------------------------------------------------------------------------

export const AdjustModal = ({ items, startItemId, onClose, onSaved }: { items: InventoryItem[]; startItemId?: number; onClose: () => void; onSaved: (d: InventoryDoc) => void }) => {
  const [save, { isLoading }] = useCreateAdjustmentMutation();
  const [reason, setReason] = useState("COUNT");
  const [f, setF] = useState({ docDate: today(), note: "" });
  const [lines, setLines] = useState<Line[]>(() => [newLine(startItemId ? String(startItemId) : "", items)]);
  const isCount = reason === "COUNT";
  const ok = f.note.trim() && lines.every((l) => l.itemId && (isCount ? l.counted !== "" : Number(l.quantity) > 0));
  const help = ADJUST_REASONS.find((r) => r.value === reason)?.help;

  const submit = async () => {
    try {
      const doc = await save({ reason, ...f, lines: lines.map((l) => ({ itemId: Number(l.itemId), counted: l.counted, quantity: l.quantity, remark: l.remark })) }).unwrap();
      toast.success(`${doc.docNo} saved — stock corrected`);
      onSaved(doc);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  return (
    <Modal title="Stock check / damage" size="lg" onClose={onClose}>
      <Help>For items in the store only. (For something a person has and can't return, open their issue slip and use "Won't come back".)</Help>
      <div className={styles.typePicker} role="radiogroup" aria-label="Reason">
        {ADJUST_REASONS.map((r) => (
          <button key={r.value} type="button" role="radio" aria-checked={reason === r.value} className={`${styles.typeBtn} ${reason === r.value ? styles.typeBtnActive : ""}`} onClick={() => setReason(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      {help && <p className={styles.stockLine}>{help}</p>}
      <LinesEditor items={items} lines={lines} setLines={setLines} mode={isCount ? "COUNT" : "QTY"} />
      <div className={styles.formGrid}>
        <Input label="Note" required value={f.note} placeholder={isCount ? "e.g. Annual stock check March" : "e.g. Broken during practical"} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <Input label="Date" type="date" max={today()} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} />
      </div>
      <Footer onClose={onClose} busy={isLoading} disabled={!ok} label="Save" onSave={submit} />
    </Modal>
  );
};
