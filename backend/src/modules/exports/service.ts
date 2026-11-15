import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { getDefaultersReport } from "../fees/ledgerService";
import { getDayBook } from "../fees/dayBookService";
import { getClassAttendanceRecords } from "../attendance/service";
import { getExamAnalysis } from "../exams/analysisService";
import type { Sheet } from "./workbook";

// Excel exports. General lists mask Aadhaar to the last 4 digits; only the UDISE+ sheet, which
// the government return asks for, carries the full number.

const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Transgender / Other" };
const CATEGORY: Record<string, string> = { GENERAL: "General", OBC: "OBC", SC: "SC", ST: "ST", EWS: "EWS" };
const mask = (v?: string | null) => (v ? `XXXX XXXX ${v.slice(-4)}` : null);
const classLabel = (c?: { className: string; section: string } | null) => (c ? `${c.className} - ${c.section}` : null);

const currentSession = async () => {
  const s = await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } });
  if (!s) throw httpError(400, "Set the current academic session first (Settings -> Academic sessions)");
  return s;
};

const studentInclude = {
  classSection: { select: { id: true, className: true, section: true } },
  user: { select: { isActive: true } },
  transportAssignments: { where: { status: "ACTIVE" }, take: 1, include: { village: { select: { name: true } } } },
} as const;

// Class order the way schools read it: Nursery, LKG, UKG, Class 1 ... Class 10.
const classRank = (name: string) => {
  const pre = ["NURSERY", "LKG", "UKG"].indexOf(name.toUpperCase());
  if (pre >= 0) return pre;
  const n = Number(name.match(/\d+/)?.[0]);
  return Number.isFinite(n) ? 10 + n : 100;
};
const byClassThenRoll = (a: any, b: any) =>
  classRank(a.classSection.className) - classRank(b.classSection.className) ||
  a.classSection.section.localeCompare(b.classSection.section) ||
  (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0) ||
  a.name.localeCompare(b.name);

// ---- Students --------------------------------------------------------------------------------

