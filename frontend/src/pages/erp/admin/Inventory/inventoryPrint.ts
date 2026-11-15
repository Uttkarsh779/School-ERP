// Printable stock register (A4 portrait): letterhead, items by category with stock, low-stock
// flag and value, then returnable items currently with staff. Signature lines for a stock check.

import type { HeldItem, InventoryItem } from "../../../../store/api/inventory.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool } from "../../../../components/shared/Print/printDocument";

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const money = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const dmy = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const today = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

export const printStockRegister = (items: InventoryItem[], held: HeldItem[], school: PrintSchool | null | undefined, opts: { blankCount?: boolean } = {}) => {
  const groups = new Map<string, InventoryItem[]>();
  for (const i of items) groups.set(i.category ?? "Other", [...(groups.get(i.category ?? "Other") ?? []), i]);
  const total = items.reduce((s, i) => s + (i.stockValue ?? 0), 0);
  const body = [...groups.entries()]
    .map(
      ([cat, list]) =>
        `<tr class="cat"><td colspan="${opts.blankCount ? 6 : 6}">${esc(cat)}</td></tr>` +
        list
          .map(
            (i) => `<tr><td>${esc(i.name)}${i.location ? `<div class="muted">${esc(i.location)}</div>` : ""}</td><td>${esc(i.unit)}</td>
              <td class="r ${i.isLow ? "low" : ""}">${qty(i.stock)}${i.isLow ? " ▼" : ""}</td><td class="r">${i.withStaff ? qty(i.withStaff) : "—"}</td>
              ${opts.blankCount ? '<td class="blank"></td><td class="blank"></td>' : `<td class="r">${money(i.lastUnitCost)}</td><td class="r">${money(i.stockValue)}</td>`}</tr>`
          )
          .join("")
    )
    .join("");
  const heldRows = held.length
    ? held.map((h) => `<tr><td>${esc(h.item)}</td><td>${esc(h.holder)}</td><td class="r">${qty(h.quantity)} ${esc(h.unit)}</td><td>${dmy(h.since)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">Nothing is out with staff.</td></tr>`;

  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Stock register ${today()}</title>
<style>
  @page { size: A4 portrait; margin: 11mm 10mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #c9ced6; }
  body { margin: 0; font: 9.2pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  h2 { margin: 12px 0 2px; text-align: center; font-size: 13pt; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); }
  .period { text-align: center; color: #5d6675; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: var(--ink); color: #fff; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 6px; }
  td { padding: 3px 6px; border: 1px solid var(--line); vertical-align: top; }
  tr.cat td { background: #e9edf3; font-weight: 800; text-transform: uppercase; font-size: 8pt; letter-spacing: .05em; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .low { color: #b42318; font-weight: 700; }
  .blank { min-width: 70px; }
  tfoot td { background: #e9edf3; font-weight: 800; }
  h3 { margin: 6px 0 4px; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: var(--ink); }
  .muted { color: #6b7380; font-size: 8pt; }
  .signs { display: flex; justify-content: space-between; margin-top: 46px; text-align: center; font-weight: 600; }
  .signs div { min-width: 170px; } .signs i { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>
  ${letterheadHtml(school ?? {})}
  <h2>${opts.blankCount ? "Stock Check Sheet" : "Stock Register"}</h2>
  <div class="period">As on ${today()}${opts.blankCount ? " · write the counted quantity for each item" : ""}</div>
  <table>
    <thead><tr><th>Item</th><th>Unit</th><th class="r">In stock</th><th class="r">With staff</th>${opts.blankCount ? "<th>Counted</th><th>Remarks</th>" : '<th class="r">Cost / unit</th><th class="r">Value</th>'}</tr></thead>
    <tbody>${body || '<tr><td colspan="6" class="muted">No items.</td></tr>'}</tbody>
    ${opts.blankCount ? "" : `<tfoot><tr><td colspan="5">Total value (latest cost)</td><td class="r">${money(Math.round(total * 100) / 100)}</td></tr></tfoot>`}
  </table>
  <h3>Returnable items with staff</h3>
  <table><thead><tr><th>Item</th><th>With</th><th class="r">Qty</th><th>Since</th></tr></thead><tbody>${heldRows}</tbody></table>
  <p class="muted">▼ at or below the low-stock level. Value uses the latest purchase cost entered for each item.</p>
  <div class="signs"><div><i></i>Store in-charge</div><div><i></i>Checked by</div><div><i></i>Principal</div></div>
</body></html>`);
};
