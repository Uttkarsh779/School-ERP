import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";
import { checkoutSignatureValid, createGatewayOrder, onlinePaymentAvailable } from "../fees/razorpayService";
import { createStudent, suggestNextAdmissionNo } from "../students/service";
import { classRank } from "../sessions/rolloverService";
import { deletePrivateFile, readPrivateFile, storePrivateFile } from "../studentRecords/documentsService";

// Online admissions: enquiry → application → test / interview → selected → admitted.
//  - The website takes quick enquiries (always) and full applications (while the office has
//    admissions open for a session). Families can check status and pay the registration fee
//    online with their application number and mobile number.
//  - The registration fee is one amount with optional per-class amounts (Super Admin sets
//    them). It's paid online (Razorpay) or recorded at the office; the Accounts summary counts
//    paid fees as income automatically.
//  - Admitting creates the student record in the chosen class and moves the uploaded
//    documents onto it. Every step is written to the application's timeline.

export const STAGES = ["ENQUIRY", "APPLIED", "TEST", "SELECTED", "ADMITTED", "REJECTED", "WITHDRAWN"] as const;
export type Stage = (typeof STAGES)[number];
const OPEN_STAGES: Stage[] = ["ENQUIRY", "APPLIED", "TEST", "SELECTED"];
export const FILE_TYPES: Record<string, string> = {
  BIRTH_CERTIFICATE: "Birth certificate",
  AADHAAR: "Aadhaar card",
  MARKSHEET: "Previous marksheet / report card",
  TRANSFER_CERTIFICATE: "Transfer certificate",
  OTHER: "Other",
};
const MAX_FILES = 3;
const FEE_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"] as const;
const FILE_FOLDER = "school_erp/admission_files";
const KEEP_CLOSED_FILES_DAYS = 90;

type Actor = { id: number; role: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const num = (d: unknown) => (d === null || d === undefined ? 0 : Number(d));
const text = (v: unknown, max = 120) => {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return t ? t.slice(0, max) : null;
};
const longText = (v: unknown, max = 1000) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};
// Indian mobile: 10 digits starting 6–9, after dropping spaces, dashes, +91 or a leading 0.
export const normalPhone = (v: unknown) => {
  const d = String(v ?? "").replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? d : null;
};
const phoneOrThrow = (v: unknown, label: string, required = false) => {
  if (v === undefined || v === null || String(v).trim() === "") {
    if (required) throw httpError(400, `${label} is required`);
    return null;
  }
  const p = normalPhone(v);
  if (!p) throw httpError(400, `${label} should be a 10-digit mobile number`);
  return p;
};
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const dayOrNull = (v: unknown, label: string, opts: { notFuture?: boolean } = {}) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw httpError(400, `${label} isn't a valid date`);
  if (opts.notFuture && v > istToday()) throw httpError(400, `${label} can't be in the future`);
  return new Date(`${v}T00:00:00.000Z`);
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], label: string): T | null => {
  if (v === undefined || v === null || v === "") return null;
  if (!list.includes(v as T)) throw httpError(400, `Choose a valid ${label}`);
  return v as T;
};

const event = (tx: any, applicationId: number, action: string, userId: number | null, extra: { fromStage?: string; toStage?: string; note?: string | null } = {}) =>
  tx.admissionEvent.create({ data: { applicationId, action, userId, fromStage: extra.fromStage ?? null, toStage: extra.toStage ?? null, note: extra.note ?? null } });

const sortClasses = (names: string[]) => [...new Set(names)].sort((a, b) => (classRank(a) ?? 99) - (classRank(b) ?? 99) || a.localeCompare(b));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const loadSettings = async () =>
  (await prisma.admissionSetting.findUnique({ where: { id: 1 }, include: { session: true } })) ??
  (await prisma.admissionSetting.create({ data: { id: 1 }, include: { session: true } }));

// Classes the school has (in the admission session, or the current session if that one has
// none set up yet).
const schoolClassNames = async (sessionId: number | null) => {
  const inSession = sessionId ? await prisma.classSection.findMany({ where: { sessionId }, select: { className: true } }) : [];
  if (inSession.length) return sortClasses(inSession.map((c) => c.className));
  const current = await prisma.classSection.findMany({ where: { session: { isCurrent: true } }, select: { className: true } });
  return sortClasses(current.map((c) => c.className));
};

const feeFor = (s: { defaultFee: unknown; classFees: unknown }, className: string) => {
  const per = (s.classFees ?? {}) as Record<string, unknown>;
  const v = per[className];
  return v === undefined || v === null || v === "" ? num(s.defaultFee) : num(v);
};

export const getSettings = async () => {
  const s = await loadSettings();
  const allClasses = await schoolClassNames(s.sessionId);
  return {
    isOpen: s.isOpen,
    sessionId: s.sessionId,
    sessionName: s.session?.name ?? null,
    classNames: s.classNames,
    allClasses,
    defaultFee: num(s.defaultFee),
    classFees: Object.fromEntries(Object.entries((s.classFees ?? {}) as Record<string, unknown>).map(([k, v]) => [k, num(v)])),
    closesOn: s.closesOn,
    instructions: s.instructions,
    allowUploads: s.allowUploads,
    onlinePayment: onlinePaymentAvailable(),
    updatedAt: s.updatedAt,
  };
};

const isAcceptingApplications = (s: Awaited<ReturnType<typeof getSettings>>) =>
  s.isOpen && !!s.sessionId && (!s.closesOn || new Date(s.closesOn).toISOString().slice(0, 10) >= istToday());

const openClassesOf = (s: Awaited<ReturnType<typeof getSettings>>) => (s.classNames.length ? sortClasses(s.classNames) : s.allClasses);

