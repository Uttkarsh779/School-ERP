// Printable report card (A4 portrait, one student per page): school letterhead, student
// details with photo, marks with grades, result summary, co-scholastic grades, attendance,
// the class teacher's remark and signature lines. A whole class prints as one document.

import type { PrintableReportCard, PrintableReportCards } from "../../../store/api/exams.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool, signatureHtml } from "./printDocument";

// CBSE eight-point grading on percentage.
const GRADE_SCALE: Array<{ min: number; grade: string; range: string }> = [
  { min: 90.5, grade: "A1", range: "91 – 100" },
  { min: 80.5, grade: "A2", range: "81 – 90" },
  { min: 70.5, grade: "B1", range: "71 – 80" },
  { min: 60.5, grade: "B2", range: "61 – 70" },
  { min: 50.5, grade: "C1", range: "51 – 60" },
  { min: 40.5, grade: "C2", range: "41 – 50" },
  { min: 32.5, grade: "D", range: "33 – 40" },
  { min: -1, grade: "E", range: "32 & below" },
];
const gradeOf = (pct: number | null) => (pct === null ? "—" : GRADE_SCALE.find((g) => pct >= g.min)!.grade);

const RESULT_TEXT: Record<string, string> = {
  PASS: "Passed",
  FAIL: "Needs improvement",
  ABSENT: "Absent",
  PENDING: "Result pending",
  NOT_ENTERED: "Result pending",
};
const CO_SCHOLASTIC = [
  ["workEducation", "Work Education"],
  ["artEducation", "Art Education"],
  ["healthPhysical", "Health & Physical Education"],
  ["discipline", "Discipline"],
] as const;
const CO_MEANING: Record<string, string> = { A: "Outstanding", B: "Very good", C: "Fair" };

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(Math.round(n * 100) / 100));
const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

