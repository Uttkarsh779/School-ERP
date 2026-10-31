import type { ClassResult, ResultStudent, TermSubjectResult, FinalSubjectResult } from "../../../store/api/examPlan.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, signatureHtml, type PrintSchool } from "./printDocument";

// Term and final report cards (A4 portrait), following the class's assessment scheme:
//   term:  Subject | Periodic assessment | Exam | Total | Grade, co-scholastic grades,
//          class teacher's remark, attendance.
//   final: Subject | Term 1 | Term 2 | Final (weighted) | Grade, both terms' co-scholastic.
// No rank (school policy). One-term schemes (Class 10) print as the annual report card.

export type PrintableResult = Pick<ClassResult, "kind" | "term" | "classSection" | "session" | "classTeacher" | "scheme" | "weights" | "subjects" | "attendance"> & {
  students: ResultStudent<TermSubjectResult & FinalSubjectResult>[];
};

const CO = [
  ["workEducation", "Work Education"],
  ["artEducation", "Art Education"],
  ["healthPhysical", "Health & Physical Education"],
  ["discipline", "Discipline"],
] as const;
const RESULT: Record<string, string> = { PASS: "Pass", NEEDS_IMPROVEMENT: "Needs improvement", INCOMPLETE: "Marks incomplete", PENDING: "Marks pending" };
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10));
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");

const titleOf = (r: PrintableResult) =>
  r.kind === "FINAL" ? (r.scheme.terms === 1 ? "Annual Report Card" : "Final Report Card") : r.scheme.terms === 1 ? "Annual Report Card" : `Report Card · Term ${r.term}`;

const scholasticTerm = (s: PrintableResult["students"][number], r: PrintableResult) => {
  const paLabel = r.scheme.terms === 1 ? "Internal assessment" : "Periodic assessment";
  const rows = s.subjects
    .filter((x) => x.hasPaper || x.total !== null)
    .map(
      (x) => `<tr><td class="l">${esc(x.subjectName)}</td><td>${n(x.pa)}</td><td>${x.examAbsent ? "AB" : n(x.exam)}</td><td><b>${n(x.total)}</b></td><td><b>${esc(x.grade ?? "—")}</b></td></tr>`
    )
    .join("");
  return `<table class="marks"><thead><tr><th class="l">Subject</th><th>${paLabel}<br><small>(${r.scheme.paMax})</small></th><th>Exam<br><small>(${r.scheme.examMax})</small></th><th>Total<br><small>(${r.scheme.paMax + r.scheme.examMax})</small></th><th>Grade</th></tr></thead>
    <tbody>${rows}<tr class="sum"><td class="l">Total</td><td colspan="2"></td><td><b>${n(s.total)} / ${n(s.maxTotal)}</b></td><td></td></tr></tbody></table>`;
};