// What the website shows.
export const getPublicSettings = async () => {
  const s = await getSettings();
  const open = isAcceptingApplications(s);
  return {
    isOpen: open,
    sessionName: s.sessionName,
    closesOn: s.closesOn,
    instructions: s.instructions,
    allowUploads: s.allowUploads,
    onlinePayment: s.onlinePayment,
    classes: open ? openClassesOf(s).map((name) => ({ name, fee: feeFor(s, name) })) : [],
    // Enquiries are taken all year, for any class.
    enquiryClasses: s.allClasses,
    fileTypes: Object.entries(FILE_TYPES).map(([value, label]) => ({ value, label })),
  };
};

export const saveSettings = async (actor: Actor, body: Record<string, unknown>) => {
  const before = await loadSettings();
  const data: Record<string, unknown> = {};
  if (typeof body.isOpen === "boolean") data.isOpen = body.isOpen;
  if ("sessionId" in body) {
    const id = body.sessionId === null || body.sessionId === "" ? null : Number(body.sessionId);
    if (id !== null && !(await prisma.academicSession.findUnique({ where: { id } }))) throw httpError(400, "Session not found");
    data.sessionId = id;
  }
  if (Array.isArray(body.classNames)) data.classNames = sortClasses(body.classNames.map((c) => String(c).trim()).filter(Boolean).slice(0, 40));
  if ("closesOn" in body) data.closesOn = dayOrNull(body.closesOn, "Last date");
  if ("instructions" in body) data.instructions = longText(body.instructions, 3000);
  if (typeof body.allowUploads === "boolean") data.allowUploads = body.allowUploads;

  // Fee amounts are a money rule: Super Admin only.
  const touchesFee = "defaultFee" in body || "classFees" in body;
  if (touchesFee) {
    if (actor.role !== "SUPER_ADMIN") throw httpError(403, "Only the Super Admin can change the registration fee");
    if ("defaultFee" in body) {
      const f = Number(body.defaultFee);
      if (!Number.isFinite(f) || f < 0 || f > 100000) throw httpError(400, "Registration fee should be between ₹0 and ₹1,00,000");
      data.defaultFee = Math.round(f * 100) / 100;
    }
    if ("classFees" in body) {
      const raw = (body.classFees ?? {}) as Record<string, unknown>;
      if (typeof raw !== "object" || Array.isArray(raw)) throw httpError(400, "Class fees aren't valid");
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v === "" || v === null || v === undefined) continue;
        const f = Number(v);
        if (!Number.isFinite(f) || f < 0 || f > 100000) throw httpError(400, `Fee for ${k} should be between ₹0 and ₹1,00,000`);
        clean[String(k).slice(0, 40)] = Math.round(f * 100) / 100;
      }
      data.classFees = clean;
    }
  }
  const merged = { ...before, ...data } as any;
  if (merged.isOpen && !merged.sessionId) throw httpError(400, "Choose the session admissions are for");

  await prisma.admissionSetting.update({ where: { id: 1 }, data: { ...data, updatedByUserId: actor.id } });
  await createAuditLog({ action: "UPDATE", entityType: "AdmissionSetting", entityId: 1, userId: actor.id, oldValues: { isOpen: before.isOpen, sessionId: before.sessionId, defaultFee: num(before.defaultFee), classFees: before.classFees }, newValues: data });
  return getSettings();
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const yearOfSession = async (sessionId: number | null) => {
  const s = sessionId ? await prisma.academicSession.findUnique({ where: { id: sessionId } }) : null;
  return s ? new Date(s.startDate.getTime() + 5.5 * 3600_000).getUTCFullYear() : Number(istToday().slice(0, 4));
};

