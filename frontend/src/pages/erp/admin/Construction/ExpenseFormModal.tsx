import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Button, FormGrid, FormSection, Input, Modal, Select } from "../../../../components/ui";
import { useUploadFileMutation } from "../../../../store/api/upload.api";
import {
  useCreateConstructionExpenseMutation,
  useUpdateConstructionExpenseMutation,
  type ConstructionExpense,
  type ConstructionExpenseCategory,
  type ConstructionPaymentMode,
  type ConstructionPaymentStatus,
  type ConstructionProject,
  type ExpenseInput,
} from "../../../../store/api/construction.api";
import {
  CATEGORY_LABEL,
  PAYMENT_MODE_LABEL,
  PAYMENT_STATUS_LABEL,
  getErrorMessage,
  newIdempotencyKey,
  toOptions,
  todayLocal,
} from "./constructionFormat";
import styles from "./ConstructionExpensePage.module.css";

interface FormValues {
  projectId: string;
  title: string;
  category: string;
  expenseDate: string;
  amount: string;
  paymentStatus: string;
  paymentMode: string;
  vendorName: string;
  vendorContact: string;
  invoiceNumber: string;
  notes: string;
}

interface ExpenseFormModalProps {
  projects: ConstructionProject[];
  expense?: ConstructionExpense | null; // set = edit mode
  onClose: () => void;
}

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