const scholasticFinal = (s: PrintableResult["students"][number], r: PrintableResult) => {
  const w = r.weights ?? [50, 50];
  const rows = s.subjects
    .filter((x) => x.term1 || x.term2)
    .map(
      (x) =>
        `<tr><td class="l">${esc(x.subjectName)}</td><td>${n(x.term1?.total)}</td><td>${esc(x.term1?.grade ?? "—")}</td><td>${n(x.term2?.total)}</td><td>${esc(x.term2?.grade ?? "—")}</td><td><b>${n(x.percentage)}</b></td><td><b>${esc(x.grade ?? "—")}</b></td></tr>`
    )
    .join("");
  return `<table class="marks"><thead><tr><th class="l">Subject</th><th>Term 1<br><small>(100)</small></th><th>Grade</th><th>Term 2<br><small>(100)</small></th><th>Grade</th><th>Final %<br><small>(${w[0]}% + ${w[1]}%)</small></th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const coTable = (s: PrintableResult["students"][number], r: PrintableResult) => {
  const scale = r.scheme.coScale === 5 ? "5-point scale A–E" : "3-point scale: A Outstanding, B Very good, C Fair";
  if (r.kind === "FINAL" && r.scheme.terms === 2) {
    const t1 = s.term1CoScholastic ?? {};
    return `<table class="co"><thead><tr><th class="l">Co-scholastic areas <small>(${scale})</small></th><th>Term 1</th><th>Term 2</th></tr></thead><tbody>
      ${CO.map(([k, label]) => `<tr><td class="l">${label}</td><td>${esc(t1[k] ?? "—")}</td><td>${esc(s.coScholastic[k] ?? "—")}</td></tr>`).join("")}</tbody></table>`;
  }
  return `<table class="co"><thead><tr><th class="l">Co-scholastic areas <small>(${scale})</small></th><th>Grade</th></tr></thead><tbody>
    ${CO.map(([k, label]) => `<tr><td class="l">${label}</td><td>${esc(s.coScholastic[k] ?? "—")}</td></tr>`).join("")}</tbody></table>`;
};

const cardHtml = (s: PrintableResult["students"][number], r: PrintableResult, school: PrintSchool) => {
  const st = s.student;
  const photo = st.photoUrl && /^https?:\/\//.test(st.photoUrl) ? `<div class="photo"><img src="${esc(st.photoUrl)}" alt=""></div>` : "";
  const att = r.attendance?.[st.id];
  const grades = [...r.scheme.gradeScale].sort((a, b) => b.min - a.min);
  const legend = grades.map((g, i) => `${esc(g.grade)} ${g.min}${i === 0 ? "–100" : `–${grades[i - 1].min - 1}`}`).join(" · ");
  return `<section class="card">
    ${letterheadHtml(school)}
    <div class="title"><h2>${esc(titleOf(r))}</h2><div>Session ${esc(r.session)}</div></div>
    <div class="who">
      <table class="details">
        <tr><th>Student's name</th><td colspan="3"><b>${esc(st.name)}</b></td></tr>
        <tr><th>Class</th><td>${esc(`${r.classSection.className} - ${r.classSection.section}`)}</td><th>Roll No.</th><td>${esc(st.rollNo ?? "—")}</td></tr>
        <tr><th>Admission No.</th><td>${esc(st.admissionNo)}</td><th>Date of birth</th><td>${esc(date(st.dob))}</td></tr>
        <tr><th>Father's name</th><td>${esc(st.fatherName ?? "—")}</td><th>Mother's name</th><td>${esc(st.motherName ?? "—")}</td></tr>
      </table>
      ${photo}
    </div>
    <h3>Scholastic areas</h3>
    ${r.kind === "FINAL" && r.scheme.terms === 2 ? scholasticFinal(s, r) : scholasticTerm(s, r)}
    <div class="summary">
      <div><span>Percentage</span><b>${s.percentage === null ? "—" : `${n(s.percentage)}%`}</b></div>
      <div><span>Overall grade</span><b>${esc(s.grade ?? "—")}</b></div>
      <div><span>Result</span><b>${esc(RESULT[s.result] ?? s.result)}</b></div>
      ${att ? `<div><span>Attendance</span><b>${att.present} / ${att.workingDays}</b></div>` : ""}
    </div>
    ${s.failedSubjects.length ? `<p class="note">Needs improvement in: ${esc(s.failedSubjects.join(", "))}</p>` : ""}
    <div class="two">
      ${coTable(s, r)}
      <div class="remark"><h3>Class teacher's remark</h3><p>${s.remark ? esc(s.remark) : '<span class="muted">—</span>'}</p></div>
    </div>
    <p class="legend"><b>Grades:</b> ${legend}. Pass mark ${r.scheme.passPercentage}% in each subject.</p>
    <div class="signs">
      <div><div class="line"></div>Class Teacher${r.classTeacher ? `<div class="muted">${esc(r.classTeacher)}</div>` : ""}</div>
      <div><div class="line"></div>Parent / Guardian</div>
      <div>${signatureHtml(school, 10)}<div class="line"></div>Principal${school.principalName ? `<div class="muted">${esc(school.principalName)}</div>` : ""}</div>
    </div>
  </section>`;
};

export const printTermReportCards = (r: PrintableResult, school: PrintSchool | null | undefined, studentId?: number) => {
  const sch = school ?? {};
  const list = studentId ? r.students.filter((s) => s.student.id === studentId) : r.students;
  const label = `${titleOf(r)} — ${list.length === 1 ? list[0].student.name : `${r.classSection.className} ${r.classSection.section}`}`;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(label)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #b9c0cb; --soft: #eef1f6; }
  body { margin: 0; font: 9.2pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .card { border: 1.6px solid var(--ink); outline: 0.6px solid var(--ink); outline-offset: -5px; padding: 12px 14px 10px; min-height: 277mm; display: flex; flex-direction: column; break-after: page; }
  .card:last-child { break-after: auto; }
  .title { text-align: center; margin: 8px 0 8px; }
  .title h2 { display: inline-block; margin: 0 0 3px; padding: 3px 22px; background: var(--ink); color: #fff; font: 700 12pt "Segoe UI", Arial, sans-serif; letter-spacing: .16em; text-transform: uppercase; border-radius: 3px; }
  .title div { font-weight: 600; color: #4a5361; }
  .who { display: flex; gap: 10px; }
  .details { flex: 1; border-collapse: collapse; }
  .details th, .details td { border: 1px solid var(--line); padding: 3px 7px; text-align: left; }
  .details th { width: 18%; background: var(--soft); font-weight: 600; color: #3b4452; white-space: nowrap; }
  .photo { width: 27mm; flex: none; border: 1px solid var(--ink); }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  h3 { margin: 10px 0 4px; font-size: 9.8pt; color: var(--ink); }
  table.marks, table.co { width: 100%; border-collapse: collapse; }
  .marks th, .marks td, .co th, .co td { border: 1px solid var(--line); padding: 3.5px 6px; text-align: center; }
  .marks th, .co th { background: var(--ink); color: #fff; font-weight: 600; font-size: 8.4pt; }
  .marks th small, .co th small { font-weight: 400; opacity: .85; }
  .l { text-align: left !important; }
  .sum td { background: var(--soft); }
  .summary { display: flex; gap: 8px; margin: 8px 0 2px; }
  .summary div { flex: 1; border: 1px solid var(--line); border-radius: 4px; padding: 5px 8px; background: var(--soft); }
  .summary span { display: block; font-size: 7.8pt; color: #4a5361; }
  .summary b { font-size: 11pt; }
  .note { margin: 4px 0 0; color: #8a3b12; font-weight: 600; }
  .two { display: flex; gap: 10px; margin-top: 8px; align-items: flex-start; }
  .two > * { flex: 1; }
  .remark { border: 1px solid var(--line); border-radius: 4px; padding: 0 8px 6px; min-height: 30mm; }
  .remark h3 { margin-top: 6px; }
  .remark p { margin: 0; }
  .legend { margin: 8px 0 0; font-size: 7.8pt; color: #4a5361; }
  .muted { color: #6b7380; font-weight: 400; font-size: 8pt; }
  .signs { display: flex; justify-content: space-between; gap: 20px; margin-top: auto; padding-top: 40px; text-align: center; font-weight: 600; }
  .signs > div { flex: 1; max-width: 52mm; }
  .line { border-top: 1px solid #1b2430; margin-bottom: 2px; }
</style></head><body>${list.map((s) => cardHtml(s, r, sch)).join("")}</body></html>`);
};
