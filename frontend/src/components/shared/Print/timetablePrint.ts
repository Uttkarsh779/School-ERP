// Printable weekly timetables (A4 portrait, one per page): letterhead, title, then a grid of
// periods × days like the screen. A class timetable shows subject + teacher in each period; a
// teacher's timetable shows subject + class. Several timetables print together (every class
// or every teacher), each starting on a new page. "Save as PDF" in the print dialog gives a PDF.

import { esc, LETTERHEAD_CSS, letterheadHtml, printHtml, type PrintSchool } from "./printDocument";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export interface PrintTimetable {
  title: string; // "Class 6 - A" or the teacher's name
  subtitle?: string; // "Class timetable" / "Teacher's timetable" / "Class teacher: …"
  kind: "class" | "teacher";
  slots: ITimetableSlot[];
}

const room = (r?: string | null) => (r ? `Room ${esc(r.replace(/^room\s*/i, ""))}` : "");
const className = (s: ITimetableSlot) => (s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : "");

const cell = (slot: ITimetableSlot | undefined, kind: PrintTimetable["kind"]) => {
  if (!slot?.subject) return `<td class="free">—</td>`;
  const second = kind === "class" ? slot.staff?.user?.name ?? "" : className(slot);
  return `<td><b>${esc(slot.subject.name)}</b>${second ? `<div>${esc(second)}</div>` : ""}${slot.room ? `<div class="room">${room(slot.room)}</div>` : ""}</td>`;
};

const page = (t: PrintTimetable, school: PrintSchool, session?: string | null) => {
  const periodCount = Math.max(8, ...t.slots.map((s) => s.periodNumber));
  const find = (day: number, period: number) => t.slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);
  const rows = Array.from({ length: periodCount }, (_, i) => i + 1)
    .map((p) => `<tr><th class="p">Period ${p}</th>${DAYS.map((d) => cell(find(d.value, p), t.kind)).join("")}</tr>`)
    .join("");
  const taught = t.slots.filter((s) => s.subject).length;
  return `<section class="sheet">
    ${letterheadHtml(school)}
    <div class="title">
      <div><h2>${esc(t.title)}</h2>${t.subtitle ? `<div class="sub">${esc(t.subtitle)}</div>` : ""}</div>
      <div class="meta">${session ? `Session ${esc(session)}<br>` : ""}${taught} period${taught === 1 ? "" : "s"} a week</div>
    </div>
    <table>
      <thead><tr><th class="p">Period</th>${DAYS.map((d) => `<th>${d.label}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot">
      <span>Printed on ${esc(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</span>
      <span class="sign"><span></span>Principal</span>
    </div>
  </section>`;
};

export const printTimetables = (timetables: PrintTimetable[], opts: { school?: PrintSchool | null; session?: string | null; documentTitle?: string }) => {
  const school = opts.school ?? {};
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.documentTitle ?? (timetables.length === 1 ? `Timetable — ${timetables[0].title}` : "Timetables"))}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 8mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; }
  body { margin: 0; font: 9pt/1.3 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .sheet { page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .title { display: flex; justify-content: space-between; align-items: flex-end; margin: 12px 0 8px; }
  .title h2 { margin: 0; font-size: 15pt; color: var(--ink); }
  .sub { color: #5d6675; font-size: 9pt; }
  .meta { text-align: right; color: #5d6675; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #9aa3af; padding: 6px 5px; text-align: center; vertical-align: middle; }
  thead th { background: var(--ink); color: #fff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; }
  th.p { width: 12%; background: #e9edf3; color: var(--ink); font-size: 8.5pt; }
  thead th.p { background: var(--ink); color: #fff; }
  td { height: 15mm; font-size: 8.6pt; }
  td b { display: block; font-size: 9.4pt; }
  td div { color: #4a5361; font-size: 8pt; }
  td .room { color: #7a8391; font-size: 7.6pt; }
  td.free { color: #b3b9c2; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; color: #5d6675; font-size: 8.5pt; }
  .sign { display: inline-block; text-align: center; min-width: 150px; color: #1b2430; }
  .sign span { display: block; border-top: 1px solid #1b2430; margin-bottom: 3px; }
</style></head><body>
${timetables.map((t) => page(t, school, opts.session)).join("")}
</body></html>`;
  printHtml(html);
};

// Groups a whole session's periods into one timetable per class or per teacher, in a
// sensible order (classes by name/section, teachers by name).
export const groupTimetables = (slots: ITimetableSlot[], by: "class" | "teacher"): PrintTimetable[] => {
  const groups = new Map<string, { title: string; slots: ITimetableSlot[] }>();
  for (const s of slots) {
    if (!s.subject) continue;
    const key = by === "class" ? String(s.classSectionId) : s.staffId ? String(s.staffId) : "";
    if (!key) continue;
    const title = by === "class" ? className(s) : s.staff?.user?.name ?? "Teacher";
    const g = groups.get(key) ?? { title, slots: [] };
    g.slots.push(s);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }))
    .map((g) => ({ title: g.title, kind: by, subtitle: by === "class" ? "Class timetable" : "Teacher's timetable", slots: g.slots }));
};
