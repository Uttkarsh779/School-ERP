// Registration fee receipt (A5-ish half page on A4): printed by the office, or by the family
// from "Check application status" after paying online.

import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool } from "./printDocument";

export interface RegistrationReceipt {
  receiptNo: string;
  paidAt: string;
  amount: number;
  mode: string | null;
  reference: string | null;
  applicationNo: string;
  studentName: string;
  className: string;
  sessionName: string | null;
  receivedFrom: string;
}

const MODE: Record<string, string> = { ONLINE: "Online (Razorpay)", CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque" };
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const printRegistrationReceipt = (r: RegistrationReceipt, school: PrintSchool | null | undefined) => {
  const row = (k: string, v: string | null | undefined) => (v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : "");
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(r.receiptNo)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt/1.45 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .slip { max-width: 170mm; margin: 0 auto; border: 1px solid #c9ced6; border-radius: 6px; padding: 10mm; }
  h2 { margin: 10px 0 4px; text-align: center; font-size: 13pt; letter-spacing: .12em; text-transform: uppercase; color: #23395b; }
  .meta { display: flex; justify-content: space-between; color: #5d6675; margin-bottom: 10px; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; width: 38%; padding: 5px 8px; color: #5d6675; font-weight: 600; border-bottom: 1px solid #e3e6eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #e3e6eb; font-weight: 600; }
  .amount { margin: 14px 0 4px; padding: 10px 12px; background: #f4f6f9; border-radius: 4px; display: flex; justify-content: space-between; font-size: 12pt; }
  .amount b { font-size: 14pt; }
  .note { font-size: 8.5pt; color: #5d6675; margin-top: 10px; }
  .sign { margin-top: 40px; text-align: right; font-weight: 600; } .sign i { display: inline-block; width: 160px; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>
  <div class="slip">
    ${letterheadHtml(school ?? {})}
    <h2>Registration Fee Receipt</h2>
    <div class="meta"><span>Receipt no. <b>${esc(r.receiptNo)}</b></span><span>${esc(fmt(r.paidAt))}</span></div>
    <table>
      ${row("Application no.", r.applicationNo)}
      ${row("Child's name", r.studentName)}
      ${row("Class applied for", `${r.className}${r.sessionName ? ` (${r.sessionName})` : ""}`)}
      ${row("Received from", r.receivedFrom)}
      ${row("Paid by", MODE[r.mode ?? ""] ?? r.mode ?? "")}
      ${row("Reference", r.reference)}
    </table>
    <div class="amount"><span>Registration fee received</span><b>${money(r.amount)}</b></div>
    <p class="note">This fee is for processing the admission application. It does not confirm admission and is not refundable unless the school decides otherwise.</p>
    <div class="sign"><i></i><br/>${r.mode === "ONLINE" ? "Computer-generated receipt" : "Authorised signatory"}</div>
  </div>
</body></html>`);
};
