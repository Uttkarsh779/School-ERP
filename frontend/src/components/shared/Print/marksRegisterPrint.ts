// Printable marks register (tabulation sheet) for one exam and class: every student × subject,
// total, percentage, result and rank, a subject summary, and signature lines for the class
// teacher, exam coordinator and principal. Portrait for up to 7 subjects, landscape beyond.
// "Save as PDF" in the print dialog gives a PDF.

import type { ExamAnalysis } from "../../../store/api/exams.api";
import { esc, LETTERHEAD_CSS, letterheadHtml, printHtml, type PrintSchool } from "./printDocument";

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));
const RESULT: Record<string, string> = { PASS: "Pass", FAIL: "Fail", ABSENT: "Absent", PENDING: "Pending", NOT_ENTERED: "—" };

export const printMarksRegister = (a: ExamAnalysis, opts: { school?: PrintSchool | null }) => {
  const school = opts.school ?? {};
  const landscape = a.subjects.length > 7;
  const cls = `${a.exam.classSection.className} - ${a.exam.classSection.section}`;

  // Each subject's maximum marks as most students have it (for the header).
  const maxFor = (subjectId: number) => {
    const counts = new Map<number, number>();
    for (const s of a.students) {
      const m = s.marks.find((x) => x.subjectId === subjectId);
      if (m?.entered) counts.set(m.maxMarks, (counts.get(m.maxMarks) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  const students = [...a.students].sort((x, y) => (Number(x.rollNo) || 0) - (Number(y.rollNo) || 0) || x.name.localeCompare(y.name));

  const head = `<tr><th class="c">S.No</th><th class="c">Roll</th><th class="name">Student</th>${a.subjects
    .map((s) => {
      const max = maxFor(s.id);
      return `<th class="c">${esc(s.name)}${max ? `<div>(${num(max)})</div>` : ""}</th>`;
    })
    .join("")}<th class="c">Total</th><th class="c">%</th><th class="c">Result</th><th class="c">Rank</th></tr>`;

  const body = students
    .map((s, i) => {
      const cells = a.subjects
        .map((sub) => {
          const m = s.marks.find((x) => x.subjectId === sub.id);
          if (!m || !m.entered) return `<td class="c muted">—</td>`;
          if (m.isAbsent) return `<td class="c ab">AB</td>`;
          return `<td class="c${m.passed ? "" : " fail"}">${num(m.marksObtained)}</td>`;
        })
        .join("");
      return `<tr>
        <td class="c">${i + 1}</td><td class="c">${esc(s.rollNo || "—")}</td>
        <td class="name"><b>${esc(s.name)}</b><div class="sub">${esc(s.admissionNo)}</div></td>
        ${cells}
        <td class="c"><b>${s.maxTotal ? `${num(s.total)}<span class="sub">/${num(s.maxTotal)}</span>` : "—"}</b></td>
        <td class="c">${s.percentage === null ? "—" : `${num(s.percentage)}`}</td>
        <td class="c ${s.status === "FAIL" ? "fail" : ""}">${esc(RESULT[s.status] ?? s.status)}</td>
        <td class="c">${s.rank ?? "—"}</td>
      </tr>`;
    })
    .join("");

  const stats = a.subjectStats
    .map(
      (s) => `<tr><td>${esc(s.subjectName)}</td><td class="c">${s.appeared}</td><td class="c">${s.absent}</td><td class="c">${s.passed}</td><td class="c">${s.failed}</td>
        <td class="c">${s.passRate === null ? "—" : `${num(s.passRate)}%`}</td><td class="c">${s.averagePercentage === null ? "—" : `${num(s.averagePercentage)}%`}</td>
        <td class="c">${s.highestPercentage === null ? "—" : `${num(s.highestPercentage)}%`}</td></tr>`
    )
    .join("");

  const sum = a.summary;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Marks Register — ${esc(a.exam.name)} — ${esc(cls)}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 9mm 8mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; }
  body { margin: 0; font: 8.4pt/1.25 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 10px 0 6px; }
  .title h2 { margin: 0; font-size: 13pt; letter-spacing: .1em; text-transform: uppercase; color: var(--ink); }
  .meta { text-align: right; font-size: 8.4pt; color: #5d6675; }
  .summary { display: flex; gap: 6px; margin: 4px 0 8px; }
  .summary div { flex: 1; border: 1px solid #c9ced6; border-radius: 4px; padding: 4px 7px; background: #f4f6f9; }
  .summary span { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .05em; color: #5d6675; font-weight: 700; }
  .summary b { font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: var(--ink); color: #fff; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .03em; padding: 4px 3px; border: 1px solid var(--ink); }
  th div { font-weight: 400; text-transform: none; opacity: .85; }
  td { padding: 3px; border: 1px solid #c9ced6; vertical-align: middle; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  .c { text-align: center; font-variant-numeric: tabular-nums; }
  .name { text-align: left; min-width: 34mm; }
  .sub { font-size: 7pt; color: #5d6675; font-weight: 400; }
  .muted { color: #b3b9c2; }
  .ab { color: #8a5a00; font-weight: 700; }
  .fail { color: #b42318; font-weight: 700; }
  h3 { margin: 12px 0 4px; font-size: 9.5pt; color: var(--ink); text-transform: uppercase; letter-spacing: .06em; }
  .stats { page-break-inside: avoid; }
  .stats td:first-child { font-weight: 600; }
  .note { margin-top: 6px; font-size: 7.6pt; color: #5d6675; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 34px; font-size: 8.4pt; page-break-inside: avoid; }
  .sign { text-align: center; min-width: 150px; } .sign div { border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>
  ${letterheadHtml(school)}
  <div class="title">
    <h2>Marks Register</h2>
    <div class="meta"><b>${esc(a.exam.name)}</b> · Class ${esc(cls)}${a.exam.sessionName ? ` · Session ${esc(a.exam.sessionName)}` : ""}<br>Pass mark ${a.passPercentage}% per subject${a.exam.isLocked ? " · Marks locked" : " · <b>Marks not locked yet</b>"}</div>
  </div>
  <div class="summary">
    <div><span>Students</span><b>${sum.totalStudents}</b></div>
    <div><span>Appeared</span><b>${sum.appeared}</b></div>
    <div><span>Passed</span><b>${sum.passed}</b></div>
    <div><span>Failed</span><b>${sum.failed}</b></div>
    <div><span>Pass %</span><b>${sum.passRate === null ? "—" : `${num(sum.passRate)}%`}</b></div>
    <div><span>Class average</span><b>${sum.averagePercentage === null ? "—" : `${num(sum.averagePercentage)}%`}</b></div>
  </div>
  <table><thead>${head}</thead><tbody>${body}</tbody></table>
  <div class="note">AB = absent · — = not entered · marks in red are below the pass mark.</div>
  <div class="stats">
    <h3>Subject summary</h3>
    <table>
      <thead><tr><th style="text-align:left">Subject</th><th>Appeared</th><th>Absent</th><th>Passed</th><th>Failed</th><th>Pass %</th><th>Average</th><th>Highest</th></tr></thead>
      <tbody>${stats}</tbody>
    </table>
  </div>
  <div class="foot">
    <div class="sign"><div></div>Class Teacher</div>
    <div class="sign"><div></div>Exam Coordinator</div>
    <div class="sign"><div></div>Principal</div>
  </div>
</body></html>`;
  printHtml(html);
};
