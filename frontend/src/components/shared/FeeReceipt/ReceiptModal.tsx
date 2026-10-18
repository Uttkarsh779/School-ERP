import { Button, Modal, Spinner } from "../../ui";
import { useGetReceiptQuery } from "../../../store/api/fees.api";
import FeeReceipt, { type FeeReceiptData } from "./FeeReceipt";
import { MODE_LABEL, inr, periodLabel } from "../../../pages/erp/admin/Fees/feeUtils";

// Official receipt for one payment, loaded from the server (GET /payments/:id/receipt) so
// it always shows exactly what was recorded — amount, mode, reference and the fee items the
// payment settled. Used by the admin payment desk, the fee overview and the student portal.
// (The old "open the receipt URL in a new tab" approach couldn't send the login token.)
const ReceiptModal = ({ paymentId, onClose, extraNote }: { paymentId: number; onClose: () => void; extraNote?: string }) => {
  const { data, isLoading, isError } = useGetReceiptQuery(paymentId);

  const receipt: FeeReceiptData | null = data
    ? {
        receiptNo: data.receiptNumber ?? data.paymentNumber,
        paidAt: new Date(data.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        studentName: data.student.name,
        admissionNo: data.student.admissionNo,
        rollNo: data.student.rollNo,
        className: data.student.classSection,
        fatherName: data.student.fatherName ?? undefined,
        contactNumber: data.student.contact ?? undefined,
        mode: MODE_LABEL[data.mode] ?? data.mode,
        transactionRef: data.transactionRef ?? data.razorpayPaymentId ?? undefined,
        amountPaid: data.amountPaid,
        items:
          data.settledItems.length > 0
            ? data.settledItems.map((i) => ({ description: i.feeHead, billingPeriod: periodLabel(i.billingPeriod), amount: i.amountAllocated }))
            : undefined,
      }
    : null;

  const shareWhatsApp = () => {
    if (!data || !receipt) return;
    const phone = (data.student.contact ?? "").replace(/\D/g, "").slice(-10);
    const lines = [
      `*Fee Receipt ${receipt.receiptNo}*`,
      `Date: ${receipt.paidAt}`,
      `Student: ${receipt.studentName} (${receipt.className}, Adm. ${receipt.admissionNo})`,
      `Amount paid: ${inr(receipt.amountPaid)} via ${receipt.mode}`,
      receipt.transactionRef ? `Reference: ${receipt.transactionRef}` : null,
      ...(data.settledItems.length ? ["", "Settled:", ...data.settledItems.map((i) => `• ${i.feeHead} ${periodLabel(i.billingPeriod)}: ${inr(i.amountAllocated)}`)] : []),
      "",
      "Thank you.",
    ].filter((l) => l !== null);
    const text = encodeURIComponent(lines.join("\n"));
    window.open(phone.length === 10 ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <Modal title="Fee Receipt" size="lg" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !receipt ? (
        <p style={{ margin: 0, color: "var(--erp-text-muted)" }}>Couldn't load this receipt.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <FeeReceipt data={receipt} />
          {extraNote && <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{extraNote}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={shareWhatsApp}>
              Share on WhatsApp
            </Button>
            <Button onClick={() => window.print()}>Print receipt</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ReceiptModal;
