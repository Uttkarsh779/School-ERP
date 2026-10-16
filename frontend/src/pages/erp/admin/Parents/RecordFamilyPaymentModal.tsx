import React, { useState } from "react";
import { toast } from "react-toastify";
import { Modal, Button, Input, Select } from "../../../../components/ui";
import { useRecordFamilyPaymentMutation } from "../../../../store/api/fees.api";
import type { IParentDuesSummary } from "../../../../store/api/parents.api";
import styles from "./RecordFamilyPaymentModal.module.css";

interface RecordFamilyPaymentModalProps {
  parentId: number;
  duesSummary: IParentDuesSummary;
  onClose: () => void;
}

const RecordFamilyPaymentModal = ({ parentId, duesSummary, onClose }: RecordFamilyPaymentModalProps) => {
  const [recordFamilyPayment, { isLoading }] = useRecordFamilyPaymentMutation();
  const [mode, setMode] = useState("CASH");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  
  // Initialize allocation amounts to fully pay all outstanding dues by default
  const [allocations, setAllocations] = useState<Record<number, string>>(
    duesSummary.childrenSummaries.reduce((acc, child) => {
      acc[child.student.id] = child.dueSummary.netPayable.toString();
      return acc;
    }, {} as Record<number, string>)
  );

  const totalPayment = Object.values(allocations).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

  const handleAllocationChange = (studentId: number, value: string) => {
    // Basic validation to prevent non-numeric characters, allow empty string for backspace
    if (value && !/^\d*\.?\d*$/.test(value)) return;
    setAllocations(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (totalPayment <= 0) {
      toast.error("Total payment amount must be greater than zero");
      return;
    }

    const allocationsList = Object.entries(allocations)
      .map(([studentId, amountStr]) => ({
        studentId: Number(studentId),
        amount: parseFloat(amountStr) || 0,
      }))
      .filter(a => a.amount > 0);

    try {
      await recordFamilyPayment({
        parentGuardianId: parentId,
        totalAmount: totalPayment,
        mode,
        transactionRef,
        notes,
        allocations: allocationsList,
      }).unwrap();
      
      toast.success("Family payment recorded successfully!");
      onClose();
    } catch (err: any) {
      toast.error(err.data?.message || "Failed to record family payment");
    }
  };

  return (
    <Modal title="Record Family Payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        
        <div className={styles.summaryBox}>
          <div className={styles.summaryItem}>
            <span>Family Outstanding Due</span>
            <span className={styles.outstandingValue}>₹{duesSummary.familyTotal.toLocaleString()}</span>
          </div>
          <div className={styles.summaryItem}>
            <span>Total Payment Amount</span>
            <span className={styles.totalValue}>₹{totalPayment.toLocaleString()}</span>
          </div>
        </div>

        <div className={styles.allocationsSection}>
          <h4 className={styles.sectionTitle}>Allocate to Children</h4>
          <p className={styles.sectionSubtitle}>Specify how much of the payment goes to each child.</p>
          
          <div className={styles.allocationList}>
            {duesSummary.childrenSummaries.map((child) => (
              <div key={child.student.id} className={styles.allocationRow}>
                <div className={styles.childInfo}>
                  <strong>{child.student.name}</strong>
                  <div className={styles.childMeta}>
                    Class {child.student.classSection?.className} {child.student.classSection?.section} • Due: ₹{child.dueSummary.netPayable.toLocaleString()}
                  </div>
                </div>
                <div className={styles.inputWrapper}>
                  <span className={styles.currencyPrefix}>₹</span>
                  <input
                    type="text"
                    className={styles.allocationInput}
                    value={allocations[child.student.id] || ""}
                    onChange={(e) => handleAllocationChange(child.student.id, e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.paymentDetails}>
          <h4 className={styles.sectionTitle}>Payment Details</h4>
          <div className={styles.grid}>
            <Select
              label="Payment Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              options={[
                { label: "Cash", value: "CASH" },
                { label: "Bank Transfer", value: "BANK_TRANSFER" },
                { label: "UPI", value: "UPI_MANUAL" },
                { label: "Cheque / DD", value: "CHEQUE" },
              ]}
              required
            />
            <Input
              label="Transaction Ref / Cheque No"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. UTR Number"
            />
          </div>
          <Input
            label="Internal Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for admin..."
          />
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || totalPayment <= 0}>
            {isLoading ? "Processing..." : `Record Payment of ₹${totalPayment.toLocaleString()}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default RecordFamilyPaymentModal;