const ExpenseFormModal = ({ projects, expense, onClose }: ExpenseFormModalProps) => {
  const isEdit = !!expense;
  // One key per opened form: double-clicks and retries reuse it, so the server returns
  // the already-created expense rather than inserting a duplicate.
  const idempotencyKey = useRef(newIdempotencyKey());
  const [attachmentUrl, setAttachmentUrl] = useState<string>(expense?.attachmentUrl ?? "");

  const [createExpense, { isLoading: isCreating }] = useCreateConstructionExpenseMutation();
  const [updateExpense, { isLoading: isUpdating }] = useUpdateConstructionExpenseMutation();
  const [uploadFile, { isLoading: isUploading }] = useUploadFileMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      projectId: expense ? String(expense.projectId) : projects.length === 1 ? String(projects[0].id) : "",
      title: expense?.title ?? "",
      category: expense?.category ?? "",
      expenseDate: expense ? expense.expenseDate.slice(0, 10) : todayLocal(),
      amount: expense ? String(Number(expense.amount)) : "",
      paymentStatus: expense?.paymentStatus ?? "PAID",
      paymentMode: expense?.paymentMode ?? "",
      vendorName: expense?.vendorName ?? "",
      vendorContact: expense?.vendorContact ?? "",
      invoiceNumber: expense?.invoiceNumber ?? "",
      notes: expense?.notes ?? "",
    },
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }
    try {
      const res = await uploadFile({ file, folder: "school_erp/construction" }).unwrap();
      setAttachmentUrl(res.data.url);
      toast.success("Attachment uploaded");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to upload attachment"));
    }
  };

  const onSubmit = async (values: FormValues) => {
    const input: ExpenseInput = {
      projectId: Number(values.projectId),
      title: values.title.trim(),
      category: values.category as ConstructionExpenseCategory,
      expenseDate: values.expenseDate,
      amount: values.amount.trim(),
      paymentStatus: values.paymentStatus as ConstructionPaymentStatus,
      paymentMode: (values.paymentMode || null) as ConstructionPaymentMode | null,
      vendorName: values.vendorName.trim() || null,
      vendorContact: values.vendorContact.trim() || null,
      invoiceNumber: values.invoiceNumber.trim() || null,
      attachmentUrl: attachmentUrl || null,
      notes: values.notes.trim() || null,
    };

    try {
      if (isEdit) {
        await updateExpense({ id: expense!.id, input }).unwrap();
        toast.success("Expense updated");
      } else {
        await createExpense({ input, idempotencyKey: idempotencyKey.current }).unwrap();
        toast.success("Expense recorded");
      }
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, isEdit ? "Failed to update expense" : "Failed to record expense"));
    }
  };

  const isBusy = isCreating || isUpdating || isSubmitting;

  return (
    <Modal title={isEdit ? "Edit Construction Expense" : "Record Construction Expense"} size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormSection title="Expense Details">
          <FormGrid>
            <Select
              label="Project / Building"
              required
              placeholder="Select project"
              options={projects.map((p) => ({ label: p.name, value: String(p.id) }))}
              error={errors.projectId?.message}
              {...register("projectId", { required: "Project is required" })}
            />
            <Select
              label="Category"
              required
              placeholder="Select category"
              options={toOptions(CATEGORY_LABEL)}
              error={errors.category?.message}
              {...register("category", { required: "Category is required" })}
            />
            <div style={{ gridColumn: "1 / -1" }}>
              <Input
                label="Title / Description"
                required
                placeholder="e.g. 500 bags of cement (OPC 53)"
                error={errors.title?.message}
                {...register("title", {
                  required: "Title is required",
                  validate: (v) => v.trim().length > 0 || "Title is required",
                  maxLength: { value: 200, message: "At most 200 characters" },
                })}
              />
            </div>
            <Input
              label="Expense Date"
              type="date"
              required
              max={todayLocal()}
              error={errors.expenseDate?.message}
              {...register("expenseDate", {
                required: "Expense date is required",
                validate: (v) => v <= todayLocal() || "Expense date cannot be in the future",
              })}
            />
            <Input
              label="Amount (₹)"
              required
              inputMode="decimal"
              placeholder="0.00"
              error={errors.amount?.message}
              {...register("amount", {
                required: "Amount is required",
                validate: (v) => {
                  const s = v.trim();
                  if (!AMOUNT_RE.test(s)) return "Enter a valid amount (up to 2 decimal places)";
                  if (Number(s) <= 0) return "Amount must be greater than zero";
                  return true;
                },
              })}
            />
          </FormGrid>
        </FormSection>

        <FormSection title="Payment & Vendor">
          <FormGrid>
            <Select label="Payment Status" required options={toOptions(PAYMENT_STATUS_LABEL)} {...register("paymentStatus")} />
            <Select
              label="Payment Mode"
              options={[{ label: "Not specified", value: "" }, ...toOptions(PAYMENT_MODE_LABEL)]}
              {...register("paymentMode")}
            />
            <Input
              label="Vendor / Contractor"
              error={errors.vendorName?.message}
              {...register("vendorName", { maxLength: { value: 200, message: "At most 200 characters" } })}
            />
            <Input
              label="Vendor Contact"
              error={errors.vendorContact?.message}
              {...register("vendorContact", { maxLength: { value: 50, message: "At most 50 characters" } })}
            />
            <Input
              label="Invoice / Receipt No"
              error={errors.invoiceNumber?.message}
              {...register("invoiceNumber", { maxLength: { value: 100, message: "At most 100 characters" } })}
            />
            <div className={styles.field}>
              <span className={styles.label}>Invoice / Receipt Attachment</span>
              {attachmentUrl ? (
                <div className={styles.attachmentRow}>
                  <a href={attachmentUrl} target="_blank" rel="noreferrer">
                    View attachment
                  </a>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAttachmentUrl("")}>
                    Remove
                  </Button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className={styles.fileInput}
                  disabled={isUploading}
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              )}
              <span className={styles.hint}>{isUploading ? "Uploading…" : "Image or PDF up to 10MB"}</span>
            </div>
            <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.label} htmlFor="expense-notes">
                Remarks
              </label>
              <textarea
                id="expense-notes"
                rows={3}
                className={styles.textarea}
                {...register("notes", { maxLength: { value: 2000, message: "At most 2000 characters" } })}
              />
              {errors.notes?.message && <span className={styles.error}>{errors.notes.message}</span>}
            </div>
          </FormGrid>
        </FormSection>

        <div className={styles.formActions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isBusy} disabled={isUploading}>
            {isEdit ? "Save Changes" : "Record Expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ExpenseFormModal;
