import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Modal } from "../../../../components/ui";
import { useVoidConstructionExpenseMutation, type ConstructionExpense } from "../../../../store/api/construction.api";
import { formatINR, getErrorMessage } from "./constructionFormat";
import styles from "./ConstructionExpensePage.module.css";

// The ConfirmDialog has no input, and voiding needs a recorded reason — so this is the
// same confirm layout with a required reason field.
const VoidExpenseModal = ({ expense, onClose }: { expense: ConstructionExpense; onClose: () => void }) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voidExpense, { isLoading }] = useVoidConstructionExpenseMutation();

  const handleConfirm = async () => {
    if (reason.trim().length < 5) {
      setError("Please give a reason of at least 5 characters");
      return;
    }
    try {
      await voidExpense({ id: expense.id, reason: reason.trim() }).unwrap();
      toast.success("Expense voided");
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to void expense"));
    }
  };

  return (
    <Modal title="Void expense?" onClose={onClose}>
      <p className={styles.confirmMessage}>
        "{expense.title}" ({formatINR(expense.amount)}) will be excluded from all totals. The record and its history stay
        on file for audit and cannot be edited afterwards.
      </p>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="void-reason">
          Reason<span className={styles.required}>*</span>
        </label>
        <textarea
          id="void-reason"
          rows={3}
          className={styles.textarea}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Duplicate entry of invoice #1042"
        />
        {error && <span className={styles.error}>{error}</span>}
      </div>
      <div className={styles.formActions}>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={handleConfirm} isLoading={isLoading}>
          Void Expense
        </Button>
      </div>
    </Modal>
  );
};

export default VoidExpenseModal;
