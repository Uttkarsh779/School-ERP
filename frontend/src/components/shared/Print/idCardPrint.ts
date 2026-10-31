import { esc, printHtml, signatureHtml, type PrintSchool } from "./printDocument";

// Printable identity cards for students and staff: standard wallet size (54 × 85.6 mm,
// portrait), nine to an A4 sheet with thin cut lines. The office prints them on card
// stock and cuts them out (or laminates the sheet).

export interface IdCardStudent {
  name: string;
  photoUrl?: string | null;
  admissionNo: string;
  rollNo?: string | null;
  className?: string | null;
  dob?: string | null;
  bloodGroup?: string | null;
  fatherName?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface IdCardStaff {
  name: string;
  photoUrl?: string | null;
  staffId: string;
  designation: string;
  bloodGroup?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

type School = (PrintSchool & { principalName?: string | null }) | null | undefined;

const httpUrl = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null);
const date = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

// clamp: long values (addresses) stop after two lines instead of pushing into the footer.
const row = (label: string, value?: string | null, clamp = false) =>
  value ? `<tr><th>${esc(label)}</th><td>${clamp ? `<div class="clamp">${esc(value)}</div>` : esc(value)}</td></tr>` : "";

const photoHtml = (name: string, url?: string | null) => {
  const src = httpUrl(url);
  return src ? `<img class="photo" src="${esc(src)}" alt="">` : `<div class="photo none">${esc(name.charAt(0).toUpperCase())}</div>`;
};

const headHtml = (school: NonNullable<School> | Record<string, never>, title: string, session?: string | null) => {
  const logo = httpUrl(school.logoUrl);
  return `<div class="top">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ""}
      <div class="sch">
        <div class="sname">${esc(school.schoolName || "School")}</div>
        ${school.address ? `<div class="saddr">${esc(school.address)}</div>` : ""}
      </div>
    </div>
    <div class="title">${esc(title)}${session ? ` <span>· ${esc(session)}</span>` : ""}</div>`;
};

const footHtml = (school: NonNullable<School> | Record<string, never>) => `<div class="foot">
      <div class="contact">${school.phone ? `Ph: ${esc(school.phone)}` : ""}</div>
      <div class="sign">${signatureHtml(school, 5)}<div class="sline"></div>Principal</div>
    </div>`;

const CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --soft: #eef1f6; }
  body { margin: 0; font: 7.4pt/1.3 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: grid; grid-template-columns: repeat(3, 54mm); grid-auto-rows: 85.6mm; gap: 4mm; justify-content: center; }
  .sheet + .sheet { break-before: page; margin-top: 0; }
  .card { position: relative; overflow: hidden; display: flex; flex-direction: column; border: 0.3mm dashed #9aa3b0; border-radius: 2.5mm; background: #fff; break-inside: avoid; }
  .top { display: flex; align-items: center; gap: 1.6mm; padding: 1.6mm 2.2mm; background: var(--ink); color: #fff; min-height: 11mm; }
  .logo { width: 9mm; height: 9mm; object-fit: contain; background: #fff; border-radius: 50%; padding: 0.5mm; flex: none; }
  .sch { flex: 1; min-width: 0; text-align: center; }
  .sname { font: 700 8.2pt/1.1 Georgia, "Times New Roman", serif; text-transform: uppercase; letter-spacing: .02em; }
  .saddr { margin-top: 0.5mm; font-size: 5.6pt; opacity: .9; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .title { background: var(--soft); color: var(--ink); text-align: center; font-weight: 700; font-size: 6.4pt; letter-spacing: .12em; padding: 0.9mm 0; text-transform: uppercase; }
  .title span { font-weight: 600; letter-spacing: .04em; }
  .body { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 1.8mm 2.6mm 0; min-height: 0; overflow: hidden; }
  .photo { width: 18mm; height: 22mm; object-fit: cover; border: 0.4mm solid var(--ink); border-radius: 1.2mm; flex: none; }
  .photo.none { display: grid; place-items: center; background: var(--soft); color: var(--ink); font: 700 20pt Georgia, serif; }
  .name { margin-top: 1.2mm; font-weight: 700; font-size: 9pt; text-align: center; line-height: 1.15; color: var(--ink); text-transform: uppercase; }
  .sub { margin-top: 0.6mm; padding: 0.3mm 2.4mm; border-radius: 999px; background: var(--ink); color: #fff; font-weight: 600; font-size: 6.8pt; }
  table { width: 100%; margin-top: 1.2mm; border-collapse: collapse; }
  th, td { padding: 0.2mm 0; text-align: left; vertical-align: top; font-size: 6.6pt; }
  th { width: 15mm; color: #5a6372; font-weight: 600; white-space: nowrap; }
  td { font-weight: 600; word-break: break-word; }
  .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 500; }
  .foot { flex: none; display: flex; justify-content: space-between; align-items: flex-end; gap: 2mm; padding: 1.4mm 2.6mm 1.6mm; }
  .contact { font-size: 5.8pt; color: #5a6372; }
  .sign { min-width: 16mm; text-align: center; font-size: 6pt; font-weight: 600; }
  .sline { border-top: 0.25mm solid #1b2430; margin-bottom: 0.8mm; }
  .bar { height: 1.4mm; background: var(--ink); }
  /* Printed signature: it gets its own space in the footer, so the photo is a little smaller. */
  .sign img { margin: 0 auto 0.4mm !important; }
  .signed .photo { width: 15mm; height: 18.5mm; }
  .signed .photo.none { font-size: 16pt; }
`;

const PER_SHEET = 9;

const printCards = (cards: string[], docTitle: string) => {
  const sheets: string[] = [];
  for (let i = 0; i < cards.length; i += PER_SHEET) sheets.push(`<div class="sheet">${cards.slice(i, i + PER_SHEET).join("")}</div>`);
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(docTitle)}</title><style>${CSS}</style></head><body>${sheets.join("")}</body></html>`);
};

export const printStudentIdCards = (students: IdCardStudent[], school: School, session?: string | null) => {
  const sch = school ?? {};
  const cards = students.map(
    (s) => `<div class="card${sch.signatureUrl ? " signed" : ""}">
    ${headHtml(sch, "Student Identity Card", session)}
    <div class="body">
      ${photoHtml(s.name, s.photoUrl)}
      <div class="name">${esc(s.name)}</div>
      ${s.className ? `<div class="sub">Class ${esc(s.className)}${s.rollNo ? ` · Roll ${esc(s.rollNo)}` : ""}</div>` : ""}
      <table>
        ${row("Adm. No", s.admissionNo)}
        ${row("D.O.B.", date(s.dob))}
        ${row("Blood Group", s.bloodGroup)}
        ${row("Father", s.fatherName)}
        ${row("Phone", s.phone)}
        ${row("Address", s.address, true)}
      </table>
    </div>
    ${footHtml(sch)}
    <div class="bar"></div>
  </div>`
  );
  printCards(cards, students.length === 1 ? `ID card — ${students[0].name}` : "Student ID cards");
};

export const printStaffIdCards = (staff: IdCardStaff[], school: School, session?: string | null) => {
  const sch = school ?? {};
  const cards = staff.map(
    (s) => `<div class="card${sch.signatureUrl ? " signed" : ""}">
    ${headHtml(sch, "Staff Identity Card", session)}
    <div class="body">
      ${photoHtml(s.name, s.photoUrl)}
      <div class="name">${esc(s.name)}</div>
      <div class="sub">${esc(s.designation)}</div>
      <table>
        ${row("Staff ID", s.staffId)}
        ${row("Blood Group", s.bloodGroup)}
        ${row("Phone", s.phone)}
        ${row("Email", s.email)}
        ${row("Address", s.address, true)}
      </table>
    </div>
    ${footHtml(sch)}
    <div class="bar"></div>
  </div>`
  );
  printCards(cards, staff.length === 1 ? `ID card — ${staff[0].name}` : "Staff ID cards");
};
