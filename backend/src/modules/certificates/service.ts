import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { getCurrentSession } from "../sessions/service";
import { getStudentHistory } from "../students/historyService";

// Student certificates: Transfer (TC), Bonafide, Character and Fee certificates.
//  - prefill builds every printed field from the student's record; the office can edit
//    any of them before issuing.
//  - issue saves the fields as a snapshot with a serial number per type and session, so
//    a reprint always matches what was handed over.
//  - a wrong certificate is cancelled with a reason, never deleted.
//  - issuing a TC can mark the student as left; cancelling that TC undoes it.

export const CERTIFICATE_TYPES = {
  TRANSFER: { prefix: "TC", label: "Transfer Certificate" },
  BONAFIDE: { prefix: "BC", label: "Bonafide Certificate" },
  CHARACTER: { prefix: "CC", label: "Character Certificate" },
  FEE: { prefix: "FC", label: "Fee Certificate" },
} as const;
export type CertificateType = keyof typeof CERTIFICATE_TYPES;

const assertType = (v: unknown): CertificateType => {
  if (typeof v !== "string" || !(v in CERTIFICATE_TYPES)) throw httpError(400, `type must be one of ${Object.keys(CERTIFICATE_TYPES).join(", ")}`);
  return v as CertificateType;
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const ORDINAL_ONES = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth"];
const ORDINAL_TENS = ["", "", "Twentieth", "Thirtieth"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const words = (n: number): string => {
  if (n < 20) return ONES[n];
  if (n < 100) return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
  if (n < 1000) return [`${ONES[Math.floor(n / 100)]} Hundred`, words(n % 100)].filter(Boolean).join(" ");
  return [`${words(Math.floor(n / 1000))} Thousand`, words(n % 1000)].filter(Boolean).join(" ");
};
const ordinal = (n: number) => (n < 20 ? ORDINAL_ONES[n] : n % 10 === 0 ? ORDINAL_TENS[n / 10] : `${TENS[Math.floor(n / 10)]} ${ORDINAL_ONES[n % 10]}`);

// Dates of birth/admission are saved as midnight in India (18:30 UTC the day before) or as
// midnight UTC; reading them in IST gives the intended calendar date either way.
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000);
const dmy = (d: Date | null | undefined) => {
  if (!d) return "";
  const x = ist(d);
  return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
};
const dateInWords = (d: Date | null | undefined) => {
  if (!d) return "";
  const x = ist(d);
  return `${ordinal(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]} ${words(x.getUTCFullYear())}`;
};
const todayIso = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const isoToDmy = (iso: string) => iso.split("-").reverse().join("/");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const CATEGORY: Record<string, string> = { GENERAL: "General", OBC: "OBC", SC: "SC", ST: "ST", EWS: "EWS" };
const RESULT_TEXT: Record<string, string> = { PASS: "Passed", FAIL: "Failed", ABSENT: "Absent", PENDING: "Result pending", NOT_ENTERED: "Result pending" };

// ---------------------------------------------------------------------------
// Prefill
// ---------------------------------------------------------------------------

export const prefillCertificate = async (studentId: number, rawType: unknown) => {
  const type = assertType(rawType);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { classSection: { include: { session: true, subjects: { select: { name: true }, orderBy: { name: "asc" } } } } },
  });
  if (!student) throw httpError(404, "Student not found");

  const className = `${student.classSection.className} - ${student.classSection.section}`;
  const sessionName = student.classSection.session.name;
  const common: Record<string, string> = {
    studentName: student.name,
    fatherName: student.fatherName ?? "",
    motherName: student.motherName ?? "",
    gender: student.gender ?? "",
    dob: dmy(student.dob),
    dobWords: dateInWords(student.dob),
    admissionNo: student.admissionNo,
    admissionDate: dmy(student.admissionDate),
    className,
    sessionName,
    address: student.address ?? "",
  };

  if (type === "BONAFIDE") return { ...common, purpose: "" };

  if (type === "CHARACTER") {
    return {
      ...common,
      studyFrom: student.admissionDate ? String(ist(student.admissionDate).getUTCFullYear()) : "",
      studyTo: String(new Date().getFullYear()),
      conduct: "Good",
      remarks: "",
    };
  }

  const history = await getStudentHistory(studentId);

  if (type === "FEE") {
    const charges = (history?.fees.charges ?? []).filter((c: any) => c.sessionName === sessionName);
    const tuition = charges.filter((c: any) => /tuition/i.test(c.feeHead)).reduce((s: number, c: any) => s + c.paidAmount, 0);
    const total = charges.reduce((s: number, c: any) => s + c.paidAmount, 0);
    return {
      ...common,
      feeSession: sessionName,
      tuitionFee: rupees(tuition),
      otherFee: rupees(total - tuition),
      totalFee: rupees(total),
      purpose: "Income tax deduction (Section 80C)",
    };
  }

  // TRANSFER
  const thisSession = history?.attendance.sessions.find((s: any) => s.sessionName === sessionName);
  const latestExam = history?.exams[0];
  const firstYear = history?.academicHistory[history.academicHistory.length - 1];
  const due = history?.fees.summary.totalOutstanding;
  const concessions = (history?.fees.concessions ?? []).filter((c: any) => !/CANCEL|REVOK|REJECT|EXPIRE/i.test(String(c.status))).map((c: any) => c.name).filter(Boolean);
  return {
    ...common,
    apaarId: student.apaarId ?? "",
    nationality: student.nationality ?? "Indian",
    category: student.category ? CATEGORY[student.category] ?? student.category : "",
    firstAdmissionClass: firstYear?.classes[0] ?? "",
    classLastStudied: className,
    lastExamResult: latestExam ? `${latestExam.examName} (${latestExam.sessionName ?? sessionName}) — ${RESULT_TEXT[latestExam.status] ?? latestExam.status}` : "",
    failedInSameClass: "No",
    subjects: student.classSection.subjects.map((s: any) => s.name).join(", "),
    promotion: latestExam?.status === "PASS" ? "Yes" : latestExam?.status === "FAIL" ? "No" : "",
    feeDues: due == null ? "" : due > 0 ? `${rupees(due)} pending` : "No dues",
    concession: concessions.length ? concessions.join(", ") : "No",
    workingDays: thisSession ? String(thisSession.totals.marked) : "",
    daysPresent: thisSession ? String(thisSession.totals.counts.PRESENT + thisSession.totals.counts.LATE) : "",
    ncc: "No",
    games: "",
    conduct: "Good",
    applicationDate: isoToDmy(todayIso()),
    reason: "Parent's request",
    remarks: "",
  };
};

