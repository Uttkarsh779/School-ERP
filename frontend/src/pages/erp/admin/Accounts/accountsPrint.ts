// Printable income & expense statement (A4 portrait): letterhead, month-by-month table with
// totals, category breakdown and signature lines.

import type { AccountSummary } from "../../../../store/api/accounts.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool } from "../../../../components/shared/Print/printDocument";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const money = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dmy = (iso: string) => iso.split("-").reverse().join("/");

export const printAccountSummary = (s: AccountSummary, school: (PrintSchool & { principalName?: string | null }) | null | undefined) => {
  const sch = school ?? {};
  const cons = s.showsConstruction;
  const rows = s.months
    .map(
      (m) => `<tr><td>${monthLabel(m.month)}</td><td class="r">${money(m.feeIncome)}</td><td class="r">${money(m.otherIncome)}</td>
        <td class="r">${money(m.expense)}</td>${cons ? `<td class="r">${money(m.construction)}</td>` : ""}<td class="r ${m.net < 0 ? "neg" : ""}"><b>${money(m.net)}</b></td></tr>`
    )
    .join("");
  const t = s.totals;
  const cat = (type: string) =>
    s.categories
      .filter((c) => c.type === type)
      .map((c) => `<tr><td>${esc(c.name)}</td><td class="r">${money(c.amount)}</td></tr>`)
      .join("") || `<tr><td colspan="2" class="muted">None</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Income &amp; Expense Statement ${dmy(s.from)} – ${dmy(s.to)}</title>
<style>
  @page { size: A4 portrait; margin: 11mm 10mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #c9ced6; }
  body { margin: 0; font: 9.4pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  h2 { margin: 12px 0 2px; text-align: center; font-size: 13pt; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); }
  .period { text-align: center; color: #5d6675; margin-bottom: 10px; }
  .boxes { display: flex; gap: 8px; margin-bottom: 10px; }
  .boxes div { flex: 1; border: 1px solid var(--line); border-radius: 4px; padding: 5px 8px; background: #f4f6f9; }
  .boxes span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #5d6675; font-weight: 700; }
  .boxes b { font-size: 11.5pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: var(--ink); color: #fff; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 6px; }
  td { padding: 3px 6px; border: 1px solid var(--line); }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .neg { color: #b42318; }
  tfoot td { background: #e9edf3; font-weight: 800; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  h3 { margin: 6px 0 4px; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: var(--ink); }
  .muted { color: #6b7380; }
  .note { font-size: 8pt; color: #5d6675; }
  .signs { display: flex; justify-content: space-between; margin-top: 46px; text-align: center; font-weight: 600; }
  .signs div { min-width: 170px; } .signs i { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>
  ${letterheadHtml(sch)}
  <h2>Income &amp; Expense Statement</h2>
  <div class="period">${dmy(s.from)} to ${dmy(s.to)}</div>
  <div class="boxes">
    <div><span>Fee collection</span><b>${money(t.feeIncome)}</b></div>
    <div><span>Other income</span><b>${money(t.otherIncome)}</b></div>
    <div><span>Expenses${cons ? " + construction" : ""}</span><b>${money(t.spent)}</b></div>
    <div><span>${t.net < 0 ? "Deficit" : "Surplus"}</span><b>${money(Math.abs(t.net))}</b></div>
  </div>
  <table>
    <thead><tr><th>Month</th><th class="r">Fee collection</th><th class="r">Other income</th><th class="r">Expenses</th>${cons ? '<th class="r">Construction</th>' : ""}<th class="r">Surplus / deficit</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td class="r">${money(t.feeIncome)}</td><td class="r">${money(t.otherIncome)}</td><td class="r">${money(t.expense)}</td>${cons ? `<td class="r">${money(t.construction)}</td>` : ""}<td class="r">${money(t.net)}</td></tr></tfoot>
  </table>
  <div class="two">
    <div><h3>Expenses by category</h3><table><tbody>${cat("EXPENSE")}</tbody></table></div>
    <div><h3>Other income by category</h3><table><tbody>${cat("INCOME")}</tbody></table></div>
  </div>
  <p class="note">Fee collection is the total of fee payments received, less refunds paid out. Voided entries are not included.</p>
  <div class="signs"><div><i></i>Accountant</div><div><i></i>Principal${sch.principalName ? `<div class="muted">${esc(sch.principalName)}</div>` : ""}</div></div>
</body></html>`;
  printHtml(html);
};