export const studentsSheet = async (opts: { classSectionId?: number; status?: string }): Promise<Sheet[]> => {
  const session = await currentSession();
  const students = await prisma.student.findMany({
    where: {
      ...(opts.classSectionId ? { classSectionId: opts.classSectionId } : { classSection: { sessionId: session.id } }),
      ...(opts.status === "all" ? {} : opts.status === "left" ? { isActive: false } : { isActive: true }),
    },
    include: studentInclude,
  });
  students.sort(byClassThenRoll);
  return [
    {
      name: "Students",
      columns: [
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Name", key: "name", width: 24 },
        { header: "Class", key: "className", width: 10 },
        { header: "Section", key: "section", width: 9 },
        { header: "Roll no.", key: "rollNo", width: 8 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Date of birth", key: "dob", type: "date", width: 13 },
        { header: "Father's name", key: "fatherName", width: 22 },
        { header: "Father's phone", key: "fatherContact", width: 14 },
        { header: "Mother's name", key: "motherName", width: 22 },
        { header: "Mother's phone", key: "motherContact", width: 14 },
        { header: "Student's phone", key: "contactNumber", width: 14 },
        { header: "Address", key: "address", width: 36 },
        { header: "Category", key: "category", width: 10 },
        { header: "Blood group", key: "bloodGroup", width: 10 },
        { header: "Aadhaar (masked)", key: "aadhaar", width: 17 },
        { header: "APAAR ID", key: "apaarId", width: 15 },
        { header: "Admission date", key: "admissionDate", type: "date", width: 13 },
        { header: "Previous school", key: "previousSchool", width: 24 },
        { header: "Transport", key: "transport", width: 16 },
        { header: "Status", key: "status", width: 9 },
        { header: "Has login", key: "hasLogin", width: 9 },
      ],
      rows: students.map((s: any) => ({
        admissionNo: s.admissionNo,
        name: s.name,
        className: s.classSection.className,
        section: s.classSection.section,
        rollNo: s.rollNo,
        gender: s.gender ? GENDER[s.gender] : null,
        dob: s.dob,
        fatherName: s.fatherName,
        fatherContact: s.fatherContact,
        motherName: s.motherName,
        motherContact: s.motherContact,
        contactNumber: s.contactNumber,
        address: s.address,
        category: s.category ? CATEGORY[s.category] : null,
        bloodGroup: s.bloodGroup,
        aadhaar: mask(s.aadharNumber),
        apaarId: s.apaarId,
        admissionDate: s.admissionDate,
        previousSchool: s.previousSchool,
        transport: s.transportAssignments[0]?.village?.name ?? null,
        status: s.isActive ? "Active" : "Left",
        hasLogin: !!s.user?.isActive,
      })),
    },
  ];
};

// UDISE+ student profile (SDMS). The ERP doesn't store every UDISE+ field; those columns are
// greyed and left empty for the office. The official Data Capture Format changes each year,
// so the office should check the columns against the current year's format.
export const udiseSheets = async (): Promise<Sheet[]> => {
  const session = await currentSession();
  const students = await prisma.student.findMany({ where: { isActive: true, classSection: { sessionId: session.id } }, include: studentInclude });
  students.sort(byClassThenRoll);
  const missing = (s: any) =>
    [!s.dob && "date of birth", !s.gender && "gender", !s.category && "category", !s.motherName && "mother's name", !s.fatherName && "father's name", !s.aadharNumber && "Aadhaar", !s.apaarId && "APAAR ID", !s.address && "address"].filter(Boolean).join(", ");
  const gaps = students.filter((s: any) => missing(s));
  return [
    {
      name: "UDISE+ students",
      note: `UDISE+ student data, session ${session.name}, ${students.length} students. Grey columns are not stored in the ERP: fill them in. Check the columns against this year's UDISE+ Data Capture Format before uploading. Contains full Aadhaar numbers: keep this file private and delete it after use.`,
      columns: [
        { header: "Class", key: "className", width: 9 },
        { header: "Section", key: "section", width: 8 },
        { header: "Roll no.", key: "rollNo", width: 8 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Admission date", key: "admissionDate", type: "date", width: 13 },
        { header: "Student's name", key: "name", width: 24 },
        { header: "Gender", key: "gender", width: 12 },
        { header: "Date of birth", key: "dob", type: "date", width: 13 },
        { header: "Mother's name", key: "motherName", width: 22 },
        { header: "Father's name", key: "fatherName", width: 22 },
        { header: "Guardian's name", key: "guardian", width: 18, notInErp: true },
        { header: "Aadhaar number", key: "aadhaar", width: 15 },
        { header: "Name as per Aadhaar", key: "aadhaarName", width: 22, notInErp: true },
        { header: "APAAR ID", key: "apaarId", width: 15 },
        { header: "Address", key: "address", width: 36 },
        { header: "Pincode", key: "pincode", width: 9, notInErp: true },
        { header: "Mobile number", key: "mobile", width: 14 },
        { header: "Alternate mobile", key: "altMobile", width: 14 },
        { header: "Email", key: "email", width: 18, notInErp: true },
        { header: "Mother tongue", key: "motherTongue", width: 12, notInErp: true },
        { header: "Social category", key: "category", width: 12 },
        { header: "Minority group", key: "minority", width: 12, notInErp: true },
        { header: "BPL beneficiary", key: "bpl", width: 11, notInErp: true },
        { header: "Disadvantaged group (EWS)", key: "ews", width: 14 },
        { header: "CWSN (disability)", key: "cwsn", width: 12, notInErp: true },
        { header: "Blood group", key: "bloodGroup", width: 10 },
        { header: "Nationality", key: "nationality", width: 11 },
        { header: "Previous school", key: "previousSchool", width: 22 },
        { header: "Transport facility", key: "transport", width: 12 },
      ],
      rows: students.map((s: any) => ({
        className: s.classSection.className,
        section: s.classSection.section,
        rollNo: s.rollNo,
        admissionNo: s.admissionNo,
        admissionDate: s.admissionDate,
        name: s.name,
        gender: s.gender ? GENDER[s.gender] : null,
        dob: s.dob,
        motherName: s.motherName,
        fatherName: s.fatherName,
        aadhaar: s.aadharNumber,
        apaarId: s.apaarId,
        address: s.address,
        mobile: s.fatherContact || s.motherContact || s.contactNumber,
        altMobile: s.motherContact && s.fatherContact ? s.motherContact : null,
        category: s.category && s.category !== "EWS" ? CATEGORY[s.category] : s.category === "EWS" ? "General" : null,
        ews: s.category === "EWS" ? "Yes" : s.category ? "No" : null,
        bloodGroup: s.bloodGroup,
        nationality: s.nationality,
        previousSchool: s.previousSchool,
        transport: s.transportAssignments.length ? "Yes" : "No",
      })),
    },
    {
      name: "Missing details",
      note: `${gaps.length} of ${students.length} students are missing details UDISE+ asks for. Fill them in on each student's profile, then export again.`,
      columns: [
        { header: "Class", key: "cls", width: 12 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Name", key: "name", width: 24 },
        { header: "Missing", key: "missing", width: 60 },
      ],
      rows: gaps.map((s: any) => ({ cls: classLabel(s.classSection), admissionNo: s.admissionNo, name: s.name, missing: missing(s) })),
    },
  ];
};

// CBSE List of Candidates for Class X (board registration). APAAR ID is mandatory for LOC.
// The upload template comes with each year's CBSE circular; this sheet is the school's data
// to check and copy from, plus a list of what's missing.
export const cbseLocSheets = async (classSectionId?: number): Promise<Sheet[]> => {
  const session = await currentSession();
  const sections = await prisma.classSection.findMany({
    where: classSectionId ? { id: classSectionId } : { sessionId: session.id, className: { in: ["Class 10", "Class X", "X", "10"] } },
    select: { id: true, className: true, section: true, subjects: { select: { name: true }, orderBy: { name: "asc" } } },
  });
  if (!sections.length) throw httpError(404, "No Class 10 sections found in the current session");
  const subjectsBySection = new Map(sections.map((c) => [c.id, c.subjects.map((s) => s.name).join(", ")]));
  const students = await prisma.student.findMany({ where: { isActive: true, classSectionId: { in: sections.map((s) => s.id) } }, include: studentInclude });
  students.sort(byClassThenRoll);
  const problems = (s: any) =>
    [!s.apaarId && "APAAR ID (mandatory)", !s.photoUrl && "photo", !s.dob && "date of birth", !s.gender && "gender", !s.category && "category", !s.motherName && "mother's name", !s.fatherName && "father's / guardian's name"].filter(Boolean).join(", ");
  const gaps = students.filter((s: any) => problems(s));
  return [
    {
      name: "LOC Class X",
      note: `CBSE List of Candidates, Class X, session ${session.name}: ${students.length} students. Names must match school records exactly. Grey columns are not stored in the ERP. Use the template from this year's CBSE LOC circular for the upload.`,
      columns: [
        { header: "S.No", key: "sno", width: 6, type: "number" },
        { header: "Section", key: "section", width: 8 },
        { header: "School roll no.", key: "rollNo", width: 9 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Candidate's name", key: "name", width: 24 },
        { header: "Mother's name", key: "motherName", width: 22 },
        { header: "Father's / Guardian's name", key: "fatherName", width: 22 },
        { header: "Gender", key: "gender", width: 10 },
        { header: "Date of birth", key: "dob", type: "date", width: 13 },
        { header: "Category", key: "category", width: 10 },
        { header: "Minority", key: "minority", width: 9, notInErp: true },
        { header: "CWSN", key: "cwsn", width: 8, notInErp: true },
        { header: "APAAR ID", key: "apaarId", width: 15 },
        { header: "Mobile", key: "mobile", width: 13 },
        { header: "Subjects (from the ERP)", key: "subjects", width: 40 },
        { header: "Subject codes", key: "codes", width: 16, notInErp: true },
        { header: "Photo on file", key: "photo", width: 9 },
      ],
      rows: students.map((s: any, i) => ({
        sno: i + 1,
        section: s.classSection.section,
        rollNo: s.rollNo,
        admissionNo: s.admissionNo,
        name: s.name,
        motherName: s.motherName,
        fatherName: s.fatherName,
        gender: s.gender ? GENDER[s.gender] : null,
        dob: s.dob,
        category: s.category ? CATEGORY[s.category] : null,
        apaarId: s.apaarId,
        mobile: s.fatherContact || s.motherContact || s.contactNumber,
        subjects: subjectsBySection.get(s.classSectionId) ?? null,
        photo: !!s.photoUrl,
      })),
    },
    {
      name: "Fix before LOC",
      note: `${gaps.length} of ${students.length} candidates have missing details. CBSE does not allow corrections after the LOC is submitted.`,
      columns: [
        { header: "Section", key: "section", width: 8 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Name", key: "name", width: 24 },
        { header: "Missing", key: "missing", width: 60 },
      ],
      rows: gaps.map((s: any) => ({ section: s.classSection.section, admissionNo: s.admissionNo, name: s.name, missing: problems(s) })),
    },
  ];
};

// ---- Staff (Super Admin: carries ID numbers and bank details) ---------------------------------

export const staffSheet = async (): Promise<Sheet[]> => {
  const staff = await prisma.staff.findMany({ include: { user: { select: { name: true, email: true, role: true, isActive: true } } }, orderBy: { id: "asc" } });
  return [
    {
      name: "Staff",
      note: "Contains Aadhaar, PAN and bank details. Keep this file private.",
      columns: [
        { header: "Employee code", key: "employeeCode", width: 13 },
        { header: "Name", key: "name", width: 24 },
        { header: "Designation", key: "designation", width: 16 },
        { header: "Login role", key: "role", width: 12 },
        { header: "Email", key: "email", width: 26 },
        { header: "Phone", key: "contact", width: 13 },
        { header: "Gender", key: "gender", width: 9 },
        { header: "Date of birth", key: "dob", type: "date", width: 13 },
        { header: "Blood group", key: "bloodGroup", width: 9 },
        { header: "Father's / spouse's name", key: "fatherOrSpouseName", width: 22 },
        { header: "Qualifications", key: "qualifications", width: 22 },
        { header: "Experience (years)", key: "experienceYears", type: "number", width: 10 },
        { header: "Joining date", key: "joiningDate", type: "date", width: 13 },
        { header: "Leaving date", key: "leavingDate", type: "date", width: 13 },
        { header: "Address", key: "address", width: 32 },
        { header: "Emergency contact", key: "emergencyContactName", width: 18 },
        { header: "Emergency phone", key: "emergencyContactPhone", width: 14 },
        { header: "Aadhaar", key: "aadhaarNumber", width: 15 },
        { header: "PAN", key: "panNumber", width: 12 },
        { header: "Bank", key: "bankName", width: 18 },
        { header: "Account no.", key: "bankAccountNo", width: 18 },
        { header: "IFSC", key: "bankIfsc", width: 12 },
        { header: "Employed", key: "employed", width: 9 },
        { header: "Can log in", key: "login", width: 9 },
      ],
      rows: staff.map((s: any) => ({
        ...s,
        name: s.user.name,
        email: s.user.email,
        role: s.user.role,
        designation: String(s.staffCategory).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        gender: s.gender ? GENDER[s.gender] : null,
        employed: s.isActive,
        login: s.user.isActive,
      })),
    },
  ];
};

// ---- Fees ------------------------------------------------------------------------------------

export const duesSheet = async (classSectionId?: number): Promise<Sheet[]> => {
  const rows = (await getDefaultersReport(classSectionId)).sort((a: any, b: any) => b.totalDue - a.totalDue);
  const total = rows.reduce((s: number, r: any) => s + r.totalDue, 0);
  return [
    {
      name: "Overdue fees",
      note: `Students with overdue fees (late fine included): ${rows.length}, total ₹${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.`,
      columns: [
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Name", key: "studentName", width: 24 },
        { header: "Class", key: "classSection", width: 12 },
        { header: "Roll no.", key: "rollNo", width: 8 },
        { header: "Father's name", key: "fatherName", width: 22 },
        { header: "Phone", key: "contactNumber", width: 13 },
        { header: "Overdue months", key: "months", width: 30 },
        { header: "Overdue (₹)", key: "totalDue", type: "money", width: 13 },
        { header: "Oldest due date", key: "oldestDueDate", type: "date", width: 13 },
        { header: "Days overdue", key: "daysOverdue", type: "number", width: 10 },
      ],
      rows: rows.map((r: any) => ({ ...r, months: r.overdueMonths.join(", ") })),
    },
  ];
};

const MODE: Record<string, string> = { CASH: "Cash", UPI_MANUAL: "UPI", BANK_TRANSFER: "Bank transfer", GATEWAY: "Online" };

export const dayBookSheets = async (from: unknown, to: unknown): Promise<Sheet[]> => {
  const d = await getDayBook(from, to);
  return [
    {
      name: "Receipts",
      note: `Fee day book ${d.from}${d.to !== d.from ? ` to ${d.to}` : ""}: ${d.totals.receipts} receipts, collected ₹${d.totals.collected}, refunded ₹${d.totals.refunded}, net ₹${d.totals.net}.`,
      columns: [
        { header: "Date", key: "paidAt", type: "date", width: 12 },
        { header: "Receipt no.", key: "receiptNumber", width: 18 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Student", key: "student", width: 24 },
        { header: "Class", key: "className", width: 12 },
        { header: "Mode", key: "mode", width: 12 },
        { header: "Reference", key: "transactionRef", width: 22 },
        { header: "Collected by", key: "collectedBy", width: 18 },
        { header: "Amount (₹)", key: "amount", type: "money", width: 13 },
      ],
      rows: d.receipts.map((r: any) => ({ ...r, mode: MODE[r.mode] ?? r.mode })),
    },
    {
      name: "By mode & collector",
      columns: [
        { header: "Group", key: "group", width: 16 },
        { header: "Name", key: "key", width: 22 },
        { header: "Receipts", key: "count", type: "number", width: 10 },
        { header: "Amount (₹)", key: "amount", type: "money", width: 14 },
      ],
      rows: [
        ...d.byMode.map((m: any) => ({ group: "Payment mode", ...m, key: MODE[m.key] ?? m.key })),
        ...d.byCollector.map((c: any) => ({ group: "Collected by", ...c })),
      ],
    },
    {
      name: "Refunds",
      columns: [
        { header: "Date", key: "processedAt", type: "date", width: 12 },
        { header: "Refund no.", key: "refundNumber", width: 16 },
        { header: "Admission no.", key: "admissionNo", width: 14 },
        { header: "Student", key: "student", width: 24 },
        { header: "Reason", key: "reason", width: 30 },
        { header: "Amount (₹)", key: "amount", type: "money", width: 13 },
      ],
      rows: d.refunds,
    },
    {
      name: "Cancelled receipts",
      columns: [
        { header: "Receipt no.", key: "receiptNumber", width: 18 },
        { header: "Student", key: "student", width: 24 },
        { header: "Amount (₹)", key: "amount", type: "money", width: 13 },
        { header: "Cancelled on", key: "cancelledAt", type: "date", width: 13 },
        { header: "Cancelled by", key: "cancelledBy", width: 18 },
        { header: "Reason", key: "cancelReason", width: 30 },
      ],
      rows: d.cancelled,
    },
  ];
};

// ---- Attendance register: one row per student, one column per day ----------------------------

export const attendanceSheet = async (classSectionId: number, year: number, month: number): Promise<Sheet[]> => {
  if (!classSectionId || !year || !month || month < 1 || month > 12) throw httpError(400, "Pick a class and a month");
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { className: true, section: true } });
  if (!cs) throw httpError(404, "Class not found");
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const [records, students] = await Promise.all([
    getClassAttendanceRecords(classSectionId, new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month - 1, days))),
    prisma.student.findMany({ where: { classSectionId, isActive: true }, select: { id: true, name: true, rollNo: true, admissionNo: true } }),
  ]);
  const MARK: Record<string, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "LV" };
  const grid = new Map<number, Record<string, unknown>>();
  for (const s of students) grid.set(s.id, { rollNo: s.rollNo, admissionNo: s.admissionNo, name: s.name, P: 0, A: 0, L: 0, LV: 0 });
  for (const r of records as any[]) {
    const row = grid.get(r.studentId);
    if (!row) continue;
    const mark = MARK[String(r.status)] ?? String(r.status).charAt(0);
    row[`d${new Date(r.date).getUTCDate()}`] = mark;
    if (mark in row) (row as any)[mark] = Number((row as any)[mark]) + 1;
  }
  const rows = [...grid.values()].sort((a: any, b: any) => (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0) || String(a.name).localeCompare(String(b.name)));
  for (const r of rows as any[]) {
    const marked = r.P + r.A + r.L + r.LV;
    r.pct = marked ? Math.round(((r.P + r.L) / marked) * 1000) / 10 : null;
  }
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return [
    {
      name: `${cs.className}-${cs.section} ${month}-${year}`,
      note: `Attendance register, ${classLabel(cs)}, ${monthName}. P present, A absent, L late, LV leave. Blank: not marked (holiday or no entry).`,
      columns: [
        { header: "Roll", key: "rollNo", width: 6 },
        { header: "Admission no.", key: "admissionNo", width: 13 },
        { header: "Name", key: "name", width: 22 },
        ...Array.from({ length: days }, (_, i) => ({ header: String(i + 1), key: `d${i + 1}`, width: 4 })),
        { header: "P", key: "P", type: "number" as const, width: 5 },
        { header: "A", key: "A", type: "number" as const, width: 5 },
        { header: "L", key: "L", type: "number" as const, width: 5 },
        { header: "LV", key: "LV", type: "number" as const, width: 5 },
        { header: "Attendance %", key: "pct", type: "number" as const, width: 11 },
      ],
      rows,
    },
  ];
};

// ---- Marks register --------------------------------------------------------------------------
// One exam, one class: every student × subject with total, percentage, result and rank, plus a
// subject summary sheet. Same numbers as Results & Merit List on screen.
export const marksRegisterSheets = async (examId: number): Promise<{ filename: string; sheets: Sheet[] }> => {
  if (!Number.isInteger(examId) || examId <= 0) throw httpError(400, "Choose an exam");
  const a: any = await getExamAnalysis(examId);
  if (!a) throw httpError(404, "Exam not found");
  const cls = classLabel(a.exam.classSection);
  // Each subject's maximum marks as most students have it (shown in the column header).
  const maxFor = (subjectId: number) => {
    const counts = new Map<number, number>();
    for (const s of a.students) {
      const m = s.marks.find((x: any) => x.subjectId === subjectId);
      if (m?.entered) counts.set(m.maxMarks, (counts.get(m.maxMarks) ?? 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  };
  const RESULT: Record<string, string> = { PASS: "Pass", FAIL: "Fail", ABSENT: "Absent", PENDING: "Marks pending", NOT_ENTERED: "Not entered" };
  const subjectCols = a.subjects.map((s: any) => {
    const max = maxFor(s.id);
    return { header: `${s.name}${max ? ` (${max})` : ""}`, key: `s${s.id}`, width: Math.min(18, Math.max(9, s.name.length + 6)) };
  });
  const students = [...a.students].sort((x: any, y: any) => (Number(x.rollNo) || 0) - (Number(y.rollNo) || 0) || x.name.localeCompare(y.name));
  const rows = students.map((s: any, i: number) => {
    const row: Record<string, unknown> = {
      sno: i + 1,
      rollNo: s.rollNo,
      admissionNo: s.admissionNo,
      name: s.name,
      total: s.maxTotal ? s.total : null,
      maxTotal: s.maxTotal || null,
      percentage: s.percentage,
      result: RESULT[s.status] ?? s.status,
      failed: s.failedSubjects.join(", "),
      rank: s.rank,
    };
    for (const m of s.marks) row[`s${m.subjectId}`] = !m.entered ? null : m.isAbsent ? "AB" : m.marksObtained;
    return row;
  });
  const register: Sheet = {
    name: "Marks register",
    note: `${a.exam.name} · ${cls}${a.exam.sessionName ? ` · Session ${a.exam.sessionName}` : ""} · Pass mark ${a.passPercentage}% per subject · AB = absent, blank = not entered${a.exam.isLocked ? "" : " · Marks not locked yet, so they may still change"}`,
    columns: [
      { header: "S.No", key: "sno", width: 6, type: "number" },
      { header: "Roll No", key: "rollNo", width: 8 },
      { header: "Admission No", key: "admissionNo", width: 14 },
      { header: "Student", key: "name", width: 26 },
      ...subjectCols,
      { header: "Total", key: "total", width: 9, type: "number" },
      { header: "Out of", key: "maxTotal", width: 9, type: "number" },
      { header: "%", key: "percentage", width: 8, type: "number" },
      { header: "Result", key: "result", width: 13 },
      { header: "Failed in", key: "failed", width: 22 },
      { header: "Rank", key: "rank", width: 7, type: "number" },
    ],
    rows,
  };
  const summary: Sheet = {
    name: "Subject summary",
    columns: [
      { header: "Subject", key: "subject", width: 22 },
      { header: "Entered", key: "entered", type: "number" },
      { header: "Appeared", key: "appeared", type: "number" },
      { header: "Absent", key: "absent", type: "number" },
      { header: "Passed", key: "passed", type: "number" },
      { header: "Failed", key: "failed", type: "number" },
      { header: "Pass %", key: "passRate", type: "number" },
      { header: "Average %", key: "avg", type: "number" },
      { header: "Highest %", key: "high", type: "number" },
      { header: "Lowest %", key: "low", type: "number" },
      { header: "Topper(s)", key: "toppers", width: 30 },
    ],
    rows: a.subjectStats.map((s: any) => ({
      subject: s.subjectName,
      entered: s.entered,
      appeared: s.appeared,
      absent: s.absent,
      passed: s.passed,
      failed: s.failed,
      passRate: s.passRate,
      avg: s.averagePercentage,
      high: s.highestPercentage,
      low: s.lowestPercentage,
      toppers: s.toppers.map((t: any) => `${t.name} (${t.marksObtained}/${t.maxMarks})`).join(", "),
    })),
  };
  return { filename: `Marks_register_${a.exam.name}_${cls}`, sheets: [register, summary] };
};

// ---- Transport -------------------------------------------------------------------------------
// Students using school transport now: route, vehicle and driver, stop (village), class and
// parent contacts, for drivers, conductors and the transport in-charge. Also used for the print.
export type TransportRider = {
  route: string | null;
  vehicle: string | null;
  driver: string | null;
  stop: string;
  className: string | null;
  rollNo: string;
  admissionNo: string;
  name: string;
  fatherName: string | null;
  contact: string | null;
  monthlyFee: number;
  since: Date;
};

export const transportRiders = async (): Promise<TransportRider[]> => {
  const assignments = await prisma.studentTransportAssignment.findMany({
    where: { status: "ACTIVE", student: { isActive: true } },
    include: {
      village: { select: { name: true, monthlyFee: true } },
      student: {
        select: {
          name: true,
          rollNo: true,
          admissionNo: true,
          fatherName: true,
          fatherContact: true,
          motherContact: true,
          contactNumber: true,
          classSection: { select: { className: true, section: true } },
          transportRoute: { select: { routeName: true, vehicles: { select: { vehicleNo: true, driverName: true, driverContact: true } } } },
        },
      },
    },
  });
  const rows = assignments.map((t: any) => {
    const s = t.student;
    const vehicles: any[] = s.transportRoute?.vehicles ?? [];
    return {
      route: s.transportRoute?.routeName ?? null,
      vehicle: vehicles.map((v) => v.vehicleNo).join(", ") || null,
      driver: vehicles.map((v) => [v.driverName, v.driverContact].filter(Boolean).join(" ")).filter(Boolean).join("; ") || null,
      stop: t.village.name,
      className: classLabel(s.classSection),
      classSection: s.classSection,
      rollNo: s.rollNo,
      admissionNo: s.admissionNo,
      name: s.name,
      fatherName: s.fatherName,
      contact: s.fatherContact || s.contactNumber || s.motherContact || null,
      monthlyFee: Number(t.monthlyFee ?? t.village.monthlyFee),
      since: t.startDate,
    };
  });
  rows.sort((a: any, b: any) => (a.route ?? "~").localeCompare(b.route ?? "~") || a.stop.localeCompare(b.stop) || byClassThenRoll(a, b));
  return rows.map(({ classSection: _cs, ...r }: any) => r);
};

export const transportSheets = async (): Promise<Sheet[]> => {
  const rows = await transportRiders();
  const byStop = new Map<string, { stop: string; route: string | null; students: number; monthlyFee: number }>();
  for (const r of rows) {
    const k = `${r.route ?? ""}|${r.stop}`;
    const g = byStop.get(k) ?? { stop: r.stop, route: r.route, students: 0, monthlyFee: 0 };
    g.students += 1;
    g.monthlyFee += r.monthlyFee || 0;
    byStop.set(k, g);
  }
  return [
    {
      name: "Transport students",
      note: "Students currently using school transport, by route and stop. Contact = father's number, else the student's or mother's.",
      columns: [
        { header: "Route", key: "route", width: 18 },
        { header: "Vehicle", key: "vehicle", width: 14 },
        { header: "Driver", key: "driver", width: 24 },
        { header: "Stop / village", key: "stop", width: 18 },
        { header: "Class", key: "className", width: 12 },
        { header: "Roll No", key: "rollNo", width: 8 },
        { header: "Admission No", key: "admissionNo", width: 14 },
        { header: "Student", key: "name", width: 24 },
        { header: "Father", key: "fatherName", width: 22 },
        { header: "Contact", key: "contact", width: 14 },
        { header: "Monthly fee", key: "monthlyFee", type: "money", width: 12 },
        { header: "Using since", key: "since", type: "date", width: 12 },
      ],
      rows: rows.map((r) => ({ ...r, route: r.route ?? "No route set" })),
    },
    {
      name: "By stop",
      columns: [
        { header: "Route", key: "route", width: 18 },
        { header: "Stop / village", key: "stop", width: 20 },
        { header: "Students", key: "students", type: "number" },
        { header: "Monthly fee total", key: "monthlyFee", type: "money", width: 16 },
      ],
      rows: [...byStop.values()].map((g) => ({ ...g, route: g.route ?? "No route set" })),
    },
  ];
};
