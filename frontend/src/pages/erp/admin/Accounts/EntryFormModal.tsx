import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import FileUploadField from "../../../../components/shared/FileUploadField/FileUploadField";
import {
  useCreateAccountEntryMutation,
  useGetAccountCategoriesQuery,
  useUpdateAccountEntryMutation,
  type AccountEntry,
  type AccountPaymentMode,
  type AccountType,
} from "../../../../store/api/accounts.api";
import { getErrorMessage } from "../Fees/feeUtils";
import styles from "./Accounts.module.css";

export const MODE_OPTIONS: Array<{ label: string; value: AccountPaymentMode }> = [
  { label: "Cash", value: "CASH" },
  { label: "Bank transfer", value: "BANK_TRANSFER" },
  { label: "UPI", value: "UPI" },
  { label: "Cheque", value: "CHEQUE" },
  { label: "Other", value: "OTHER" },
];

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// Add or edit one voucher. A key generated when the form opens stops a double-click from
// saving the same voucher twice.
const EntryFormModal = ({ type, entry, onClose }: { type: AccountType; entry?: AccountEntry | null; onClose: () => void }) => {
  const { data: categories = [] } = useGetAccountCategoriesQuery();
  const [create, { isLoading: creating }] = useCreateAccountEntryMutation();
  const [update, { isLoading: updating }] = useUpdateAccountEntryMutation();
  const [idempotencyKey] = useState(() => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`));
  const [form, setForm] = useState({
    entryDate: entry ? entry.entryDate.slice(0, 10) : today(),
    categoryId: entry ? String(entry.categoryId) : "",
    amount: entry ? String(Number(entry.amount)) : "",
    party: entry?.party ?? "",
    paymentMode: (entry?.paymentMode ?? "CASH") as AccountPaymentMode,
    referenceNo: entry?.referenceNo ?? "",
    billNumber: entry?.billNumber ?? "",
    description: entry?.description ?? "",
    attachmentUrl: entry?.attachmentUrl ?? null,
  });
  const set = (k: keyof typeof form, v: string | null) => setForm((f) => ({ ...f, [k]: v }));

  const options = useMemo(
    () =>
      categories
        .filter((c) => c.type === type && (c.isActive || c.id === entry?.categoryId))
        .map((c) => ({ label: c.name, value: String(c.id) })),
    [categories, type, entry]
  );
  const isExpense = type === "EXPENSE";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) return toast.error("Choose a category");
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast.error("Enter the amount");
    const body = {
      type,
      categoryId: Number(form.categoryId),
      entryDate: form.entryDate,
      amount,
      party: form.party,
      paymentMode: form.paymentMode,
      referenceNo: form.referenceNo,
      billNumber: form.billNumber,
      description: form.description,
      attachmentUrl: form.attachmentUrl,
    };
    try {
      if (entry) {
        await update({ id: entry.id, ...body }).unwrap();
        toast.success(`${entry.voucherNo} updated`);
      } else {
        const saved = await create({ ...body, idempotencyKey }).unwrap();
        toast.success(`Saved as ${saved.voucherNo}`);
      }
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't save the entry"));
    }
  };

  return (
    <Modal title={entry ? `Edit ${entry.voucherNo}` : isExpense ? "Add expense" : "Add income"} size="lg" onClose={onClose}>
      <form onSubmit={submit}>
        <div className={styles.formGrid}>
          <Input label="Date" type="date" required max={today()} value={form.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
          <Select
            label="Category"
            required
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            options={[{ label: "Choose…", value: "" }, ...options]}
          />
          <Input label="Amount (₹)" required inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          <Select label={isExpense ? "Paid by" : "Received by"} value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)} options={MODE_OPTIONS} />
          <Input
            label={isExpense ? "Paid to" : "Received from"}
            value={form.party}
            maxLength={120}
            placeholder={isExpense ? "e.g. UPPCL, Sharma Hardware" : "e.g. Parent name, bank"}
            onChange={(e) => set("party", e.target.value)}
          />
          <Input label="Cheque / UTR / reference no." value={form.referenceNo} maxLength={60} onChange={(e) => set("referenceNo", e.target.value)} />
          <Input label="Bill / invoice no." value={form.billNumber} maxLength={60} onChange={(e) => set("billNumber", e.target.value)} />
          <div className={styles.wide}>
            <Input
              label="Description"
              required
              value={form.description}
              maxLength={500}
              placeholder={isExpense ? "e.g. October electricity bill" : "e.g. Sale of admission forms (40 × ₹200)"}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className={styles.wide}>
            <FileUploadField label="Bill / receipt (photo or PDF)" folder="accounts" value={form.attachmentUrl} onChange={(url) => set("attachmentUrl", url)} />
          </div>
        </div>
        <div className={styles.actions}>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={creating || updating}>
            {entry ? "Save changes" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EntryFormModal;
