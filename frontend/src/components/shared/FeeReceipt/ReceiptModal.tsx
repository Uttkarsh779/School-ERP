import { useRef } from "react";
import { Button, Modal, Spinner } from "../../ui";
import { useGetReceiptQuery } from "../../../store/api/fees.api";
import FeeReceipt, { type FeeReceiptData } from "./FeeReceipt";
import ScaledPaper from "../Print/ScaledPaper";
import { esc, printHtml } from "../Print/printDocument";
import { MODE_LABEL, periodLabel } from "../../../pages/erp/admin/Fees/feeUtils";

// Official receipt for one payment, loaded from the server (GET /payments/:id/receipt) so
// it always shows exactly what was recorded — amount, mode, reference and the fee items the
// payment settled. Used by the admin payment desk, the fee overview and the student portal.
// (The old "open the receipt URL in a new tab" approach couldn't send the login token.)
// Printing goes through the shared printHtml: straight to the print dialog on a computer, and a
// full-page A4 preview with "Print / Save as PDF" on phones. The app's stylesheets are copied
// in so the receipt looks the same as on screen.
const RECEIPT_WIDTH = 760; // the receipt's own layout width; phones show it scaled down to fit

const printReceipt = (el: HTMLElement | null, title: string) => {
  if (!el) return;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join("");
  printHtml(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}` +
      `<style>@page{size:A4 portrait;margin:12mm}html,body{background:#fff;margin:0}body{padding:0;display:block;min-height:0;place-items:initial;color-scheme:light}</style></head><body>${el.outerHTML}</body></html>`
  );
};

const ReceiptModal = ({ paymentId, onClose, extraNote }: { paymentId: number; onClose: () => void; extraNote?: string }) => {
  const { data, isLoading, isError } = useGetReceiptQuery(paymentId);
  const receiptRef = useRef<HTMLDivElement>(null);

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
            ? data.settledItems.map((i) => ({ description: i.feeHead, billingPeriod: i.periodLabel ?? periodLabel(i.billingPeriod), amount: i.amountAllocated }))
            : undefined,
        sessionName: data.sessionName ?? undefined,
        receivedBy: data.receivedBy ?? undefined,
        advanceAmount: data.advanceAmount ?? 0,
        status: data.status,
        school: data.school,
      }
    : null;

  return (
    <Modal title="Fee Receipt" size="lg" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !receipt ? (
        <p style={{ margin: 0, color: "var(--erp-text-muted)" }}>Couldn't load this receipt.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <ScaledPaper width={RECEIPT_WIDTH}>
            <div ref={receiptRef}>
              <FeeReceipt data={receipt} />
            </div>
          </ScaledPaper>
          {extraNote && <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{extraNote}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => printReceipt(receiptRef.current?.firstElementChild as HTMLElement | null, `Fee Receipt ${receipt.receiptNo}`)}>
              Print / Save as PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ReceiptModal;