const cardHtml = (c: PrintableReportCard, set: PrintableReportCards, school: PrintSchool & { principalName?: string | null }) => {
  const s = c.student;
  // No photo on file: leave the box out rather than print an empty square.
  const photo = s.photoUrl && /^https?:\/\//.test(s.photoUrl) ? `<div class="photo"><img src="${esc(s.photoUrl)}" alt=""></div>` : "";
  const cls = `${set.classSection.className} - ${set.classSection.section}`;

  const rows = c.subjects
    .map((sub, i) => {
      if (!sub.entered) {
        return `<tr><td class="c">${i + 1}</td><td>${esc(sub.subjectName)}</td><td class="c" colspan="5"><i>Not entered</i></td></tr>`;
      }
      if (sub.isAbsent) {
        return `<tr><td class="c">${i + 1}</td><td>${esc(sub.subjectName)}</td><td class="c">${num(sub.maxMarks)}</td><td class="c">AB</td><td class="c">—</td><td class="c">—</td><td class="c bad">Absent</td></tr>`;
      }
      return `<tr><td class="c">${i + 1}</td><td>${esc(sub.subjectName)}</td><td class="c">${num(sub.maxMarks)}</td><td class="c"><b>${num(sub.marksObtained)}</b></td>
        <td class="c">${num(sub.percentage)}%</td><td class="c"><b>${gradeOf(sub.percentage)}</b></td>
        <td class="c ${sub.passed ? "" : "bad"}">${sub.passed ? "Pass" : "Below pass mark"}</td></tr>`;
    })
    .join("");

  const co = CO_SCHOLASTIC.map(([k, label]) => {
    const g = c.coScholastic[k];
    return `<tr><td>${label}</td><td class="c"><b>${esc(g ?? "—")}</b>${g && CO_MEANING[g] ? ` <span class="muted">(${CO_MEANING[g]})</span>` : ""}</td></tr>`;
  }).join("");

  const att = c.attendance && c.attendance.workingDays > 0 ? c.attendance : null;
  const summary = [
    ["Total", `${num(c.total)} / ${num(c.maxTotal)}`],
    ["Percentage", c.percentage === null ? "—" : `${c.percentage}%`],
    ["Overall grade", gradeOf(c.percentage)],
    ["Result", RESULT_TEXT[c.status] ?? c.status],
    ...(c.rank ? [["Class rank", `${c.rank}${set.rankedCount ? ` of ${set.rankedCount}` : ""}`]] : []),
    ["Attendance", att ? `${att.present} / ${att.workingDays} days` : "—"],
  ]
    .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`)
    .join("");

  return `<section class="card">
    ${letterheadHtml(school)}
    <div class="title">
      <h2>Report Card</h2>
      <div>${esc(set.exam.name)}${set.sessionName ? ` &nbsp;·&nbsp; Academic Session ${esc(set.sessionName)}` : ""}</div>
    </div>

    <div class="who">
      <table class="info">
        <tr><th>Student's name</th><td colspan="3"><b class="big">${esc(s.name)}</b></td></tr>
        <tr><th>Class &amp; section</th><td>${esc(cls)}</td><th>Roll no.</th><td>${esc(s.rollNo || "—")}</td></tr>
        <tr><th>Admission no.</th><td>${esc(s.admissionNo)}</td><th>Date of birth</th><td>${date(s.dob)}</td></tr>
        <tr><th>Father's name</th><td colspan="3">${esc(s.fatherName || "—")}</td></tr>
        <tr><th>Mother's name</th><td colspan="3">${esc(s.motherName || "—")}</td></tr>
      </table>
      ${photo}
    </div>

    <h3>Part A — Scholastic areas</h3>
    <table class="marks">
      <thead><tr><th class="c" style="width:7%">S.No</th><th>Subject</th><th class="c" style="width:12%">Max marks</th><th class="c" style="width:14%">Marks obtained</th><th class="c" style="width:10%">%</th><th class="c" style="width:9%">Grade</th><th class="c" style="width:17%">Result</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td></td><td>Grand total</td><td class="c">${num(c.maxTotal)}</td><td class="c">${num(c.total)}</td><td class="c">${c.percentage === null ? "—" : `${c.percentage}%`}</td><td class="c">${gradeOf(c.percentage)}</td><td></td></tr></tfoot>
    </table>

    <div class="summary">${summary}</div>
    ${c.failedSubjects.length && c.status === "FAIL" ? `<p class="note">Needs attention in: ${esc(c.failedSubjects.join(", "))}. Pass mark is ${set.exam.passPercentage}% in each subject.</p>` : ""}

    <div class="two">
      <div>
        <h3>Part B — Co-scholastic areas</h3>
        <table class="small"><thead><tr><th>Area</th><th class="c" style="width:45%">Grade</th></tr></thead><tbody>${co}</tbody></table>
        <div class="muted tiny">A – Outstanding · B – Very good · C – Fair</div>
      </div>
      <div>
        <h3>Grading scale (marks %)</h3>
        <table class="small scale"><tbody>
          ${GRADE_SCALE.reduce<string[]>((out, g, i) => (i % 2 ? out : [...out, `<tr><td><b>${g.grade}</b></td><td>${g.range}</td><td><b>${GRADE_SCALE[i + 1]?.grade ?? ""}</b></td><td>${GRADE_SCALE[i + 1]?.range ?? ""}</td></tr>`]), []).join("")}
        </tbody></table>
      </div>
    </div>

    <h3>Class teacher's remark</h3>
    <div class="remark">${c.remark ? esc(c.remark) : '<span class="muted">—</span>'}</div>

    <div class="signs">
      <div><div class="line"></div>Class Teacher${set.classTeacher ? `<div class="muted">${esc(set.classTeacher)}</div>` : ""}</div>
      <div><div class="line"></div>Parent / Guardian</div>
      <div>${signatureHtml(school, 10)}<div class="line"></div>Principal${school.principalName ? `<div class="muted">${esc(school.principalName)}</div>` : ""}</div>
    </div>
    <div class="foot">${set.exam.isFinal ? "" : "Provisional — marks are not final yet. · "}Generated on ${esc(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</div>
  </section>`;
};

export const printReportCards = (set: PrintableReportCards, school: (PrintSchool & { principalName?: string | null }) | null | undefined) => {
  const sch = school ?? {};
  const title = set.cards.length === 1 ? `Report Card — ${set.cards[0].student.name}` : `Report Cards — ${set.classSection.className} ${set.classSection.section}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(`${title} — ${set.exam.name}`)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #b9c0cb; --soft: #eef1f6; }
  body { margin: 0; font: 9.4pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .card { border: 1.6px solid var(--ink); outline: 0.6px solid var(--ink); outline-offset: -5px; padding: 12px 14px 10px; min-height: 277mm; display: flex; flex-direction: column; page-break-after: always; break-after: page; }
  .card:last-child { page-break-after: auto; break-after: auto; }
  .title { text-align: center; margin: 8px 0 10px; }
  .title h2 { display: inline-block; margin: 0 0 3px; padding: 3px 22px; background: var(--ink); color: #fff; font: 700 12.5pt "Segoe UI", Arial, sans-serif; letter-spacing: .2em; text-transform: uppercase; border-radius: 3px; }
  .title div { font-weight: 600; color: #4a5361; }
  h3 { margin: 10px 0 4px; font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid var(--line); padding: 3.5px 6px; vertical-align: middle; }
  .c { text-align: center; }
  .who { display: flex; gap: 10px; align-items: stretch; }
  .info th { width: 17%; background: var(--soft); text-align: left; font-weight: 600; color: #4a5361; white-space: nowrap; }
  .big { font-size: 11pt; }
  .photo { width: 30mm; flex: none; border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; color: #9aa3af; font-size: 8pt; overflow: hidden; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .marks thead th { background: var(--ink); color: #fff; font-size: 8.4pt; text-transform: uppercase; letter-spacing: .03em; border-color: var(--ink); }
  .marks tbody tr:nth-child(even) td { background: #f8f9fb; }
  .marks tfoot td { background: var(--soft); font-weight: 700; }
  .bad { color: #b42318; font-weight: 600; }
  .summary { display: flex; gap: 6px; margin-top: 8px; }
  .summary div { flex: 1; border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px; text-align: center; background: var(--soft); }
  .summary span { display: block; font-size: 7.2pt; text-transform: uppercase; letter-spacing: .06em; color: #5d6675; font-weight: 700; }
  .summary b { font-size: 10.5pt; color: var(--ink); }
  .note { margin: 5px 0 0; font-size: 8.4pt; color: #5d6675; }
  .two { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; }
  .small th { background: var(--soft); text-align: left; font-size: 8.4pt; }
  .small td { font-size: 8.8pt; }
  .scale td { text-align: center; }
  .muted { color: #6b7380; font-size: 8pt; }
  .tiny { margin-top: 3px; font-size: 7.6pt; }
  .remark { border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; min-height: 44px; font-style: italic; background: #fcfcfd; }
  .signs { display: flex; justify-content: space-between; gap: 20px; margin-top: auto; padding-top: 42px; text-align: center; font-weight: 600; }
  .signs > div { flex: 1; max-width: 52mm; }
  .line { border-top: 1px solid #1b2430; margin-bottom: 3px; }
  .foot { margin-top: 8px; text-align: center; font-size: 7.4pt; color: #8a919c; }
</style></head><body>
  ${set.cards.map((c) => cardHtml(c, set, sch)).join("")}
</body></html>`;
  printHtml(html);
};