// ---------------------------------------------------------------------------
// Issue / cancel / list
// ---------------------------------------------------------------------------

const cleanData = (raw: unknown) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw httpError(400, "data must be an object of fields");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 60) throw httpError(400, "Too many fields");
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw httpError(400, `Invalid field "${k}"`);
    const s = v === null || v === undefined ? "" : String(v).trim();
    if (s.length > 1000) throw httpError(400, `${k} is too long`);
    out[k] = s;
  }
  if (!out.studentName) throw httpError(400, "Student name is required");
  return out;
};

const nextSerial = async (tx: any, type: CertificateType, sessionName: string) => {
  const prefix = `${CERTIFICATE_TYPES[type].prefix}/${sessionName}/`;
  const existing = await tx.studentCertificate.findMany({ where: { serialNo: { startsWith: prefix } }, select: { serialNo: true } });
  const max = existing.reduce((m: number, c: any) => Math.max(m, Number(c.serialNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
};

const withUser = { issuedByUser: { select: { name: true } } };

export const issueCertificate = async (actor: { id: number }, studentId: number, body: any) => {
  const type = assertType(body?.type);
  const data = cleanData(body?.data);
  const issueDate = body?.issueDate ?? todayIso();
  if (typeof issueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw httpError(400, "issueDate must be a date (YYYY-MM-DD)");
  const markLeft = type === "TRANSFER" && body?.markLeft === true;

  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { classSection: { include: { session: true } } } });
  if (!student) throw httpError(404, "Student not found");

  if (type === "TRANSFER") {
    const active = await prisma.studentCertificate.findFirst({ where: { studentId, type: "TRANSFER", cancelledAt: null }, select: { serialNo: true } });
    if (active) throw httpError(409, `A Transfer Certificate (${active.serialNo}) has already been issued. Cancel it first to issue a new one.`);
  }

  const sessionName = (await getCurrentSession())?.name ?? student.classSection.session.name;

  // Two people issuing at once can pick the same number; the unique index rejects the
  // second, which then retries with the next number.
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const serialNo = await nextSerial(tx, type, sessionName);
        const cert = await tx.studentCertificate.create({
          data: { serialNo, type, studentId, issueDate: new Date(`${issueDate}T00:00:00.000Z`), data: { ...data, markedLeft: markLeft ? "yes" : "" }, issuedByUserId: actor.id },
          include: withUser,
        });
        if (markLeft) {
          await tx.student.update({ where: { id: studentId }, data: { isActive: false } });
          await tx.studentEnrollment.upsert({
            where: { studentId_sessionId: { studentId, sessionId: student.classSection.sessionId } },
            create: { studentId, sessionId: student.classSection.sessionId, classSectionId: student.classSectionId, rollNo: student.rollNo, outcome: "LEFT", remarks: `TC ${serialNo}` },
            update: { outcome: "LEFT", remarks: `TC ${serialNo}` },
          });
        }
        return cert;
      });
    } catch (err: any) {
      if (err?.code === "P2002" && attempt < 3) continue;
      throw err;
    }
  }
};

export const cancelCertificate = async (actor: { id: number }, id: number, reason: unknown) => {
  if (typeof reason !== "string" || reason.trim().length < 3) throw httpError(400, "Please give a reason for cancelling");
  const cert = await prisma.studentCertificate.findUnique({ where: { id }, include: { student: { include: { classSection: true } } } });
  if (!cert) throw httpError(404, "Certificate not found");
  if (cert.cancelledAt) throw httpError(409, "This certificate is already cancelled");

  return prisma.$transaction(async (tx: any) => {
    const updated = await tx.studentCertificate.update({
      where: { id },
      data: { cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: reason.trim() },
      include: withUser,
    });
    // Undo "left school" if this TC set it.
    if (cert.type === "TRANSFER" && (cert.data as any)?.markedLeft === "yes") {
      await tx.student.update({ where: { id: cert.studentId }, data: { isActive: true } });
      await tx.studentEnrollment.updateMany({
        where: { studentId: cert.studentId, remarks: `TC ${cert.serialNo}` },
        data: { outcome: null, remarks: null },
      });
    }
    return updated;
  });
};

export const listStudentCertificates = (studentId: number) =>
  prisma.studentCertificate.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: withUser });

// Certificate register: everything issued, newest first.
export const listCertificateRegister = (type?: unknown) =>
  prisma.studentCertificate.findMany({
    where: type ? { type: assertType(type) } : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { ...withUser, student: { select: { id: true, name: true, admissionNo: true } } },
  });
