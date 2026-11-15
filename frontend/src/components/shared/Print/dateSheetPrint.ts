// Printable exam date sheets (A4 portrait). One class: a table of its papers (date, day,
// subject, time) and the instructions. Several classes of the same exam: the notice-board
// layout, with dates down the side and classes across (at most 6 classes per page; more go on
// following pages). "Save as PDF" in the print dialog gives a PDF.

import type { DateSheetItem } from "../../../store/api/examPlan.api";
import { esc, LETTERHEAD_CSS, letterheadHtml, printHtml, type PrintSchool } from "./printDocument";

const dateText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dayText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" });
const time = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const span = (e: { start: string; end: string }) => `${time(e.start)} – ${time(e.end)}`;
const cls = (e: DateSheetItem) => `${e.classSection.className} - ${e.classSection.section}`;

// Nursery < LKG < UKG < Class 1 < … < Class 12, then sections.
const classRank = (name: string) => {
  const n = name.toLowerCase();
  if (/play|pre[\s-]*nur/.test(n)) return 1;
  if (/nursery/.test(n)) return 2;
  if (/lkg/.test(n)) return 3;
  if (/ukg|\bkg\b/.test(n)) return 4;
  const d = n.match(/\d+/);
  return d ? 100 + Number(d[0]) : 999;
};
const byClass = (a: DateSheetItem, b: DateSheetItem) =>
  classRank(a.classSection.className) - classRank(b.classSection.className) || cls(a).localeCompare(cls(b), "en", { numeric: true });

const instructionsHtml = (text: string | null) => {
  const lines = (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? `<div class="ins"><b>Instructions</b><ol>${lines.map((l) => `<li>${esc(l.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol></div>` : "";
};

const footer = () => `<div class="foot">
  <span>Issued on ${esc(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</span>
  <span class="sign"><span></span>Exam Coordinator</span>
  <span class="sign"><span></span>Principal</span>
</div>`;

const singleClass = (e: DateSheetItem, school: PrintSchool) => `<section class="sheet">
  ${letterheadHtml(school)}
  <div class="title"><h2>${esc(e.name)} — Date Sheet</h2><div class="sub">Class ${esc(cls(e))}</div></div>
  <table class="list">
    <thead><tr><th style="width:8%">S.No</th><th style="width:20%">Date</th><th style="width:17%">Day</th><th>Subject</th><th style="width:22%">Time</th></tr></thead>
    <tbody>${e.entries
      .map((p, i) => `<tr><td class="c">${i + 1}</td><td>${esc(dateText(p.date))}</td><td>${esc(dayText(p.date))}</td><td><b>${esc(p.subjectName)}</b></td><td>${esc(span(p))}</td></tr>`)
      .join("")}</tbody>
  </table>
  ${instructionsHtml(e.instructions)}
  ${footer()}
</section>`;

// Notice-board grid for several classes of one exam.
const combined = (exams: DateSheetItem[], school: PrintSchool) => {
  const sorted = [...exams].sort(byClass);
  const pages: DateSheetItem[][] = [];
  for (let i = 0; i < sorted.length; i += 6) pages.push(sorted.slice(i, i + 6));
  // One time for the whole sheet when every paper has the same hours; otherwise per cell.
  const times = new Set(sorted.flatMap((e) => e.entries.map(span)));
  const commonTime = times.size === 1 ? [...times][0] : null;
  const name = sorted[0].name;
  return pages
    .map((group, pi) => {
      const dates = [...new Set(group.flatMap((e) => e.entries.map((p) => p.date)))].sort();
      const rows = dates
        .map((d) => {
          const cells = group
            .map((e) => {
              const papers = e.entries.filter((p) => p.date === d);
              if (!papers.length) return `<td class="free">—</td>`;
              return `<td>${papers.map((p) => `<b>${esc(p.subjectName)}</b>${commonTime ? "" : `<div>${esc(span(p))}</div>`}`).join("")}</td>`;
            })
            .join("");
          return `<tr><th class="d">${esc(dateText(d))}<div>${esc(dayText(d))}</div></th>${cells}</tr>`;
        })
        .join("");
      const ins = pi === pages.length - 1 ? instructionsHtml(sorted.find((e) => e.instructions)?.instructions ?? null) : "";
      return `<section class="sheet">
        ${letterheadHtml(school)}
        <div class="title"><h2>${esc(name)} — Date Sheet</h2><div class="sub">${commonTime ? `Time: ${esc(commonTime)}` : ""}${pages.length > 1 ? `${commonTime ? " · " : ""}Page ${pi + 1} of ${pages.length}` : ""}</div></div>
        <table class="grid">
          <thead><tr><th class="d">Date</th>${group.map((e) => `<th>${esc(cls(e))}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${ins}
        ${footer()}
      </section>`;
    })
    .join("");
};

// One sheet per class, or (combine) the grid for several classes of the same exam.
export const printDateSheets = (exams: DateSheetItem[], opts: { school?: PrintSchool | null; combine?: boolean }) => {
  const list = exams.filter((e) => e.entries.length > 0);
  if (!list.length) return;
  const school = opts.school ?? {};
  const body = opts.combine && list.length > 1 ? combined(list, school) : [...list].sort(byClass).map((e) => singleClass(e, school)).join("");
  const title = list.length === 1 ? `Date Sheet — ${list[0].name} — ${cls(list[0])}` : `Date Sheet — ${list[0].name}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; }
  body { margin: 0; font: 9.5pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .sheet { page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .title { text-align: center; margin: 12px 0 10px; }
  .title h2 { margin: 0; font-size: 15pt; letter-spacing: .03em; color: var(--ink); text-transform: uppercase; }
  .sub { color: #4a5361; font-size: 10pt; margin-top: 2px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #9aa3af; padding: 7px 6px; vertical-align: middle; }
  thead th { background: var(--ink); color: #fff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .c { text-align: center; }
  .grid { table-layout: fixed; }
  .grid td, .grid thead th { text-align: center; }
  .grid th.d { width: 17%; background: #e9edf3; color: var(--ink); text-align: left; font-size: 9pt; }
  .grid thead th.d { background: var(--ink); color: #fff; }
  .grid th.d div { font-weight: 400; color: #5d6675; font-size: 8pt; }
  .grid td b { display: block; }
  .grid td div { font-size: 7.8pt; color: #5d6675; }
  td.free { color: #b3b9c2; }
  .ins { margin-top: 14px; font-size: 9pt; }
  .ins ol { margin: 4px 0 0; padding-left: 18px; }
  .ins li { margin: 2px 0; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 40px; color: #5d6675; font-size: 8.5pt; page-break-inside: avoid; }
  .sign { display: inline-block; text-align: center; min-width: 140px; color: #1b2430; }
  .sign span { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>${body}</body></html>`;
  printHtml(html);
};
