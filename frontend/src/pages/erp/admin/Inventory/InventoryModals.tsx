import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import {
  MOVEMENT_LABEL,
  UNITS,
  useGetInventoryCategoriesQuery,
  useGetIssuableStaffQuery,
  useGetItemsWithStaffQuery,
  useRecordInventoryMovementMutation,
  useSaveInventoryItemMutation,
  type InventoryItem,
  type MovementType,
} from "../../../../store/api/inventory.api";
import { getErrorMessage } from "../Fees/feeUtils";
import styles from "./Inventory.module.css";

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
export const qty = (n: number, unit?: string) => `${Number.isInteger(n) ? n : n.toFixed(2)}${unit ? ` ${unit}` : ""}`;

// ---------------------------------------------------------------------------
// Add / edit item
// ---------------------------------------------------------------------------

export const ItemModal = ({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) => {
  const { data: categories = [] } = useGetInventoryCategoriesQuery();
  const [save, { isLoading }] = useSaveInventoryItemMutation();
  const [form, setForm] = useState({
    name: item?.name ?? "",
    categoryId: item ? String(item.categoryId) : "",
    unit: item?.unit ?? "pcs",
    returnable: item?.returnable ?? false,
    minStock: item ? String(item.minStock || "") : "",
    location: item?.location ?? "",
    notes: item?.notes ?? "",
    isActive: item?.isActive ?? true,
    openingStock: "",
    unitCost: "",
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    try {
      const { openingStock, unitCost, ...rest } = form;
      await save({ id: item?.id, ...rest, categoryId: Number(form.categoryId), ...(item ? {} : { openingStock, unitCost }) }).unwrap();
      toast.success(item ? "Item saved" : `${form.name.trim()} added`);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the item"));
    }
  };

  const units = UNITS.includes(form.unit) ? UNITS : [form.unit, ...UNITS];
  return (
    <Modal title={item ? `Edit ${item.name}` : "Add item"} size="md" onClose={onClose}>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <Input label="Item name" required value={form.name} maxLength={100} placeholder="e.g. A4 paper (500 sheets)" onChange={(e) => set("name", e.target.value)} />
        </div>
        <Select
          label="Category"
          required
          value={form.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          options={[{ label: "Choose…", value: "" }, ...categories.filter((c) => c.isActive || String(c.id) === form.categoryId).map((c) => ({ label: c.name, value: String(c.id) }))]}
        />
        <Select label="Counted in" value={form.unit} onChange={(e) => set("unit", e.target.value)} options={units.map((u) => ({ label: u, value: u }))} />
        <Input label="Warn when stock is at or below" type="number" min={0} step="any" value={form.minStock} placeholder="0 = no warning" onChange={(e) => set("minStock", e.target.value)} />
        <Input label="Kept at" value={form.location} placeholder="e.g. Store room, Lab 1" onChange={(e) => set("location", e.target.value)} />
        <label className={`${styles.check} ${styles.wide}`}>
          <input type="checkbox" checked={form.returnable} onChange={(e) => set("returnable", e.target.checked)} />
          Returnable — expected back after it's issued (sports kit, tools, lab equipment)
        </label>
        {!item && (
          <>
            <Input label="Opening stock" type="number" min={0} step="any" value={form.openingStock} placeholder="Quantity in hand now" onChange={(e) => set("openingStock", e.target.value)} />
            <Input label="Cost per unit (₹, optional)" type="number" min={0} step="any" value={form.unitCost} onChange={(e) => set("unitCost", e.target.value)} />
          </>
        )}
        <div className={styles.wide}>
          <Input label="Notes" value={form.notes} maxLength={500} onChange={(e) => set("notes", e.target.value)} />
        </div>
        {item && (
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" checked={!form.isActive} onChange={(e) => set("isActive", !e.target.checked)} />
            No longer used — hide from the list (history is kept)
          </label>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!form.name.trim() || !form.categoryId} onClick={submit}>
          {item ? "Save" : "Add item"}
        </Button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Record a stock entry: received, issued, returned, stock count, write-off
// ---------------------------------------------------------------------------

const HINT: Record<MovementType, string> = {
  IN: "New stock bought or donated.",
  ISSUE: "Given to a staff member, or to a room / class.",
  RETURN: "A returnable item coming back.",
  ADJUST: "You counted the stock and it differs from the ERP.",
  WRITE_OFF: "Damaged, lost, expired or used up outside an issue.",
};

export const MovementModal = ({
  items,
  initial,
  onClose,
}: {
  items: InventoryItem[];
  initial: { type: MovementType; itemId?: number; staffId?: number | null; issuedTo?: string | null; quantity?: number };
  onClose: () => void;
}) => {
  const [type, setType] = useState<MovementType>(initial.type);
  const [form, setForm] = useState({
    itemId: initial.itemId ? String(initial.itemId) : "",
    quantity: initial.quantity ? String(initial.quantity) : "",
    countedStock: "",
    movedOn: today(),
    supplier: "",
    billNo: "",
    unitCost: "",
    to: initial.staffId ? `s${initial.staffId}` : initial.issuedTo ? "other" : "",
    issuedTo: initial.issuedTo ?? "",
    note: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const changeType = (t: MovementType) => {
    setType(t);
    if (t === "RETURN" || type === "RETURN") setForm((f) => ({ ...f, to: "", issuedTo: "" })); // holders differ between issue and return
  };
  const { data: staff = [] } = useGetIssuableStaffQuery();
  const { data: held = [] } = useGetItemsWithStaffQuery(undefined, { skip: type !== "RETURN" });
  const [record, { isLoading }] = useRecordInventoryMovementMutation();

  const item = items.find((i) => String(i.id) === form.itemId);
  const itemOptions = useMemo(
    () => items.filter((i) => i.isActive && (type !== "RETURN" || i.returnable)).map((i) => ({ label: `${i.name} (${qty(i.stock, i.unit)})`, value: String(i.id) })),
    [items, type]
  );
  // Returns: only people who actually hold this item.
  const holders = held.filter((h) => String(h.itemId) === form.itemId);

  const submit = async () => {
    const who = form.to.startsWith("s") ? { staffId: Number(form.to.slice(1)) } : { issuedTo: form.issuedTo.trim() };
    const body: Record<string, unknown> = { type, itemId: Number(form.itemId), movedOn: form.movedOn, note: form.note.trim() };
    if (type === "ADJUST") body.countedStock = form.countedStock;
    else body.quantity = form.quantity;
    if (type === "IN") Object.assign(body, { supplier: form.supplier, billNo: form.billNo, unitCost: form.unitCost });
    if (type === "ISSUE" || type === "RETURN") Object.assign(body, who);
    try {
      await record(body).unwrap();
      toast.success(`${MOVEMENT_LABEL[type]}: ${item?.name ?? "item"}`);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  const needsWho = type === "ISSUE" || type === "RETURN";
  const whoOk = !needsWho || (form.to.startsWith("s") ? true : form.to === "other" && form.issuedTo.trim().length > 0);
  const amountOk = type === "ADJUST" ? form.countedStock !== "" : Number(form.quantity) > 0;
  const noteOk = !(type === "ADJUST" || type === "WRITE_OFF") || form.note.trim().length > 0;

  return (
    <Modal title="Stock entry" size="md" onClose={onClose}>
      <div className={styles.typePicker} role="radiogroup" aria-label="What happened">
        {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={`${styles.typeBtn} ${type === t ? styles.typeBtnActive : ""}`} onClick={() => changeType(t)}>
            {MOVEMENT_LABEL[t]}
          </button>
        ))}
      </div>
      <p className={styles.stockLine}>{HINT[type]}</p>

      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <Select label="Item" required value={form.itemId} onChange={(e) => set("itemId", e.target.value)} options={[{ label: "Choose…", value: "" }, ...itemOptions]} />
          {item && (
            <p className={styles.stockLine} style={{ marginTop: "0.3rem" }}>
              In stock: {qty(item.stock, item.unit)}
              {item.withStaff ? ` · with staff: ${qty(item.withStaff, item.unit)}` : ""}
            </p>
          )}
        </div>

        {type === "ADJUST" ? (
          <Input label={`Counted quantity${item ? ` (${item.unit})` : ""}`} required type="number" min={0} step="any" value={form.countedStock} onChange={(e) => set("countedStock", e.target.value)} />
        ) : (
          <Input label={`Quantity${item ? ` (${item.unit})` : ""}`} required type="number" min={0} step="any" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
        )}
        <Input label="Date" type="date" max={today()} value={form.movedOn} onChange={(e) => set("movedOn", e.target.value)} />

        {type === "IN" && (
          <>
            <Input label="Supplier" value={form.supplier} placeholder="e.g. Sharma Stationers" onChange={(e) => set("supplier", e.target.value)} />
            <Input label="Bill no." value={form.billNo} onChange={(e) => set("billNo", e.target.value)} />
            <Input label="Cost per unit (₹)" type="number" min={0} step="any" value={form.unitCost} onChange={(e) => set("unitCost", e.target.value)} />
          </>
        )}

        {needsWho && (
          <>
            <Select
              label={type === "ISSUE" ? "Issued to" : "Returned by"}
              required
              value={type === "RETURN" && form.to === "other" ? `t:${form.issuedTo}` : form.to}
              onChange={(e) => {
                const v = e.target.value;
                const h = holders.find((x) => (x.staffId ? `s${x.staffId}` : `t:${x.issuedTo}`) === v);
                if (h && !h.staffId) setForm((f) => ({ ...f, to: "other", issuedTo: h.issuedTo ?? "" }));
                else set("to", v);
              }}
              options={
                type === "RETURN"
                  ? [
                      { label: holders.length || !form.itemId ? "Choose…" : "Nobody holds this item", value: "" },
                      ...holders.map((h) => ({ label: `${h.holder} — has ${qty(h.quantity, h.unit)}`, value: h.staffId ? `s${h.staffId}` : `t:${h.issuedTo}` })),
                    ]
                  : [
                      { label: "Choose…", value: "" },
                      ...staff.map((s) => ({ label: `${s.name}${s.employeeCode ? ` (${s.employeeCode})` : ""}`, value: `s${s.id}` })),
                      { label: "A room / class / department…", value: "other" },
                    ]
              }
            />
            {type === "ISSUE" && form.to === "other" && (
              <Input label="Room / class / department" required value={form.issuedTo} placeholder="e.g. Class 5A, Science lab" onChange={(e) => set("issuedTo", e.target.value)} />
            )}
          </>
        )}

        <div className={styles.wide}>
          <Input
            label={type === "ADJUST" ? "Why (required)" : type === "WRITE_OFF" ? "Reason (required)" : "Note"}
            value={form.note}
            maxLength={300}
            placeholder={type === "ADJUST" ? "e.g. Annual stock check" : type === "WRITE_OFF" ? "e.g. Broken, expired" : ""}
            onChange={(e) => set("note", e.target.value)}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!form.itemId || !amountOk || !whoOk || !noteOk} onClick={submit}>
          Save
        </Button>
      </div>
    </Modal>
  );
};