// APP-2027-0001 (per admission year) · enquiries without a session: ENQ-2026-0001.
const nextNumber = async (tx: any, prefix: string, field: "applicationNo" | "feeReceiptNo") => {
  const rows = await tx.admissionApplication.findMany({ where: { [field]: { startsWith: prefix } }, select: { [field]: true } });
  const max = rows.reduce((m: number, r: any) => Math.max(m, Number(String(r[field]).slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

// Retries when two applications pick the same number at the same moment.
const withUniqueRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
};

const receiptPrefix = async (sessionId: number | null) => {
  const s = sessionId ? await prisma.academicSession.findUnique({ where: { id: sessionId }, select: { name: true } }) : null;
  return `REG/${s?.name ?? istToday().slice(0, 4)}/`;
};

// ---------------------------------------------------------------------------
// Parsing an application
// ---------------------------------------------------------------------------

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
const CATEGORIES = ["GENERAL", "OBC", "SC", "ST", "EWS"] as const;
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

// Every editable detail. `full` = an application (not a quick enquiry) needs these.
const parseDetails = (body: Record<string, unknown>, full: boolean) => {
  const d: Record<string, unknown> = {
    studentName: text(body.studentName, 80),
    dob: dayOrNull(body.dob, "Date of birth", { notFuture: true }),
    gender: oneOf(body.gender, GENDERS, "gender"),
    bloodGroup: oneOf(body.bloodGroup, BLOOD, "blood group"),
    category: oneOf(body.category, CATEGORIES, "category"),
    nationality: text(body.nationality, 40),
    previousSchool: text(body.previousSchool, 120),
    previousClass: text(body.previousClass, 40),
    fatherName: text(body.fatherName, 80),
    fatherPhone: phoneOrThrow(body.fatherPhone, "Father's mobile"),
    fatherOccupation: text(body.fatherOccupation, 80),
    motherName: text(body.motherName, 80),
    motherPhone: phoneOrThrow(body.motherPhone, "Mother's mobile"),
    motherOccupation: text(body.motherOccupation, 80),
    address: longText(body.address, 300),
    message: longText(body.message, 1000),
    email: text(body.email, 120),
  };
  const aadhaar = String(body.aadharNumber ?? "").replace(/\s/g, "");
  if (aadhaar) {
    if (!/^[2-9]\d{11}$/.test(aadhaar)) throw httpError(400, "Aadhaar number should be 12 digits");
    d.aadharNumber = aadhaar;
  } else d.aadharNumber = null;
  if (d.email && !EMAIL_RE.test(d.email as string)) throw httpError(400, "Enter a valid email address");
  if (!d.studentName || (d.studentName as string).length < 2) throw httpError(400, "Enter the child's full name");
  if (full) {
    if (!d.dob) throw httpError(400, "Date of birth is required");
    if (!d.gender) throw httpError(400, "Choose the child's gender");
    if (!d.fatherName && !d.motherName) throw httpError(400, "Enter the father's or mother's name");
    if (!d.fatherPhone && !d.motherPhone) throw httpError(400, "Enter at least one parent's mobile number");
    if (!d.address) throw httpError(400, "Address is required");
  }
  return d;
};

// The main contact: whoever's number was given first (father, then mother), or the enquiry's.
const contactOf = (d: Record<string, any>) =>
  d.fatherPhone ? { contactName: d.fatherName ?? d.motherName, phone: d.fatherPhone } : { contactName: d.motherName ?? d.fatherName, phone: d.motherPhone };

// ---------------------------------------------------------------------------
// Website: enquiry, application, status, payment
// ---------------------------------------------------------------------------

// Quick enquiry (the old website form): name, parent, phone, class, message.
export const submitEnquiry = async (body: Record<string, unknown>) => {
  const studentName = text(body.studentName, 80);
  const contactName = text(body.parentName, 80);
  if (!studentName || studentName.length < 2 || !contactName || contactName.length < 2) throw httpError(400, "Please enter the student's and parent's names");
  const phone = phoneOrThrow(body.phone, "Mobile number", true)!;
  const className = text(body.gradeApplyingFor, 40);
  if (!className) throw httpError(400, "Choose the class you are applying for");
  const email = text(body.email, 120);
  if (email && !EMAIL_RE.test(email)) throw httpError(400, "Enter a valid email address");
  const s = await getSettings();
  const year = await yearOfSession(s.sessionId);
  const app = await withUniqueRetry<{ id: number }>(() =>
    prisma.$transaction(async (tx) => {
      const created = await tx.admissionApplication.create({
        data: {
          applicationNo: await nextNumber(tx, `ENQ-${year}-`, "applicationNo"),
          stage: "ENQUIRY",
          source: "WEBSITE_ENQUIRY",
          sessionId: s.sessionId,
          className,
          studentName,
          contactName,
          phone,
          email,
          previousSchool: text(body.currentSchool, 120),
          message: longText(body.message, 1000),
        },
      });
      await event(tx, created.id, "ENQUIRY", null, { toStage: "ENQUIRY" });
      return created;
    })
  );
  return { id: app.id };
};

type UploadedFile = { buffer: Buffer; mimetype: string; size: number; fieldname: string };

// Full application from the website (or entered by the office for a walk-in).
export const submitApplication = async (body: Record<string, unknown>, files: UploadedFile[], actor: Actor | null) => {
  const s = await getSettings();
  const byOffice = !!actor;
  if (!byOffice && !isAcceptingApplications(s)) throw httpError(400, "Online applications are closed right now. Please send an enquiry or contact the school office.");
  const sessionId = byOffice && body.sessionId ? Number(body.sessionId) : s.sessionId;
  if (!sessionId || !(await prisma.academicSession.findUnique({ where: { id: sessionId } }))) throw httpError(400, "Choose the session the application is for");
  const className = text(body.className, 40);
  const allowed = byOffice ? await schoolClassNames(sessionId) : openClassesOf(s);
  if (!className || !allowed.includes(className)) throw httpError(400, byOffice ? "Choose a class" : "Applications aren't open for that class");

  const details = parseDetails(body, true);
  const { contactName, phone } = contactOf(details);

  // The same child can't apply twice for the same session while an application is open.
  const dupe = await prisma.admissionApplication.findFirst({
    where: { sessionId, stage: { in: ["APPLIED", "TEST", "SELECTED"] }, studentName: { equals: details.studentName as string, mode: "insensitive" }, dob: details.dob as Date },
    select: { applicationNo: true },
  });
  if (dupe) throw httpError(409, `An application for this child is already in progress (${dupe.applicationNo}). Use "Check application status" to see it.`);

  if (files.length > MAX_FILES) throw httpError(400, `Attach at most ${MAX_FILES} files`);
  if (files.length && !s.allowUploads && !byOffice) throw httpError(400, "Please bring documents to the school office");
  const fileTypes = files.map((f, i) => {
    const t = String((body as any)[`fileType${i}`] ?? (body as any).fileTypes?.[i] ?? "OTHER");
    return t in FILE_TYPES ? t : "OTHER";
  });

  const fee = feeFor(s, className);
  const year = await yearOfSession(sessionId);

  // Files first (outside the transaction: storage is slow); removed again if saving fails.
  const stored: Array<{ docType: string } & Awaited<ReturnType<typeof storePrivateFile>>> = [];
  try {
    for (const [i, f] of files.entries()) stored.push({ docType: fileTypes[i], ...(await storePrivateFile(f, `app_${Date.now()}_${i}`, FILE_FOLDER)) });
    const app = await withUniqueRetry<{ id: number; applicationNo: string; feeStatus: string }>(() =>
      prisma.$transaction(async (tx) => {
        const created = await tx.admissionApplication.create({
          data: {
            applicationNo: await nextNumber(tx, `APP-${year}-`, "applicationNo"),
            stage: "APPLIED",
            source: byOffice ? "OFFICE" : "ONLINE_FORM",
            sessionId,
            className,
            ...(details as any),
            contactName: contactName as string,
            phone: phone as string,
            feeAmount: fee,
            feeStatus: fee > 0 ? "UNPAID" : "NONE",
          },
        });
        if (stored.length) await tx.admissionFile.createMany({ data: stored.map((f) => ({ applicationId: created.id, ...f })) });
        await event(tx, created.id, byOffice ? "ENTERED_BY_OFFICE" : "APPLIED_ONLINE", actor?.id ?? null, { toStage: "APPLIED" });
        return created;
      })
    );
    if (actor) await createAuditLog({ action: "CREATE", entityType: "AdmissionApplication", entityId: app.id, userId: actor.id, newValues: { applicationNo: app.applicationNo } });
    return { id: app.id, applicationNo: app.applicationNo, feeAmount: fee, feeStatus: app.feeStatus, onlinePayment: s.onlinePayment };
  } catch (e) {
    for (const f of stored) await deletePrivateFile(f).catch(() => undefined);
    throw e;
  }
};

const STAGE_TEXT: Record<string, string> = {
  ENQUIRY: "Enquiry received — the school will call you",
  APPLIED: "Application received",
  TEST: "Interaction / test scheduled",
  SELECTED: "Selected — please visit the office to complete admission",
  ADMITTED: "Admitted",
  REJECTED: "Not selected",
  WITHDRAWN: "Withdrawn",
};

// An application found by its number and any mobile number on it.
const findForFamily = async (applicationNo: unknown, phone: unknown) => {
  const no = String(applicationNo ?? "").trim().toUpperCase();
  const p = normalPhone(phone);
  if (!no || !p) throw httpError(400, "Enter the application number and the mobile number used on the form");
  const app = await prisma.admissionApplication.findUnique({ where: { applicationNo: no }, include: { session: { select: { name: true } } } });
  if (!app || ![app.phone, app.fatherPhone, app.motherPhone].includes(p)) throw httpError(404, "No application matches that number and mobile number");
  return app;
};

const familyView = (app: any) => ({
  applicationNo: app.applicationNo,
  studentName: app.studentName,
  className: app.className,
  sessionName: app.session?.name ?? null,
  stage: app.stage,
  stageText: STAGE_TEXT[app.stage] ?? app.stage,
  appliedOn: app.createdAt,
  testAt: app.stage === "TEST" ? app.testAt : null,
  testVenue: app.stage === "TEST" ? app.testVenue : null,
  fee: {
    amount: num(app.feeAmount),
    status: app.feeStatus,
    receiptNo: app.feeReceiptNo,
    paidAt: app.feePaidAt,
    mode: app.feeMode,
    reference: app.feeReference,
    contactName: app.contactName,
  },
  canPayOnline: app.feeStatus === "UNPAID" && num(app.feeAmount) > 0 && OPEN_STAGES.includes(app.stage) && onlinePaymentAvailable(),
});

export const getStatusForFamily = async (applicationNo: unknown, phone: unknown) => familyView(await findForFamily(applicationNo, phone));

export const startOnlinePayment = async (applicationNo: unknown, phone: unknown) => {
  const app = await findForFamily(applicationNo, phone);
  if (app.feeStatus !== "UNPAID" || num(app.feeAmount) <= 0) throw httpError(400, app.feeStatus === "PAID" ? "The registration fee is already paid" : "There's no registration fee to pay");
  if (!OPEN_STAGES.includes(app.stage as Stage)) throw httpError(400, "This application is closed");
  const amountInPaise = Math.round(num(app.feeAmount) * 100);
  const order = await createGatewayOrder(amountInPaise, app.applicationNo, { applicationNo: app.applicationNo, purpose: "registration_fee" });
  await prisma.admissionApplication.update({ where: { id: app.id }, data: { razorpayOrderId: order.orderId } });
  return { orderId: order.orderId, keyId: order.keyId, amountInPaise, currency: "INR", mock: order.mock, name: app.studentName, contact: app.phone, email: app.email };
};

// Marks the fee paid for a Razorpay order (checkout callback or webhook). Idempotent.
const confirmOnline = async (orderId: string, paymentId: string) =>
  prisma.$transaction(async (tx) => {
    const app = await tx.admissionApplication.findUnique({ where: { razorpayOrderId: orderId } });
    if (!app) return null;
    if (app.feeStatus === "PAID") return app;
    const updated = await tx.admissionApplication.update({
      where: { id: app.id },
      data: {
        feeStatus: "PAID",
        feePaidAt: new Date(),
        feeMode: "ONLINE",
        feeReference: paymentId,
        razorpayPaymentId: paymentId,
        feeReceiptNo: await nextNumber(tx, await receiptPrefix(app.sessionId), "feeReceiptNo"),
      },
    });
    await event(tx, app.id, "FEE_PAID_ONLINE", null, { note: `₹${num(app.feeAmount)} · ${paymentId}` });
    return updated;
  });

export const verifyOnlinePayment = async (applicationNo: unknown, phone: unknown, body: Record<string, unknown>) => {
  const app = await findForFamily(applicationNo, phone);
  const orderId = String(body.razorpayOrderId ?? "");
  const paymentId = String(body.razorpayPaymentId ?? "");
  const signature = String(body.razorpaySignature ?? "");
  if (!orderId || orderId !== app.razorpayOrderId || !paymentId) throw httpError(400, "This payment doesn't belong to the application");
  if (!checkoutSignatureValid(orderId, paymentId, signature)) throw httpError(400, "The payment couldn't be verified. If money was taken, it will be confirmed automatically, or contact the office.");
  await withUniqueRetry(() => confirmOnline(orderId, paymentId));
  return familyView(await findForFamily(applicationNo, phone));
};

// Razorpay webhook for registration-fee orders (registered with the fees webhook).
export const confirmFromWebhook = async (orderId: string, paymentId: string) => !!(await withUniqueRetry(() => confirmOnline(orderId, paymentId)));

// ---------------------------------------------------------------------------
// Office: list, view, edit
// ---------------------------------------------------------------------------

export const listApplications = async (q: { stage?: unknown; q?: unknown; sessionId?: unknown; className?: unknown }) => {
  const where: any = {};
  if (typeof q.stage === "string" && q.stage && q.stage !== "OPEN" && STAGES.includes(q.stage as Stage)) where.stage = q.stage;
  if (q.stage === "OPEN") where.stage = { in: OPEN_STAGES };
  if (Number(q.sessionId) > 0) where.sessionId = Number(q.sessionId);
  if (typeof q.className === "string" && q.className) where.className = q.className;
  const search = text(q.q, 60);
  if (search) {
    const digits = search.replace(/\D/g, "");
    where.OR = [
      { studentName: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { applicationNo: { contains: search, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  const countWhere = { ...where };
  delete countWhere.stage;
  const [rows, counts] = await Promise.all([
    prisma.admissionApplication.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 500,
      include: { session: { select: { name: true } }, _count: { select: { files: true } } },
    }),
    prisma.admissionApplication.groupBy({ by: ["stage"], where: countWhere, _count: { _all: true } }),
  ]);
  return {
    applications: rows.map((a) => ({
      id: a.id,
      applicationNo: a.applicationNo,
      stage: a.stage,
      source: a.source,
      sessionName: a.session?.name ?? null,
      className: a.className,
      studentName: a.studentName,
      contactName: a.contactName,
      phone: a.phone,
      contactedAt: a.contactedAt,
      testAt: a.testAt,
      testResult: a.testResult,
      feeAmount: num(a.feeAmount),
      feeStatus: a.feeStatus,
      files: a._count.files,
      admittedStudentId: a.admittedStudentId,
      createdAt: a.createdAt,
    })),
    counts: Object.fromEntries(counts.map((c) => [c.stage, c._count._all])) as Record<string, number>,
  };
};

export const getApplication = async (id: number) => {
  const a = await prisma.admissionApplication.findUnique({
    where: { id },
    include: {
      session: { select: { id: true, name: true } },
      files: { orderBy: { id: "asc" } },
      events: { orderBy: { id: "asc" } },
      admittedStudent: { select: { id: true, name: true, admissionNo: true } },
    },
  });
  if (!a) throw httpError(404, "Application not found");
  const userIds = [...new Set(a.events.map((e) => e.userId).filter((x): x is number => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    ...a,
    feeAmount: num(a.feeAmount),
    files: a.files.map((f) => ({ id: f.id, docType: f.docType, label: FILE_TYPES[f.docType] ?? f.docType, isPdf: f.mimeType === "application/pdf", bytes: f.bytes, moved: !!f.movedToDocumentId, createdAt: f.createdAt })),
    events: a.events.map((e) => ({ ...e, by: e.userId ? users.get(e.userId) ?? "Office" : "Family (website)" })),
  };
};

const load = async (id: number) => {
  const a = await prisma.admissionApplication.findUnique({ where: { id } });
  if (!a) throw httpError(404, "Application not found");
  return a;
};

export const updateDetails = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const a = await load(id);
  if (a.stage === "ADMITTED") {
    // After admission the student record is what counts; only notes stay editable here.
    if (Object.keys(body).some((k) => k !== "officeNotes")) throw httpError(400, "This child is admitted — edit the student record instead");
  }
  const data: Record<string, unknown> = {};
  if ("officeNotes" in body) data.officeNotes = longText(body.officeNotes, 2000);
  if (Object.keys(body).some((k) => k !== "officeNotes")) {
    const details = parseDetails({ ...a, dob: a.dob?.toISOString().slice(0, 10), ...body } as any, a.stage !== "ENQUIRY");
    Object.assign(data, details);
    const contact = a.stage === "ENQUIRY" && !details.fatherPhone && !details.motherPhone ? { contactName: text(body.contactName, 80) ?? a.contactName, phone: phoneOrThrow(body.phone ?? a.phone, "Mobile number", true)! } : contactOf(details);
    Object.assign(data, contact);
    if ("className" in body) {
      const className = text(body.className, 40);
      // Enquiries keep whatever class the family asked about; applications use the ERP's classes.
      if (!className || (a.stage !== "ENQUIRY" && !(await schoolClassNames(a.sessionId)).includes(className))) throw httpError(400, "Choose a class");
      data.className = className;
    }
    if ("sessionId" in body && a.stage === "ENQUIRY") {
      const sid = Number(body.sessionId) || null;
      if (sid && !(await prisma.academicSession.findUnique({ where: { id: sid } }))) throw httpError(400, "Session not found");
      data.sessionId = sid;
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.admissionApplication.update({ where: { id }, data });
    await event(tx, id, "EDITED", actor.id, { note: Object.keys(data).filter((k) => k !== "officeNotes").length ? "Details updated" : "Notes updated" });
  });
  return getApplication(id);
};

// ---------------------------------------------------------------------------
// Office: moving through the stages
// ---------------------------------------------------------------------------

const move = async (actor: Actor, id: number, toStage: Stage, data: Record<string, unknown>, note: string | null, action: string) => {
  const a = await load(id);
  await prisma.$transaction(async (tx) => {
    // Optimistic check: the stage didn't change under us (two people clicking at once).
    const done = await tx.admissionApplication.updateMany({ where: { id, stage: a.stage }, data: { stage: toStage, ...data } });
    if (done.count === 0) throw httpError(409, "Someone else just changed this application. Reload and try again.");
    await event(tx, id, action, actor.id, { fromStage: a.stage, toStage, note });
  });
  return getApplication(id);
};

export const changeStage = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const a = await load(id);
  const action = String(body.action ?? "");
  const note = longText(body.note, 500);
  const stage = a.stage as Stage;
  const need = (allowed: Stage[], what: string) => {
    if (!allowed.includes(stage)) throw httpError(400, `Can't ${what} an application that is ${stage.toLowerCase()}`);
  };

  switch (action) {
    case "CONTACTED": {
      need(["ENQUIRY"], "mark contacted");
      await prisma.$transaction(async (tx) => {
        await tx.admissionApplication.update({ where: { id }, data: { contactedAt: new Date() } });
        await event(tx, id, "CONTACTED", actor.id, { note });
      });
      return getApplication(id);
    }
    case "APPLY": {
      // Enquiry → application: the full details must be there now.
      need(["ENQUIRY"], "turn into an application");
      const merged = { ...a, dob: a.dob?.toISOString().slice(0, 10), ...body } as any;
      const details = parseDetails(merged, true);
      const sessionId = Number(body.sessionId ?? a.sessionId) || null;
      if (!sessionId) throw httpError(400, "Choose the session the application is for");
      const className = text(body.className ?? a.className, 40);
      if (!className || !(await schoolClassNames(sessionId)).includes(className)) throw httpError(400, "Choose a class (as named in the ERP)");
      const s = await getSettings();
      const fee = feeFor(s, className);
      return move(actor, id, "APPLIED", { ...details, ...contactOf(details), sessionId, className, feeAmount: fee, feeStatus: a.feeStatus === "NONE" && fee > 0 ? "UNPAID" : a.feeStatus }, note, "APPLICATION_STARTED");
    }
    case "SCHEDULE": {
      need(["APPLIED", "TEST"], "schedule a test for");
      const at = typeof body.testAt === "string" ? new Date(body.testAt) : null;
      if (!at || Number.isNaN(at.getTime())) throw httpError(400, "Choose the date and time");
      const venue = text(body.testVenue, 120);
      const when = at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
      return move(actor, id, "TEST", { testAt: at, testVenue: venue, testResult: null, testRemarks: null }, `${when}${venue ? ` · ${venue}` : ""}${note ? ` · ${note}` : ""}`, stage === "TEST" ? "RESCHEDULED" : "TEST_SCHEDULED");
    }
    case "RESULT": {
      need(["TEST"], "record a result for");
      const result = oneOf(body.testResult, ["PASS", "FAIL", "ABSENT"] as const, "result");
      if (!result) throw httpError(400, "Choose the result");
      const remarks = longText(body.testRemarks, 500);
      // Pass → selected. Fail / absent stay at "test" so the office decides (reject or reschedule).
      return move(actor, id, result === "PASS" ? "SELECTED" : "TEST", { testResult: result, testRemarks: remarks }, `Result: ${result.toLowerCase()}${remarks ? ` · ${remarks}` : ""}`, "TEST_RESULT");
    }
    case "SELECT":
      need(["APPLIED", "TEST"], "select");
      return move(actor, id, "SELECTED", {}, note, "SELECTED");
    case "REJECT":
    case "WITHDRAW": {
      need(OPEN_STAGES, action === "REJECT" ? "reject" : "withdraw");
      if (!note || note.length < 3) throw httpError(400, "Say why");
      return move(actor, id, action === "REJECT" ? "REJECTED" : "WITHDRAWN", { closedReason: note }, note, action === "REJECT" ? "REJECTED" : "WITHDRAWN");
    }
    case "REOPEN": {
      need(["REJECTED", "WITHDRAWN"], "reopen");
      const last = await prisma.admissionEvent.findFirst({ where: { applicationId: id, toStage: stage }, orderBy: { id: "desc" } });
      const back = (last?.fromStage && OPEN_STAGES.includes(last.fromStage as Stage) ? last.fromStage : "APPLIED") as Stage;
      return move(actor, id, back, { closedReason: null }, note, "REOPENED");
    }
    default:
      throw httpError(400, "Unknown action");
  }
};

// ---------------------------------------------------------------------------
// Office: registration fee
// ---------------------------------------------------------------------------

export const recordFee = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const a = await load(id);
  if (a.feeStatus !== "UNPAID") throw httpError(400, a.feeStatus === "PAID" ? "The fee is already paid" : "There's no fee due on this application");
  const mode = oneOf(body.mode, FEE_MODES, "payment mode");
  if (!mode) throw httpError(400, "Choose how it was paid");
  const reference = text(body.reference, 60);
  if ((mode === "UPI" || mode === "CHEQUE" || mode === "BANK_TRANSFER") && !reference) throw httpError(400, mode === "CHEQUE" ? "Enter the cheque number" : "Enter the UPI / transaction reference");
  await withUniqueRetry(() =>
    prisma.$transaction(async (tx) => {
      const done = await tx.admissionApplication.updateMany({
        where: { id, feeStatus: "UNPAID" },
        data: { feeStatus: "PAID", feePaidAt: new Date(), feeMode: mode, feeReference: reference, feeRecordedByUserId: actor.id, feeReceiptNo: await nextNumber(tx, await receiptPrefix(a.sessionId), "feeReceiptNo") },
      });
      if (done.count === 0) throw httpError(409, "The fee was just recorded by someone else");
      await event(tx, id, "FEE_PAID", actor.id, { note: `₹${num(a.feeAmount)} · ${mode}${reference ? ` · ${reference}` : ""}` });
    })
  );
  await createAuditLog({ action: "REGISTRATION_FEE", entityType: "AdmissionApplication", entityId: id, userId: actor.id, newValues: { amount: num(a.feeAmount), mode, reference } });
  return getApplication(id);
};

export const waiveFee = async (actor: Actor, id: number, reason: unknown) => {
  if (actor.role !== "SUPER_ADMIN") throw httpError(403, "Only the Super Admin can waive the registration fee");
  const a = await load(id);
  if (a.feeStatus !== "UNPAID") throw httpError(400, "There's no unpaid fee to waive");
  const why = longText(reason, 300);
  if (!why || why.length < 3) throw httpError(400, "Say why the fee is waived");
  await prisma.$transaction(async (tx) => {
    await tx.admissionApplication.update({ where: { id }, data: { feeStatus: "WAIVED", feeWaiveReason: why, feeRecordedByUserId: actor.id } });
    await event(tx, id, "FEE_WAIVED", actor.id, { note: why });
  });
  await createAuditLog({ action: "WAIVE_REGISTRATION_FEE", entityType: "AdmissionApplication", entityId: id, userId: actor.id, newValues: { amount: num(a.feeAmount), reason: why } });
  return getApplication(id);
};

// ---------------------------------------------------------------------------
// Office: admit → student record
// ---------------------------------------------------------------------------

export const getAdmitPrefill = async (id: number) => {
  const a = await load(id);
  const sections = a.sessionId
    ? await prisma.classSection.findMany({ where: { sessionId: a.sessionId }, select: { id: true, className: true, section: true, _count: { select: { students: true } } } })
    : [];
  sections.sort((x, y) => (classRank(x.className) ?? 99) - (classRank(y.className) ?? 99) || x.section.localeCompare(y.section));
  const nextRoll = async (classSectionId: number) => {
    const rolls = await prisma.student.findMany({ where: { classSectionId }, select: { rollNo: true } });
    return String(Math.max(0, ...rolls.map((r) => Number(r.rollNo)).filter((n) => Number.isFinite(n))) + 1);
  };
  return {
    admissionNo: await suggestNextAdmissionNo(),
    admissionDate: istToday(),
    sections: await Promise.all(
      sections.map(async (s) => ({ id: s.id, label: `${s.className} - ${s.section}`, className: s.className, students: s._count.students, nextRollNo: await nextRoll(s.id) }))
    ),
  };
};

export const admit = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const a = await prisma.admissionApplication.findUnique({ where: { id }, include: { files: true } });
  if (!a) throw httpError(404, "Application not found");
  if (a.stage !== "SELECTED") throw httpError(400, "Only a selected application can be admitted");
  if (a.admittedStudentId) throw httpError(400, "This child is already admitted");
  if (a.feeStatus === "UNPAID") throw httpError(400, "The registration fee isn't paid yet. Record the payment first (or ask the Super Admin to waive it).");
  if (!a.dob || !a.gender) throw httpError(400, "Add the date of birth and gender before admitting");

  const classSectionId = Number(body.classSectionId);
  const cs = Number.isInteger(classSectionId) ? await prisma.classSection.findUnique({ where: { id: classSectionId } }) : null;
  if (!cs) throw httpError(400, "Choose the class and section");
  if (a.sessionId && cs.sessionId !== a.sessionId) throw httpError(400, "That class is in a different session from the application");
  const admissionNo = text(body.admissionNo, 30);
  if (!admissionNo) throw httpError(400, "Enter the admission number");
  if (await prisma.student.findUnique({ where: { admissionNo }, select: { id: true } })) throw httpError(409, `Admission number ${admissionNo} is already used`);
  const rollNo = text(body.rollNo, 10);
  if (!rollNo) throw httpError(400, "Enter the roll number");
  if (await prisma.student.findFirst({ where: { classSectionId, rollNo }, select: { id: true } })) throw httpError(409, `Roll number ${rollNo} is taken in ${cs.className} - ${cs.section}`);
  const admissionDate = dayOrNull(body.admissionDate ?? istToday(), "Admission date") ?? new Date(`${istToday()}T00:00:00.000Z`);

  const student = await createStudent({
    name: a.studentName,
    rollNo,
    classSectionId,
    admissionNo,
    admissionDate,
    dob: a.dob,
    gender: a.gender as any,
    bloodGroup: a.bloodGroup ?? undefined,
    category: (a.category as any) ?? undefined,
    nationality: a.nationality ?? undefined,
    aadharNumber: a.aadharNumber ?? undefined,
    fatherName: a.fatherName ?? undefined,
    fatherContact: a.fatherPhone ?? undefined,
    motherName: a.motherName ?? undefined,
    motherContact: a.motherPhone ?? undefined,
    address: a.address ?? undefined,
    contactNumber: a.phone ?? undefined,
    previousSchool: a.previousSchool ?? undefined,
  });

  await prisma.$transaction(async (tx) => {
    // Uploaded files become the student's documents (same stored file, no copy).
    for (const f of a.files.filter((x) => !x.movedToDocumentId)) {
      const doc = await tx.studentDocument.create({
        data: { studentId: student.id, docType: f.docType, title: "From the admission form", publicId: f.publicId, resourceType: f.resourceType, format: f.format, mimeType: f.mimeType, bytes: f.bytes, uploadedByUserId: actor.id },
      });
      await tx.admissionFile.update({ where: { id: f.id }, data: { movedToDocumentId: doc.id } });
    }
    await tx.admissionApplication.update({ where: { id }, data: { stage: "ADMITTED", admittedStudentId: student.id } });
    await event(tx, id, "ADMITTED", actor.id, { fromStage: "SELECTED", toStage: "ADMITTED", note: `${admissionNo} · ${cs.className} - ${cs.section} · roll ${rollNo}` });
  });
  await createAuditLog({ action: "ADMIT", entityType: "AdmissionApplication", entityId: id, userId: actor.id, newValues: { studentId: student.id, admissionNo, classSectionId } });
  return { studentId: student.id, admissionNo, application: await getApplication(id) };
};

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const fetchApplicationFile = async (actor: Actor, fileId: number) => {
  const f = await prisma.admissionFile.findUnique({ where: { id: fileId } });
  if (!f) throw httpError(404, "File not found");
  const buffer = await readPrivateFile(f);
  await createAuditLog({ action: "VIEW", entityType: "AdmissionFile", entityId: f.id, userId: actor.id, newValues: { applicationId: f.applicationId, docType: f.docType } });
  return { buffer, mimeType: f.mimeType ?? "application/octet-stream", fileName: `${f.docType.toLowerCase()}_app${f.applicationId}.${f.mimeType === "application/pdf" ? "pdf" : f.format ?? "jpg"}` };
};

// Files on applications closed (rejected / withdrawn) more than 90 days ago are deleted —
// the school doesn't keep families' documents it no longer needs. Runs a few times a day.
export const pruneClosedApplicationFiles = async () => {
  const cutoff = new Date(Date.now() - KEEP_CLOSED_FILES_DAYS * 86400_000);
  const files = await prisma.admissionFile.findMany({
    where: { movedToDocumentId: null, application: { stage: { in: ["REJECTED", "WITHDRAWN"] }, updatedAt: { lt: cutoff } } },
    take: 100,
  });
  for (const f of files) {
    try {
      await deletePrivateFile(f);
      await prisma.admissionFile.delete({ where: { id: f.id } });
      await prisma.admissionEvent.create({ data: { applicationId: f.applicationId, action: "FILE_DELETED", note: `${FILE_TYPES[f.docType] ?? f.docType} deleted ${KEEP_CLOSED_FILES_DAYS} days after closing` } });
    } catch (e: any) {
      console.warn("[Admissions] couldn't delete file", f.publicId, e?.message);
    }
  }
  return files.length;
};

export const startAdmissionsJob = () => {
  const tick = () => pruneClosedApplicationFiles().catch((e) => console.error("[Admissions] file clean-up failed:", e?.message ?? e));
  setTimeout(tick, 5 * 60_000);
  setInterval(tick, 6 * 3600_000);
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// Paid registration fees in a date range (Accounts summary counts them as income).
export const paidRegistrationFees = (fromTs: Date, toTs: Date) =>
  prisma.admissionApplication.findMany({ where: { feeStatus: "PAID", feePaidAt: { gte: fromTs, lte: toTs } }, select: { feeAmount: true, feePaidAt: true } });

const STAGE_LABEL: Record<string, string> = { ENQUIRY: "Enquiry", APPLIED: "Applied", TEST: "Test / interview", SELECTED: "Selected", ADMITTED: "Admitted", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };

export const applicationsSheets = async (q: { stage?: unknown; sessionId?: unknown }) => {
  const { applications } = await listApplications(q);
  const full = await prisma.admissionApplication.findMany({ where: { id: { in: applications.map((a) => a.id) } }, orderBy: { createdAt: "asc" }, include: { session: { select: { name: true } } } });
  return [
    {
      name: "Applications",
      columns: [
        { header: "Application no.", key: "applicationNo", width: 16 },
        { header: "Received", key: "createdAt", type: "date" as const, width: 12 },
        { header: "Stage", key: "stageLabel", width: 14 },
        { header: "Session", key: "sessionName", width: 10 },
        { header: "Class", key: "className", width: 10 },
        { header: "Child's name", key: "studentName", width: 24 },
        { header: "Date of birth", key: "dob", type: "date" as const, width: 12 },
        { header: "Gender", key: "gender", width: 8 },
        { header: "Father", key: "fatherName", width: 20 },
        { header: "Father's mobile", key: "fatherPhone", width: 13 },
        { header: "Mother", key: "motherName", width: 20 },
        { header: "Mother's mobile", key: "motherPhone", width: 13 },
        { header: "Contact", key: "contactName", width: 20 },
        { header: "Contact mobile", key: "phone", width: 13 },
        { header: "Email", key: "email", width: 22 },
        { header: "Previous school", key: "previousSchool", width: 22 },
        { header: "Address", key: "address", width: 30 },
        { header: "Test / interview", key: "testAt", type: "date" as const, width: 14 },
        { header: "Result", key: "testResult", width: 8 },
        { header: "Reg. fee", key: "feeAmount", type: "money" as const, width: 10 },
        { header: "Fee status", key: "feeStatus", width: 10 },
        { header: "Receipt no.", key: "feeReceiptNo", width: 16 },
        { header: "Source", key: "source", width: 14 },
        { header: "Reason closed", key: "closedReason", width: 26 },
      ],
      rows: full.map((a) => ({ ...a, feeAmount: num(a.feeAmount), sessionName: a.session?.name ?? "", stageLabel: STAGE_LABEL[a.stage] ?? a.stage })),
    },
  ];
};
