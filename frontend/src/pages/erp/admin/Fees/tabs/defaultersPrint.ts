// Printable fee defaulters list (A4 portrait): school letterhead, the filters used, one
// table grouped by class with subtotals, a grand total and signature lines. Printed from a
// hidden iframe with its own styles, so nothing from the app screen ends up on paper.

export interface PrintDefaulter {
  studentName: string;
  fatherName?: string | null;
  admissionNo: string;
  rollNo: string;
  classSection: string;
  contactNumber: string | null;
  overdueMonths?: string[];
  overdueChargesCount: number;
  totalDue: number;
  oldestDueDate: string | null;
  daysOverdue: number;
}

export interface PrintSchool {
  schoolName?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  boardName?: string | null;
  affiliationNo?: string | null;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const date = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: string | null) => {
  if (!d) return "—";
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, "0")} ${MON[x.getMonth()]} ${x.getFullYear()}`;
};
// ["Apr 2026","May 2026","Jun 2026","Aug 2026"] -> "Apr – Jun, Aug 2026"
const monthRanges = (labels: string[] = []) => {
  const idx = labels
    .map((l) => {
      const [m, y] = l.split(" ");
      return Number(y) * 12 + MON.indexOf(m);
    })
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!idx.length) return "—";
  const runs: Array<[number, number]> = [];
  for (const n of idx) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  const lab = (n: number, withYear: boolean) => `${MON[n % 12]}${withYear ? ` ${Math.floor(n / 12)}` : ""}`;
  const parts = runs.map(([a, b], i) => {
    const nextYear = i < runs.length - 1 ? Math.floor(runs[i + 1][0] / 12) : null;
    const showYear = nextYear !== Math.floor(b / 12);
    if (a === b) return lab(a, showYear);
    return Math.floor(a / 12) === Math.floor(b / 12) ? `${lab(a, false)} – ${lab(b, showYear)}` : `${lab(a, true)} – ${lab(b, showYear)}`;
  });
  return parts.join(", ");
};

// Nursery < LKG < UKG < Class 1 < … < Class 12 (then anything else alphabetically).
const classRank = (name: string) => {
  const n = name.toLowerCase();
  if (/play|pre[\s-]*nur/.test(n)) return 1;
  if (/nursery/.test(n)) return 2;
  if (/lkg|lower kg|kg\s*-?\s*1/.test(n)) return 3;
  if (/ukg|upper kg|kg\s*-?\s*2|\bkg\b/.test(n)) return 4;
  const d = n.match(/\d+/);
  return d ? 100 + Number(d[0]) : 999;
};

const rollKey = (r: string) => (Number.isFinite(Number(r)) ? Number(r) : Number.MAX_SAFE_INTEGER);

export const printDefaultersReport = (
  rows: PrintDefaulter[],
  opts: { school?: PrintSchool | null; filters: string[]; preparedBy?: string | null }
) => {
  const school = opts.school ?? {};
  const generated = new Date();

  // Group by class (in class order), students by roll number.
  const groups = new Map<string, PrintDefaulter[]>();
  for (const r of rows) groups.set(r.classSection, [...(groups.get(r.classSection) ?? []), r]);
  const classOrder = [...groups.keys()].sort((a, b) => classRank(a) - classRank(b) || a.localeCompare(b, "en", { numeric: true }));
  const grand = rows.reduce((s, r) => s + r.totalDue, 0);
  const over60 = rows.filter((r) => r.daysOverdue > 60).length;

  let sno = 0;
  const body = classOrder
    .map((cls) => {
      const list = [...groups.get(cls)!].sort((a, b) => rollKey(a.rollNo) - rollKey(b.rollNo) || a.studentName.localeCompare(b.studentName));
      const subtotal = list.reduce((s, r) => s + r.totalDue, 0);
      const lines = list
        .map(
          (r) => `<tr>
            <td class="c">${++sno}</td>
            <td><b>${esc(r.studentName)}</b>${r.fatherName ? `<div class="sub">S/D of ${esc(r.fatherName)}</div>` : ""}</td>
            <td>${esc(r.admissionNo)}</td>
            <td class="c">${esc(r.rollNo || "—")}</td>
            <td>${esc(r.contactNumber || "—")}</td>
            <td>${esc(monthRanges(r.overdueMonths))}</td>
            <td class="nw">${shortDate(r.oldestDueDate)}<div class="sub">${r.daysOverdue} days overdue</div></td>
            <td class="r"><b>${money(r.totalDue)}</b></td>
          </tr>`
        )
        .join("");
      return `<tbody class="group">
        <tr class="classRow"><td colspan="8">${esc(cls)} <span>· ${list.length} student${list.length === 1 ? "" : "s"}</span></td></tr>
        ${lines}
        <tr class="subRow"><td colspan="7">Subtotal — ${esc(cls)}</td><td class="r">${money(subtotal)}</td></tr>
      </tbody>`;
    })
    .join("");

  const affiliation = [school.boardName && `Affiliated to ${school.boardName}`, school.affiliationNo && `Affiliation No. ${school.affiliationNo}`].filter(Boolean).join(" · ");
  const contact = [school.phone && `Ph: ${school.phone}`, school.email].filter(Boolean).join(" · ");
  const logo = school.logoUrl && /^https?:\/\//.test(school.logoUrl) ? `<img class="logo" src="${esc(school.logoUrl)}" alt="">` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fee Defaulters List — ${esc(date(generated))}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm 13mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 8.6pt/1.3 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #23395b; padding-bottom: 8px; }
  .logo { width: 54px; height: 54px; object-fit: contain; }
  .school { flex: 1; text-align: center; }
  .school h1 { margin: 0; font: 700 15pt Georgia, "Times New Roman", serif; letter-spacing: .04em; text-transform: uppercase; color: #23395b; }
  .school div { font-size: 8.5pt; color: #5d6675; }
  .spacer { width: 54px; }
  .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 10px 0 6px; }
  .title h2 { margin: 0; font-size: 13pt; letter-spacing: .12em; text-transform: uppercase; }
  .meta { font-size: 8.5pt; color: #5d6675; text-align: right; }
  .summary { display: flex; gap: 8px; margin: 6px 0 10px; }
  .summary div { flex: 1; border: 1px solid #c9ced6; border-radius: 4px; padding: 5px 8px; background: #f4f6f9; }
  .summary span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; color: #5d6675; font-weight: 700; }
  .summary b { font-size: 11.5pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #23395b; color: #fff; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 4px 5px; border: 1px solid #23395b; }
  td { padding: 2.5px 5px; border: 1px solid #c9ced6; vertical-align: top; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .nw { white-space: nowrap; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .sub { font-size: 7.2pt; color: #5d6675; line-height: 1.15; }
  .classRow td { background: #e9edf3; font-weight: 700; color: #23395b; border-top: 2px solid #9aa3af; }
  .classRow span { font-weight: 400; color: #5d6675; }
  .subRow td { background: #f7f8fa; font-weight: 700; text-align: right; }
  .grand td { background: #23395b; color: #fff; font-weight: 800; font-size: 10.5pt; text-align: right; border-color: #23395b; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 34px; font-size: 8.5pt; color: #5d6675; page-break-inside: avoid; }
  .sign { text-align: center; min-width: 170px; } .sign div { border-top: 1px solid #1b2430; margin-bottom: 3px; }
  .note { margin-top: 8px; font-size: 7.8pt; color: #5d6675; }
</style></head><body>
  <div class="head">${logo || '<span class="spacer"></span>'}
    <div class="school">
      <h1>${esc(school.schoolName || "School")}</h1>
      ${school.address ? `<div>${esc(school.address)}</div>` : ""}
      ${contact ? `<div>${esc(contact)}</div>` : ""}
      ${affiliation ? `<div>${esc(affiliation)}</div>` : ""}
    </div><span class="spacer"></span>
  </div>
  <div class="title">
    <h2>Fee Defaulters List</h2>
    <div class="meta">${opts.filters.map(esc).join(" · ")}<br>Generated on ${esc(generated.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</div>
  </div>
  <div class="summary">
    <div><span>Students</span><b>${rows.length}</b></div>
    <div><span>Classes</span><b>${classOrder.length}</b></div>
    <div><span>Overdue 60+ days</span><b>${over60}</b></div>
    <div><span>Total amount due</span><b>${money(grand)}</b></div>
  </div>
  <table>
    <thead><tr>
      <th class="c" style="width:5%">S.No</th><th style="width:23%">Student</th><th style="width:12%">Adm. No</th><th class="c" style="width:5%">Roll</th>
      <th style="width:12%">Contact</th><th style="width:17%">Overdue months</th><th style="width:13%">Due since</th><th class="r" style="width:13%">Amount due</th>
    </tr></thead>
    ${body}
    <tbody><tr class="grand"><td colspan="7">Grand total (${rows.length} students)</td><td class="r">${money(grand)}</td></tr></tbody>
  </table>
  <div class="note">Amounts include late fees as per the school's rule, as on the date above. Students are listed class-wise by roll number.</div>
  <div class="foot">
    <div>${opts.preparedBy ? `Prepared by: ${esc(opts.preparedBy)}` : ""}</div>
    <div class="sign"><div></div>Accountant</div>
    <div class="sign"><div></div>Principal</div>
  </div>
</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) return frame.remove();
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  };
  // Wait for the logo before printing.
  const imgs = [...doc.images].filter((i) => !i.complete);
  let pending = imgs.length;
  if (!pending) return setTimeout(go, 100);
  const done = () => --pending <= 0 && setTimeout(go, 100);
  imgs.forEach((i) => {
    i.addEventListener("load", done);
    i.addEventListener("error", done);
  });
};
