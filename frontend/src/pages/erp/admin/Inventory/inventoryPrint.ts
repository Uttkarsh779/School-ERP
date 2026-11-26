// Inventory printouts (A4 portrait): stock register / stock-check sheet, and every document
// (goods receipt, issue slip with "received by" signature, return, adjustment).

import { KIND_LABEL, type InventoryDoc, type InventoryItem, type PendingReturn } from "../../../../store/api/inventory.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool } from "../../../../components/shared/Print/printDocument";

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const money = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const today = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

const CSS = `
  @page { size: A4 portrait; margin: 11mm 10mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #c9ced6; }
  body { margin: 0; font: 9.4pt/1.4 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  h2 { margin: 12px 0 2px; text-align: center; font-size: 13pt; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); }
  .period { text-align: center; color: #5d6675; margin-bottom: 10px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; margin: 8px 0 12px; }
  .meta div span { color: #5d6675; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { background: var(--ink); color: #fff; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 6px; }
  td { padding: 4px 6px; border: 1px solid var(--line); vertical-align: top; }
  tr.cat td { background: #e9edf3; font-weight: 800; text-transform: uppercase; font-size: 8pt; letter-spacing: .05em; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .low { color: #b42318; font-weight: 700; }
  .blank { min-width: 70px; }
  tfoot td { background: #e9edf3; font-weight: 800; }
  h3 { margin: 6px 0 4px; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: var(--ink); }
  .muted { color: #6b7380; font-size: 8pt; }
  .void { text-align: center; color: #b42318; font-weight: 800; font-size: 14pt; letter-spacing: .2em; border: 2px solid #b42318; padding: 4px; margin: 6px 0; }
  .signs { display: flex; justify-content: space-between; margin-top: 46px; text-align: center; font-weight: 600; gap: 12px; }
  .signs div { min-width: 150px; } .signs i { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
`;

