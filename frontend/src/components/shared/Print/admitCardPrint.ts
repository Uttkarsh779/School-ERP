import type { AdmitCardSet } from "../../../store/api/exams.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, signatureHtml, type PrintSchool } from "./printDocument";

// Exam admit cards: two per A4 sheet (cut along the dashed line). Each has the student's
// details and photo, the date sheet, instructions, and signature lines.

export const DEFAULT_INSTRUCTIONS = [
  "Bring this admit card to every exam; show it to the invigilator when asked.",
  "Reach the exam room 15 minutes before the paper starts.",
  "Mobile phones, smart watches and notes are not allowed in the exam room.",
  "Bring your own pens, pencils, geometry box and other stationery.",
].join("\n");

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const weekday = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
const time = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const dob = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

const cardHtml = (s: AdmitCardSet["students"][number], set: AdmitCardSet, school: PrintSchool) => {
  const photo = s.photoUrl && /^https?:\/\//.test(s.photoUrl) ? `<img class="photo" src="${esc(s.photoUrl)}" alt="">` : `<div class="photo none">Paste photo</div>`;
  const rows = set.dateSheet.entries.length
    ? set.dateSheet.entries
        .map((e) => `<tr><td>${esc(day(e.date))}</td><td>${esc(weekday(e.date))}</td><td><b>${esc(e.subjectName)}</b></td><td>${esc(time(e.start))} – ${esc(time(e.end))}</td><td></td></tr>`)
        .join("")
    : set.subjects.map((sub) => `<tr><td></td><td></td><td><b>${esc(sub.name)}</b></td><td></td><td></td></tr>`).join("");
  const instructions = (set.dateSheet.instructions ?? DEFAULT_INSTRUCTIONS)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return `<section class="card">
    ${letterheadHtml(school)}
    <div class="title"><h2>Admit Card</h2><div>${esc(set.exam.name)}${set.exam.session ? ` · Session ${esc(set.exam.session)}` : ""}</div></div>
    <div class="who">
      <table class="details">
        <tr><th>Student's name</th><td colspan="3"><b>${esc(s.name)}</b></td></tr>
        <tr><th>Class</th><td>${esc(`${set.classSection.className} - ${set.classSection.section}`)}</td><th>Roll No.</th><td><b>${esc(s.rollNo || "—")}</b></td></tr>
        <tr><th>Admission No.</th><td>${esc(s.admissionNo)}</td><th>Date of birth</th><td>${esc(dob(s.dob))}</td></tr>
        <tr><th>Father's name</th><td colspan="3">${esc(s.fatherName || "—")}</td></tr>
      </table>
      ${photo}
    </div>
    <table class="sheet">
      <thead><tr><th>Date</th><th>Day</th><th>Subject</th><th>Time</th><th>Invigilator's sign</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <ol class="rules">${instructions.map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
    <div class="signs">
      <div><div class="line"></div>Student</div>
      <div><div class="line"></div>Class Teacher${set.classTeacher ? `<div class="muted">${esc(set.classTeacher)}</div>` : ""}</div>
      <div>${signatureHtml(school, 9)}<div class="line"></div>Principal${school.principalName ? `<div class="muted">${esc(school.principalName)}</div>` : ""}</div>
    </div>
  </section>`;
};

export const printAdmitCards = (set: AdmitCardSet, school: PrintSchool | null | undefined) => {
  const sch = school ?? {};
  const pages: string[] = [];
  for (let i = 0; i < set.students.length; i += 2) {
    pages.push(`<div class="page">${set.students.slice(i, i + 2).map((s) => cardHtml(s, set, sch)).join('<div class="cut"></div>')}</div>`);
  }
  const title = set.students.length === 1 ? `Admit Card — ${set.students[0].name}` : `Admit Cards — ${set.classSection.className} ${set.classSection.section}`;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(`${title} — ${set.exam.name}`)}</title>
<style>
  @page { size: A4 portrait; margin: 7mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #b9c0cb; --soft: #eef1f6; }
  body { margin: 0; font: 8.6pt/1.3 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .lh-logo { width: 44px; height: 44px; }
  .lh-text { font-size: 7.6pt; }
  .lh-text h1 { font-size: 14pt; }
  .lh-tag { display: none; }
  .page { height: 282mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
  .page:last-child { break-after: auto; }
  .card { height: 139mm; overflow: hidden; border: 1.4px solid var(--ink); border-radius: 3px; padding: 7px 10px 6px; display: flex; flex-direction: column; }
  .cut { border-top: 1px dashed #8a93a1; margin: 0 -2mm; }
  .title { text-align: center; margin: 3px 0 4px; }
  .title h2 { display: inline-block; margin: 0 0 2px; padding: 2px 18px; background: var(--ink); color: #fff; font: 700 10.5pt "Segoe UI", Arial, sans-serif; letter-spacing: .2em; text-transform: uppercase; border-radius: 3px; }
  .title div { font-weight: 600; color: #4a5361; }
  .who { display: flex; gap: 8px; align-items: stretch; }
  .details { flex: 1; border-collapse: collapse; }
  .details th, .details td { border: 1px solid var(--line); padding: 1.8px 6px; text-align: left; }
  .details th { width: 24%; background: var(--soft); font-weight: 600; color: #3b4452; white-space: nowrap; }
  .photo { width: 24mm; height: 29mm; object-fit: cover; border: 1px solid var(--ink); flex: none; }
  .photo.none { display: grid; place-items: center; color: #8a93a1; font-size: 7pt; text-align: center; border-style: dashed; }
  .sheet { width: 100%; margin-top: 5px; border-collapse: collapse; }
  .sheet th, .sheet td { border: 1px solid var(--line); padding: 1.7px 6px; text-align: left; }
  .sheet th { background: var(--ink); color: #fff; font-weight: 600; font-size: 8pt; }
  .sheet td:last-child { width: 24mm; }
  .rules { margin: 4px 0 0; padding-left: 15px; font-size: 7.3pt; color: #3b4452; columns: 2; column-gap: 22px; }
  .rules li { margin: 0 0 1px; break-inside: avoid; }
  .signs { display: flex; justify-content: space-between; gap: 14px; margin-top: auto; padding-top: 28px; text-align: center; font-weight: 600; }
  .signs > div { flex: 1; max-width: 46mm; }
  .line { border-top: 1px solid #1b2430; margin-bottom: 2px; }
  .muted { color: #6b7380; font-weight: 400; font-size: 7.6pt; }
</style></head><body>${pages.join("")}</body></html>`);
};
