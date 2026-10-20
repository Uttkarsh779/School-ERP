import React, { useState } from "react";
import { toast } from "react-toastify";
import { Modal, Button, Input, Select } from "../../../../components/ui";
import { useCreateManualPaymentMutation } from "../../../../store/api/fees.api";
import styles from "./RecordStudentPaymentModal.module.css";

interface RecordStudentPaymentModalProps {
  student: {
    id: number;
    name: string;
    rollNo?: string;
    classSection?: {
      className: string;
      section: string;
    };
  };
  netDue: number;
  onClose: () => void;
}

const RecordStudentPaymentModal: React.FC<RecordStudentPaymentModalProps> = ({
  student,
  netDue,
  onClose,
}) => {
  const [createManualPayment, { isLoading }] = useCreateManualPaymentMutation();
  const [amount, setAmount] = useState<string>(netDue > 0 ? netDue.toString() : "");
  const [mode, setMode] = useState("CASH");
  const [transactionRef, setTransactionRef] = useState("");

  const numericAmount = parseFloat(amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (numericAmount <= 0) {
      toast.error("Payment amount must be greater than zero");
      return;
    }

    try {
      const res = await createManualPayment({
        studentId: student.id,
        amount: numericAmount,
        mode,
        transactionRef: transactionRef.trim() || undefined,
      }).unwrap();

      toast.success(
        `Payment of ₹${numericAmount.toLocaleString()} recorded for ${student.name}! (Receipt: ${res.receiptNumber || "Generated"})`
      );
      onClose();
    } catch (err: any) {
      toast.error(err.data?.message || err.message || "Failed to record payment");
    }
  };

  return (
    <Modal title={`Record Fee Payment — ${student.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.summaryBox}>
          <div className={styles.summaryItem}>
            <span>Student Outstanding Due</span>
            <span className={styles.outstandingValue}>₹{netDue.toLocaleString()}</span>
          </div>
          <div className={styles.summaryItem}>
            <span>Payment Amount</span>
            <span className={styles.totalValue}>₹{numericAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className={styles.paymentDetails}>
          <div className={styles.childInfo} style={{ borderBottom: "1px solid var(--erp-border)", paddingBottom: "0.75rem", marginBottom: "0.5rem" }}>
            <strong>{student.name}</strong>
            <div className={styles.childMeta}>
              {student.classSection
                ? `${student.classSection.className} - ${student.classSection.section}`
                : "Class N/A"}{" "}
              • Roll No: {student.rollNo || "N/A"}
            </div>
          </div>

          <div className={styles.grid}>
            <Input
              label="Amount to Pay (₹)"
              type="number"
              step="any"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              required
            />
            <Select
              label="Payment Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              options={[
                { label: "Cash", value: "CASH" },
                { label: "Bank Transfer / Cheque / DD", value: "BANK_TRANSFER" },
                { label: "UPI", value: "UPI_MANUAL" },
              ]}
              required
            />
          </div>

          <Input
            label="Transaction Ref / Cheque No"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            placeholder="e.g. UTR Number, Cheque No (optional)"
          />
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || numericAmount <= 0}>
            {isLoading ? "Recording..." : `Record ₹${numericAmount.toLocaleString()}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default RecordStudentPaymentModal;
