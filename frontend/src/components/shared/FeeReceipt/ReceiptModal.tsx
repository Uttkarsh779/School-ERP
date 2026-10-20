import { useRef } from "react";
import { Button, Modal, Spinner } from "../../ui";
import { useGetReceiptQuery } from "../../../store/api/fees.api";
import FeeReceipt, { type FeeReceiptData } from "./FeeReceipt";
import { MODE_LABEL, inr, periodLabel } from "../../../pages/erp/admin/Fees/feeUtils";

// Official receipt for one payment, loaded from the server (GET /payments/:id/receipt) so
// it always shows exactly what was recorded — amount, mode, reference and the fee items the
// payment settled. Used by the admin payment desk, the fee overview and the student portal.
// (The old "open the receipt URL in a new tab" approach couldn't send the login token.)
// Prints just the receipt from a hidden iframe (with the app's stylesheets copied in), so the
// modal around it can't clip or shift it on paper. "Save as PDF" works from the same dialog.
const printReceipt = (el: HTMLElement | null, title: string) => {
  if (!el) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join("");
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title>${styles}` +
      `<style>@page{size:A4 portrait;margin:12mm}html,body{background:#fff;margin:0}body{padding:0;display:block;min-height:0;place-items:initial}</style></head><body>${el.outerHTML}</body></html>`
  );
  doc.close();
  const go = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  };
  // Wait for stylesheets and the logo image before printing.
  const imgs = [...doc.images].filter((i) => !i.complete);
  let pending = imgs.length + 1;
  const done = () => --pending <= 0 && setTimeout(go, 150);
  imgs.forEach((i) => {
    i.addEventListener("load", done);
    i.addEventListener("error", done);
  });
  if (doc.readyState === "complete") done();
  else win.addEventListener("load", done);
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

  const shareWhatsApp = () => {
    if (!data || !receipt) return;
    const phone = (data.student.contact ?? "").replace(/\D/g, "").slice(-10);
    const lines = [
      `*${data.school?.name ?? "School"} — Fee Receipt ${receipt.receiptNo}*`,
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
          <div ref={receiptRef}>
            <FeeReceipt data={receipt} />
          </div>
          {extraNote && <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{extraNote}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={shareWhatsApp}>
              Share on WhatsApp
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
