// Student certificates: which fields each one has (shared by the issue form and the
// printout) and the printed A4 layouts. The office can edit every field before issuing;
// what was issued is stored and reprinted exactly.

import type { CertificateType } from "../../../store/api/certificates.api";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml, type PrintSchool, sealHtml, signatureHtml } from "./printDocument";

export interface CertificateField {
  key: string;
  label: string;
  wide?: boolean;
  options?: Array<{ label: string; value: string }>;
}

const GENDER: CertificateField = {
  key: "gender",
  label: "Gender (for he/she in the text)",
  options: [
    { label: "Male", value: "MALE" },
    { label: "Female", value: "FEMALE" },
    { label: "Not specified", value: "" },
  ],
};

export const CERTIFICATES: Record<CertificateType, { label: string; description: string; fields: CertificateField[] }> = {
  TRANSFER: {
    label: "Transfer Certificate (TC)",
    description: "When a student leaves the school. Only one active TC per student.",
    fields: [
      { key: "studentName", label: "1. Name of pupil" },
      { key: "motherName", label: "2. Mother's name" },
      { key: "fatherName", label: "3. Father's / Guardian's name" },
      { key: "nationality", label: "4. Nationality" },
      { key: "category", label: "5. Category (SC / ST / OBC / General)" },
      { key: "dob", label: "6. Date of birth (in figures)" },
      { key: "dobWords", label: "Date of birth (in words)", wide: true },
      { key: "admissionNo", label: "Admission no." },
      { key: "apaarId", label: "APAAR ID / PEN" },
      { key: "admissionDate", label: "7. Date of first admission" },
      { key: "firstAdmissionClass", label: "Class at first admission" },
      { key: "classLastStudied", label: "8. Class in which the pupil last studied" },
      { key: "lastExamResult", label: "9. Last examination taken, with result", wide: true },
      { key: "failedInSameClass", label: "10. Whether failed, if so once/twice in the same class" },
      { key: "subjects", label: "11. Subjects studied", wide: true },
      { key: "promotion", label: "12. Whether qualified for promotion to a higher class" },
      { key: "feeDues", label: "13. School dues, if any" },
      { key: "concession", label: "14. Any fee concession availed" },
      { key: "workingDays", label: "15. Total working days in the session" },
      { key: "daysPresent", label: "16. Total days present" },
      { key: "ncc", label: "17. Whether NCC cadet / Boy Scout / Girl Guide" },
      { key: "games", label: "18. Games played or extra-curricular activities" },
      { key: "conduct", label: "19. General conduct" },
      { key: "applicationDate", label: "20. Date of application for certificate" },
      { key: "reason", label: "21. Reason for leaving the school" },
      { key: "remarks", label: "22. Any other remarks", wide: true },
    ],
  },
  BONAFIDE: {
    label: "Bonafide / Study Certificate",
    description: "Proof that the student is currently studying here — for bank, passport, scholarship, etc.",
    fields: [
      { key: "studentName", label: "Student's name" },
      GENDER,
      { key: "fatherName", label: "Father's name" },
      { key: "motherName", label: "Mother's name" },
      { key: "admissionNo", label: "Admission no." },
      { key: "className", label: "Class & section" },
      { key: "sessionName", label: "Academic session" },
      { key: "dob", label: "Date of birth (in figures)" },
      { key: "dobWords", label: "Date of birth (in words)", wide: true },
      { key: "purpose", label: "Purpose (e.g. opening a bank account)", wide: true },
    ],
  },
  CHARACTER: {
    label: "Character Certificate",
    description: "Conduct certificate, usually given along with the TC or for admissions elsewhere.",
    fields: [
      { key: "studentName", label: "Student's name" },
      GENDER,
      { key: "fatherName", label: "Father's name" },
      { key: "admissionNo", label: "Admission no." },
      { key: "className", label: "Class last studied" },
      { key: "studyFrom", label: "Studied here from (year)" },
      { key: "studyTo", label: "Studied here to (year)" },
      { key: "conduct", label: "Conduct (e.g. Good, Very good)" },
      { key: "remarks", label: "Additional remarks (optional)", wide: true },
    ],
  },
  FEE: {
    label: "Fee Certificate",
    description: "Fees paid in a session — commonly for income-tax (80C) or reimbursement claims.",
    fields: [
      { key: "studentName", label: "Student's name" },
      GENDER,
      { key: "fatherName", label: "Father's / Guardian's name" },
      { key: "admissionNo", label: "Admission no." },
      { key: "className", label: "Class & section" },
      { key: "feeSession", label: "Academic session" },
      { key: "tuitionFee", label: "Tuition fee paid" },
      { key: "otherFee", label: "Other fees paid" },
      { key: "totalFee", label: "Total fees paid" },
      { key: "purpose", label: "Purpose", wide: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

export interface PrintableCertificate {
  type: CertificateType;
  serialNo: string | null; // null on a draft preview
  issueDate: string; // YYYY-MM-DD
  data: Record<string, string>;
  cancelled?: boolean;
}

const pron = (gender: string | undefined) =>
  gender === "MALE"
    ? { child: "son", he: "he", He: "He", his: "his", him: "him" }
    : gender === "FEMALE"
      ? { child: "daughter", he: "she", He: "She", his: "her", him: "her" }
      : { child: "ward", he: "they", He: "They", his: "their", him: "them" };

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const v = (d: Record<string, string>, k: string) => esc(d[k]?.trim() || "—");
// Blank-safe value shown inline in a sentence.
const b = (d: Record<string, string>, k: string) => `<b>${v(d, k)}</b>`;

const TITLES: Record<CertificateType, string> = {
  TRANSFER: "Transfer Certificate",
  BONAFIDE: "Bonafide Certificate",
  CHARACTER: "Character Certificate",
  FEE: "Fee Certificate",
};

const body = (c: PrintableCertificate, school: PrintSchool) => {
  const d = c.data;
  const p = pron(d.gender);
  const name = esc(school.schoolName || "this school");

  if (c.type === "TRANSFER") {
    const rows = CERTIFICATES.TRANSFER.fields
      .map((f) => `<tr><td class="lbl">${esc(f.label)}</td><td>${v(d, f.key)}</td></tr>`)
      .join("");
    return `<table class="tc">${rows}</table>
      <p class="decl">Certified that the above information is in accordance with the school records.</p>`;
  }

  if (c.type === "BONAFIDE") {
    return `<p class="para">This is to certify that ${b(d, "studentName")}, ${p.child} of Shri ${b(d, "fatherName")}${
      d.motherName?.trim() ? ` and Smt. ${b(d, "motherName")}` : ""
    }, is a bonafide student of ${name}, studying in ${b(d, "className")} during the academic session ${b(d, "sessionName")}.</p>
      <p class="para">${p.He} ${p.he === "they" ? "are" : "is"} enrolled under Admission No. ${b(d, "admissionNo")}, and ${p.his} date of birth as per the school records is ${b(d, "dob")} (${v(d, "dobWords")}).</p>
      <p class="para">This certificate is issued on request${d.purpose?.trim() ? ` for the purpose of ${b(d, "purpose")}` : ""}.</p>`;
  }

  if (c.type === "CHARACTER") {
    return `<p class="para">This is to certify that ${b(d, "studentName")}, ${p.child} of Shri ${b(d, "fatherName")}, Admission No. ${b(d, "admissionNo")}, has been a student of ${name} from ${b(d, "studyFrom")} to ${b(d, "studyTo")} and last studied in ${b(d, "className")}.</p>
      <p class="para">To the best of my knowledge, ${p.he} ${p.he === "they" ? "bear" : "bears"} a good moral character, and ${p.his} conduct in the school has been ${b(d, "conduct")}. ${p.He} ${p.he === "they" ? "have" : "has"} not been involved in any act of indiscipline.</p>
      ${d.remarks?.trim() ? `<p class="para">${esc(d.remarks)}</p>` : ""}
      <p class="para">I wish ${p.him} every success in life.</p>`;
  }

  // FEE
  return `<p class="para">This is to certify that Shri ${b(d, "fatherName")} has paid the following fees to ${name} for ${p.his} ${p.child} ${b(d, "studentName")} of ${b(d, "className")}, Admission No. ${b(d, "admissionNo")}, during the academic session ${b(d, "feeSession")}:</p>
    <table class="fee">
      <tr><td>Tuition fee</td><td class="r">${v(d, "tuitionFee")}</td></tr>
      <tr><td>Other fees (transport, exam, activity, etc.)</td><td class="r">${v(d, "otherFee")}</td></tr>
      <tr class="tot"><td>Total fees paid</td><td class="r">${v(d, "totalFee")}</td></tr>
    </table>
    <p class="para">This certificate is issued on request${d.purpose?.trim() ? ` for the purpose of ${b(d, "purpose")}` : ""}.</p>`;
};

export const printCertificate = (c: PrintableCertificate, school: (PrintSchool & { principalName?: string | null }) | null | undefined) => {
  const sch = school ?? {};
  const isTc = c.type === "TRANSFER";
  const watermark = c.cancelled ? "CANCELLED" : !c.serialNo ? "DRAFT" : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(`${TITLES[c.type]} — ${c.data.studentName ?? ""}`)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  :root { --ink: #23395b; --line: #b9c0cb; }
  body { margin: 0; font: ${isTc ? "9.4pt/1.32" : "11.5pt/1.7"} "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${LETTERHEAD_CSS}
  .page { position: relative; overflow: hidden; border: 1.6px solid var(--ink); outline: 0.6px solid var(--ink); outline-offset: -5px; padding: 14px 18px 12px; min-height: 276mm; display: flex; flex-direction: column; }
  .meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 9.5pt; }
  h2 { text-align: center; margin: ${isTc ? "10px 0 10px" : "34px 0 28px"}; }
  h2 span { display: inline-block; padding: 4px 26px; border: 1.5px solid var(--ink); border-radius: 3px; font: 700 ${isTc ? "13pt" : "15pt"} Georgia, "Times New Roman", serif; letter-spacing: .14em; text-transform: uppercase; color: var(--ink); }
  .para { text-align: justify; margin: 0 0 16px; text-indent: 2.2em; }
  .para b { border-bottom: 1px dotted #6b7380; font-weight: 700; }
  .tc { width: 100%; border-collapse: collapse; }
  .tc td { border: 1px solid var(--line); padding: 3.4px 7px; vertical-align: top; }
  .tc .lbl { width: 52%; color: #3b4452; }
  .tc td:last-child { font-weight: 600; }
  .decl { margin: 10px 0 0; font-style: italic; }
  .fee { width: 75%; margin: 4px auto 22px; border-collapse: collapse; }
  .fee td { border: 1px solid var(--line); padding: 6px 12px; }
  .fee .r { text-align: right; font-weight: 700; white-space: nowrap; }
  .fee .tot td { background: #eef1f6; font-weight: 700; }
  .signs { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-top: auto; padding-top: 50px; text-align: center; font-size: 9.5pt; font-weight: 600; }
  .signs > div { flex: 1; max-width: 56mm; }
  .line { border-top: 1px solid #1b2430; margin-bottom: 3px; }
  .muted { color: #6b7380; font-weight: 400; font-size: 8.5pt; }
  .seal { width: 26mm; height: 26mm; border: 1px dashed #9aa3af; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #9aa3af; font-size: 8pt; font-weight: 400; margin: 0 auto; }
  .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .wm span { font: 700 64pt "Segoe UI", Arial, sans-serif; color: rgba(180, 35, 24, .14); transform: rotate(-28deg); letter-spacing: .1em; }
</style></head><body>
  <div class="page">
    ${letterheadHtml(sch)}
    <div class="meta">
      <span>${isTc ? "TC No." : "Ref. No."} <b>${esc(c.serialNo ?? "— (draft)")}</b></span>
      ${isTc ? `<span>Admission No. <b>${v(c.data, "admissionNo")}</b></span>` : ""}
      <span>Date: <b>${esc(dmy(c.issueDate))}</b></span>
    </div>
    <h2><span>${TITLES[c.type]}</span></h2>
    ${body(c, sch)}
    <div class="signs">
      ${isTc ? `<div><div class="line"></div>Prepared by<div class="muted">Class Teacher</div></div><div><div class="line"></div>Checked by<div class="muted">Office</div></div>` : `<div>${sealHtml(sch) || '<div class="seal">School seal</div>'}</div>`}
      <div>${signatureHtml(sch, 12)}<div class="line"></div>Principal${sch.principalName ? `<div class="muted">${esc(sch.principalName)}</div>` : ""}<div class="muted">${esc(sch.schoolName || "")}</div></div>
    </div>
    ${watermark ? `<div class="wm"><span>${watermark}</span></div>` : ""}
  </div>
</body></html>`;
  printHtml(html);
};
