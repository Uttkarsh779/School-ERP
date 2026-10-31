// Printable fee day book (A4 portrait) for closing the counter: totals by payment mode and
// by who collected, every receipt, cancelled receipts and refunds, with signature lines for
// the cashier and the accountant / principal.

import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool } from "../../../../../components/shared/Print/printDocument";
import type { DayBook } from "../../../../../store/api/fees.api";
import { MODE_LABEL } from "../feeUtils";

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const time = (d: string | null) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");
const dateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";

export const printDayBook = (book: DayBook, school: PrintSchool | null | undefined, printedBy?: string | null) => {
  const single = book.from === book.to;
  const period = single ? day(book.from) : `${day(book.from)} to ${day(book.to)}`;
  const summary = (rows: DayBook["byMode"], label: (k: string) => string) =>
    rows.map((r) => `<tr><td>${esc(label(r.key))}</td><td class="r">${r.count}</td><td class="r"><b>${money(r.amount)}</b></td></tr>`).join("") ||
    '<tr><td colspan="3" class="muted">No collections</td></tr>';

  const receipts = book.receipts
    .map(
      (r, i) => `<tr>
        <td class="r">${i + 1}</td>
        <td>${esc(single ? time(r.paidAt) : dateTime(r.paidAt))}</td>
        <td>${esc(r.receiptNumber)}</td>
        <td><b>${esc(r.student)}</b><div class="muted">${esc(r.admissionNo)}${r.className ? ` · ${esc(r.className)}` : ""}</div></td>
        <td>${esc(MODE_LABEL[r.mode] ?? r.mode)}${r.transactionRef ? `<div class="muted">${esc(r.transactionRef)}</div>` : ""}</td>
        <td>${esc(r.collectedBy)}</td>
        <td class="r"><b>${money(r.amount)}</b></td>
      </tr>`
    )
    .join("");

  const cancelled = book.cancelled.length
    ? `<h3>Cancelled receipts (not counted)</h3>
      <table><thead><tr><th>Receipt</th><th>Student</th><th>Cancelled</th><th>Reason</th><th class="r">Amount</th></tr></thead><tbody>
      ${book.cancelled
        .map(
          (r) =>
            `<tr><td>${esc(r.receiptNumber)}</td><td>${esc(r.student)}</td><td>${esc(dateTime(r.cancelledAt))}${r.cancelledBy ? ` by ${esc(r.cancelledBy)}` : ""}</td><td>${esc(r.cancelReason ?? "—")}</td><td class="r strike">${money(r.amount)}</td></tr>`
        )
        .join("")}</tbody></table>`
    : "";

  const refunds = book.refunds.length
    ? `<h3>Refunds paid out</h3>
      <table><thead><tr><th>Refund</th><th>Student</th><th>Paid</th><th>Reason</th><th class="r">Amount</th></tr></thead><tbody>
      ${book.refunds
        .map((r) => `<tr><td>${esc(r.refundNumber)}</td><td>${esc(r.student)}</td><td>${esc(dateTime(r.processedAt))}</td><td>${esc(r.reason)}</td><td class="r">${money(r.amount)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";

  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(`Fee day book — ${period}`)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 9mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #c4cad3; --soft: #eef1f6; }
  body { margin: 0; font: 8.8pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  h2 { margin: 10px 0 2px; text-align: center; font-size: 13pt; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
  .period { text-align: center; font-weight: 600; color: #4a5361; margin-bottom: 10px; }
  .totals { display: flex; gap: 8px; margin-bottom: 10px; }
  .totals div { flex: 1; border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; background: var(--soft); }
  .totals span { display: block; font-size: 7.6pt; color: #4a5361; }
  .totals b { font-size: 12pt; }
  .two { display: flex; gap: 10px; margin-bottom: 10px; }
  .two > table { flex: 1; }
  h3 { margin: 12px 0 4px; font-size: 9.6pt; color: var(--ink); }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid var(--line); padding: 3px 5px; text-align: left; vertical-align: top; }
  thead th { background: var(--ink); color: #fff; font-weight: 600; font-size: 8pt; }
  tr { break-inside: avoid; }
  .r { text-align: right; white-space: nowrap; }
  .muted { color: #6b7380; font-size: 7.6pt; }
  .strike { text-decoration: line-through; color: #8a93a1; }
  .grand td { background: var(--soft); font-weight: 700; }
  .signs { display: flex; justify-content: space-between; gap: 30px; margin-top: 40px; text-align: center; font-weight: 600; break-inside: avoid; }
  .signs div { flex: 1; max-width: 55mm; border-top: 1px solid #1b2430; padding-top: 3px; }
  .foot { margin-top: 10px; font-size: 7.6pt; color: #6b7380; }
</style></head><body>
  ${letterheadHtml(school ?? {})}
  <h2>Fee Day Book</h2>
  <div class="period">${esc(period)}</div>
  <div class="totals">
    <div><span>Collected</span><b>${money(book.totals.collected)}</b></div>
    <div><span>Receipts</span><b>${book.totals.receipts}</b></div>
    <div><span>Refunds paid</span><b>${money(book.totals.refunded)}</b></div>
    <div><span>Net</span><b>${money(book.totals.net)}</b></div>
  </div>
  <div class="two">
    <table><thead><tr><th>Payment mode</th><th class="r">Receipts</th><th class="r">Amount</th></tr></thead><tbody>${summary(book.byMode, (k) => MODE_LABEL[k] ?? k)}</tbody></table>
    <table><thead><tr><th>Collected by</th><th class="r">Receipts</th><th class="r">Amount</th></tr></thead><tbody>${summary(book.byCollector, (k) => k)}</tbody></table>
  </div>
  ${
    book.byDay.length
      ? `<h3>Day-wise</h3><table><thead><tr><th>Date</th><th class="r">Receipts</th><th class="r">Amount</th></tr></thead><tbody>${summary(book.byDay, day)}</tbody></table>`
      : ""
  }
  <h3>Receipts</h3>
  <table>
    <thead><tr><th class="r">#</th><th>${single ? "Time" : "Date & time"}</th><th>Receipt</th><th>Student</th><th>Mode</th><th>Collected by</th><th class="r">Amount</th></tr></thead>
    <tbody>${receipts || '<tr><td colspan="7" class="muted">No receipts</td></tr>'}
      <tr class="grand"><td colspan="6">Total (${book.totals.receipts} receipts)</td><td class="r">${money(book.totals.collected)}</td></tr>
    </tbody>
  </table>
  ${cancelled}
  ${refunds}
  <div class="signs"><div>Cashier</div><div>Accountant</div><div>Principal</div></div>
  <div class="foot">Printed ${esc(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}${printedBy ? ` by ${esc(printedBy)}` : ""}</div>
</body></html>`);
};