export const printStockRegister = (items: InventoryItem[], pending: PendingReturn[], school: PrintSchool | null | undefined, opts: { blankCount?: boolean } = {}) => {
  const groups = new Map<string, InventoryItem[]>();
  for (const i of items) groups.set(i.category ?? "Other", [...(groups.get(i.category ?? "Other") ?? []), i]);
  const total = items.reduce((s, i) => s + (i.stockValue ?? 0), 0);
  const cols = opts.blankCount ? 6 : 7;
  const body = [...groups.entries()]
    .map(
      ([cat, list]) =>
        `<tr class="cat"><td colspan="${cols}">${esc(cat)}</td></tr>` +
        list
          .map(
            (i) => `<tr><td>${esc(i.name)}${i.location ? `<div class="muted">${esc(i.location)}</div>` : ""}</td><td>${esc(i.unit)}</td>
              <td class="r ${i.needsReorder ? "low" : ""}">${qty(i.stock)}${i.needsReorder ? " ▼" : ""}</td><td class="r">${i.issuedOut ? qty(i.issuedOut) : "—"}</td>
              ${opts.blankCount ? '<td class="blank"></td><td class="blank"></td>' : `<td class="r">${qty(i.total)}</td><td class="r">${money(i.lastRate)}</td><td class="r">${money(i.stockValue)}</td>`}</tr>`
          )
          .join("")
    )
    .join("");
  const pendingRows = pending.length
    ? pending.map((p) => `<tr><td>${esc(p.issueNo)}</td><td>${esc(p.holder)}</td><td>${esc(p.item)}</td><td class="r">${qty(p.out)} ${esc(p.unit)}</td><td>${dmy(p.issuedOn)}</td><td class="${p.overdue ? "low" : ""}">${dmy(p.expectedReturnOn)}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">Nothing is waiting to be returned.</td></tr>`;

  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${opts.blankCount ? "Stock check sheet" : "Stock register"} ${today()}</title><style>${CSS}</style></head><body>
  ${letterheadHtml(school ?? {})}
  <h2>${opts.blankCount ? "Stock Check Sheet" : "Stock Register"}</h2>
  <div class="period">As on ${today()}${opts.blankCount ? " · count each item in the store and write the quantity" : ""}</div>
  <table>
    <thead><tr><th>Item</th><th>Unit</th><th class="r">In store</th><th class="r">Issued out</th>${opts.blankCount ? "<th>Counted</th><th>Remarks</th>" : '<th class="r">Total owned</th><th class="r">Last rate</th><th class="r">Value in store</th>'}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}" class="muted">No items.</td></tr>`}</tbody>
    ${opts.blankCount ? "" : `<tfoot><tr><td colspan="6">Total value in store (latest rate)</td><td class="r">${money(Math.round(total * 100) / 100)}</td></tr></tfoot>`}
  </table>
  <h3>Pending returns (issued, not yet back)</h3>
  <table><thead><tr><th>Issue no.</th><th>With</th><th>Item</th><th class="r">Still out</th><th>Issued</th><th>Due back</th></tr></thead><tbody>${pendingRows}</tbody></table>
  <p class="muted">▼ at or below the reorder level. "In store" is what's on the shelf; "Issued out" is with staff and due back.</p>
  <div class="signs"><div><i></i>Store in-charge</div><div><i></i>Checked by</div><div><i></i>Principal</div></div>
</body></html>`);
};

export const printInventoryDoc = (d: InventoryDoc, school: PrintSchool | null | undefined) => {
  const isIssue = d.kind === "ISSUE";
  const isReceipt = d.kind === "RECEIPT" || d.kind === "OPENING";
  const meta: Array<[string, string | null]> = [
    ["Document no.", d.docNo],
    ["Date", dmy(d.docDate)],
    ...(isReceipt ? ([["Supplier", d.supplier], ["Bill no.", d.billNo]] as Array<[string, string | null]>) : []),
    ...(isIssue || d.kind === "RETURN" ? ([["Issued to", `${d.issuedTo ?? "—"}${d.staffCode ? ` (${d.staffCode})` : ""}`], ["Purpose", d.purpose]] as Array<[string, string | null]>) : []),
    ...(isIssue ? ([["Return by", d.expectedReturnOn ? dmy(d.expectedReturnOn) : null]] as Array<[string, string | null]>) : []),
    ...(d.issueNo ? ([["Against issue", d.issueNo]] as Array<[string, string | null]>) : []),
    ...(d.reasonLabel ? ([["Reason", d.reasonLabel]] as Array<[string, string | null]>) : []),
    ["Note", d.note],
  ];
  const head = isReceipt
    ? '<th>#</th><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Amount</th>'
    : isIssue
      ? "<th>#</th><th>Item</th><th class=\"r\">Qty</th><th>Unit</th><th>To be returned?</th><th>Serial / remark</th>"
      : '<th>#</th><th>Item</th><th class="r">Qty</th><th>Unit</th><th>Stock effect</th><th>Remark</th>';
  const rows = d.lines
    .map((l, i) => {
      const base = `<td>${i + 1}</td><td>${esc(l.item)}</td><td class="r">${qty(l.quantity)}</td><td>${esc(l.unit)}</td>`;
      if (isReceipt) return `<tr>${base}<td class="r">${money(l.rate)}</td><td class="r">${money(l.amount)}</td></tr>`;
      if (isIssue) return `<tr>${base}<td>${l.toReturn ? "Yes" : "No (consumed)"}</td><td>${esc(l.remark ?? "")}</td></tr>`;
      const effect = l.change > 0 ? `+${qty(l.change)} in` : l.change < 0 ? `−${qty(-l.change)} out` : l.condition === "DAMAGED" ? "Returned damaged" : "No change";
      return `<tr>${base}<td>${effect}</td><td>${esc(l.remark ?? "")}</td></tr>`;
    })
    .join("");
  const totalAmount = d.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const signs = isIssue
    ? "<div><i></i>Issued by (store)</div><div><i></i>Received by</div><div><i></i>Approved by</div>"
    : d.kind === "RETURN"
      ? "<div><i></i>Returned by</div><div><i></i>Received by (store)</div>"
      : "<div><i></i>Store in-charge</div><div><i></i>Checked by</div>";
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.docNo)}</title><style>${CSS}</style></head><body>
  ${letterheadHtml(school ?? {})}
  <h2>${esc(KIND_LABEL[d.kind])}</h2>
  ${d.isVoid ? `<div class="void">VOID — ${esc(d.voidReason ?? "")}</div>` : ""}
  <div class="meta">${meta
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><span>${esc(k)}:</span> <b>${esc(v!)}</b></div>`)
    .join("")}</div>
  <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody>
  ${isReceipt && totalAmount ? `<tfoot><tr><td colspan="5">Total</td><td class="r">${money(Math.round(totalAmount * 100) / 100)}</td></tr></tfoot>` : ""}</table>
  ${isIssue && d.lines.some((l) => l.toReturn) ? '<p class="muted">Items marked "Yes" are the school\'s property and must be returned in good condition.</p>' : ""}
  <p class="muted">Entered by ${esc(d.createdBy ?? "")}.</p>
  <div class="signs">${signs}</div>
</body></html>`);
};
