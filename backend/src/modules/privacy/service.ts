import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { createAuditLog } from "../fees/ledgerService";

// Privacy under India's Digital Personal Data Protection Act: the notice families agree to,
// parental consent per student (online on the student login, or a signed paper form recorded
// by the office), and families' requests to correct or erase data or withdraw consent.
// Under the DPDP Rules a school needs no consent only for its educational activities and
// children's safety; everything else needs a parent's consent, so the school asks for it.

export const DEFAULT_NOTICE = `This notice explains how {school} ("the school") uses the personal data of students and their families. It is written for parents and guardians, because the students are under 18.

What we collect
- Student details: name, date of birth, gender, photograph, class, admission number, Aadhaar and APAAR ID (when given), blood group, address and previous school.
- Parent / guardian details: names and phone numbers.
- School records: attendance, marks, report cards, homework, fees and payments, transport, leave applications and certificates.

Why we use it
- To run the student's education: admission, classes, attendance, exams, report cards and certificates.
- For fees, receipts and transport.
- To contact you about your child, and for notices and alerts in this portal.
- To meet legal duties: CBSE registration, UDISE+ and other returns required by the government.

Who we share it with
- CBSE, education departments and other authorities, when the law requires it.
- Service providers that help run this portal (hosting, online payments, photo storage), only for those purposes.
We do not sell personal data and we do not use it for advertising.

How long we keep it
- While the student is enrolled, and afterwards for as long as the law or school records require (for example, admission registers and transfer certificates).

Your rights
- See the data we hold about your child (My Profile → Your data & privacy).
- Ask us to correct it, or to erase what we are not required to keep.
- Withdraw your consent. The school will tell you what that means for the services it can still provide.
- Complain to the grievance officer below, and if you are not satisfied, to the Data Protection Board of India.`;

const settingsRow = async () => {
  const row = await prisma.privacySetting.findUnique({ where: { id: 1 } });
  if (row) return row;
  return prisma.privacySetting.create({ data: { id: 1, noticeText: DEFAULT_NOTICE, noticeVersion: 1 } });
};

const schoolName = async () => {
  const s: any = await prisma.websiteSetting.findFirst({ select: { schoolName: true } }).catch(() => null);
  return s?.schoolName || "the school";
};

// Public: the notice as families see it (school name filled in) and whom to contact.
export const getPublicNotice = async () => {
  const s = await settingsRow();
  const school = await schoolName();
  return {
    schoolName: school,
    noticeText: s.noticeText.replaceAll("{school}", school),
    noticeVersion: s.noticeVersion,
    consentEnabled: s.consentEnabled,
    grievanceName: s.grievanceName,
    grievanceEmail: s.grievanceEmail,
    grievancePhone: s.grievancePhone,
    updatedAt: s.updatedAt,
  };
};

export const getPrivacySettings = settingsRow;

const clean = (v: unknown, max: number) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (t.length > max) throw httpError(400, `Keep it under ${max} characters`);
  return t || null;
};

// Super Admin. askAgain raises the version: every family is asked to agree again.
export const updatePrivacySettings = async (body: any, userId: number) => {
  const current = await settingsRow();
  const noticeText = clean(body?.noticeText, 20000);
  if (!noticeText || noticeText.length < 200) throw httpError(400, "The privacy notice looks too short. Describe what data you collect, why, and families' rights.");
  const email = clean(body?.grievanceEmail, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Enter a valid grievance email");
  const askAgain = body?.askAgain === true;
  const consentEnabled = typeof body?.consentEnabled === "boolean" ? body.consentEnabled : current.consentEnabled;
  if (consentEnabled && !current.consentEnabled && !email && !clean(body?.grievanceName, 120)) {
    throw httpError(400, "Name a grievance officer (or email) before asking families for consent");
  }
  const updated = await prisma.privacySetting.update({
    where: { id: 1 },
    data: {
      noticeText,
      grievanceName: clean(body?.grievanceName, 120),
      grievanceEmail: email,
      grievancePhone: clean(body?.grievancePhone, 30),
      consentEnabled,
      ...(askAgain ? { noticeVersion: current.noticeVersion + 1 } : {}),
    },
  });
  await createAuditLog({ action: "UPDATE_PRIVACY_NOTICE", entityType: "PrivacySetting", entityId: 1, userId, oldValues: { noticeVersion: current.noticeVersion }, newValues: { noticeVersion: updated.noticeVersion, askAgain, consentEnabled } });
  return updated;
};

// Which consent counts: the one covering the newest notice, and among those the one recorded
// last. Not the latest signing date: a paper form signed "today" is dated midnight, earlier
// than an online consent given a minute ago, yet it may cover a newer notice.
const CURRENT_FIRST = [{ noticeVersion: "desc" as const }, { id: "desc" as const }];
const currentConsent = (studentId: number) =>
  prisma.dataConsent.findFirst({ where: { studentId, withdrawnAt: null }, orderBy: CURRENT_FIRST });

const RELATIONSHIPS = ["Father", "Mother", "Guardian"];
const parseConsentInput = (body: any) => {
  const givenBy = clean(body?.givenBy, 120);
  if (!givenBy || givenBy.length < 3) throw httpError(400, "Enter the parent's or guardian's full name");
  const relationship = String(body?.relationship ?? "");
  if (!RELATIONSHIPS.includes(relationship)) throw httpError(400, "Choose Father, Mother or Guardian");
  return { givenBy, relationship };
};

const studentOfUser = async (userId: number) => {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, name: true } });
  if (!student) throw httpError(404, "No student record is linked to this login");
  return student;
};

// ---- Student login (parents use it) ---------------------------------------------------------

export const getMyConsentStatus = async (userId: number) => {
  const student = await studentOfUser(userId);
  const [notice, consent] = await Promise.all([getPublicNotice(), currentConsent(student.id)]);
  return {
    studentName: student.name,
    // Only once the school has switched consent requests on (Settings -> Privacy).
    needsConsent: notice.consentEnabled && (!consent || consent.noticeVersion < notice.noticeVersion),
    consent,
    notice,
  };
};

export const giveMyConsent = async (userId: number, body: any, userAgent?: string) => {
  if (body?.agree !== true) throw httpError(400, "Please tick the box to agree");
  const student = await studentOfUser(userId);
  const { givenBy, relationship } = parseConsentInput(body);
  const { noticeVersion } = await settingsRow();
  return prisma.dataConsent.create({
    data: { studentId: student.id, noticeVersion, givenBy, relationship, method: "ONLINE", userAgent: userAgent?.slice(0, 300) ?? null },
  });
};

const REQUEST_TYPES = ["CORRECTION", "ERASURE", "WITHDRAW_CONSENT"];
export const createMyDataRequest = async (userId: number, body: any) => {
  const student = await studentOfUser(userId);
  const type = String(body?.type ?? "");
  if (!REQUEST_TYPES.includes(type)) throw httpError(400, "Choose what you'd like the school to do");
  const details = clean(body?.details, 2000);
  if (!details || details.length < 10) throw httpError(400, "Describe your request in a sentence or two");
  const open = await prisma.dataRequest.count({ where: { studentId: student.id, status: "OPEN" } });
  if (open >= 5) throw httpError(400, "You already have 5 open requests. Please wait for the school to answer them.");
  return prisma.dataRequest.create({ data: { studentId: student.id, type, details, requestedByUserId: userId } });
};

export const listMyDataRequests = async (userId: number) => {
  const student = await studentOfUser(userId);
  return prisma.dataRequest.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, details: true, status: true, response: true, createdAt: true, resolvedAt: true },
  });
};

// "Your data": everything the school holds about the student in this portal, in summary.
export const getMyData = async (userId: number) => {
  const { id } = await studentOfUser(userId);
  const s = await prisma.student.findUniqueOrThrow({
    where: { id },
    include: {
      classSection: { select: { className: true, section: true, session: { select: { name: true } } } },
      user: { select: { email: true } },
      transportAssignments: { where: { status: "ACTIVE" }, include: { village: { select: { name: true } } }, take: 1 },
    },
  });
  const [attendanceDays, examResults, payments, certificates, consents, requests] = await Promise.all([
    prisma.attendance.count({ where: { studentId: id } }),
    prisma.examResult.count({ where: { studentId: id } }),
    prisma.payment.count({ where: { studentId: id } }),
    prisma.studentCertificate.count({ where: { studentId: id } }),
    prisma.dataConsent.findMany({ where: { studentId: id }, orderBy: { givenAt: "desc" } }),
    prisma.dataRequest.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const mask = (v?: string | null) => (v ? `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : null);
  return {
    generatedAt: new Date(),
    profile: {
      name: s.name,
      admissionNo: s.admissionNo,
      admissionDate: s.admissionDate,
      class: `${s.classSection.className} - ${s.classSection.section}`,
      session: s.classSection.session?.name ?? null,
      rollNo: s.rollNo,
      dob: s.dob,
      gender: s.gender,
      bloodGroup: s.bloodGroup,
      category: s.category,
      nationality: s.nationality,
      aadhaar: mask(s.aadharNumber), // masked: the full number is never shown in full on screen
      apaarId: s.apaarId,
      fatherName: s.fatherName,
      fatherContact: s.fatherContact,
      motherName: s.motherName,
      motherContact: s.motherContact,
      contactNumber: s.contactNumber,
      address: s.address,
      previousSchool: s.previousSchool,
      loginEmail: s.user?.email?.endsWith(".local") ? null : s.user?.email ?? null,
      photoOnFile: !!s.photoUrl,
      transport: s.transportAssignments[0]?.village?.name ?? null,
    },
    records: { attendanceDays, examResults, payments, certificates },
    consents: consents.map((c) => ({ givenBy: c.givenBy, relationship: c.relationship, method: c.method, noticeVersion: c.noticeVersion, givenAt: c.givenAt, withdrawnAt: c.withdrawnAt })),
    requests: requests.map((r) => ({ type: r.type, status: r.status, createdAt: r.createdAt, response: r.response })),
  };
};

// ---- Office ----------------------------------------------------------------------------------

export const getStudentPrivacy = async (studentId: number) => {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw httpError(404, "Student not found");
  const [notice, consents, requests] = await Promise.all([
    settingsRow(),
    prisma.dataConsent.findMany({
      where: { studentId },
      orderBy: CURRENT_FIRST,
      include: { recordedBy: { select: { name: true } }, withdrawnBy: { select: { name: true } } },
    }),
    prisma.dataRequest.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { resolvedBy: { select: { name: true } } } }),
  ]);
  const active = consents.find((c) => !c.withdrawnAt) ?? null;
  return {
    noticeVersion: notice.noticeVersion,
    status: !active ? "NONE" : active.noticeVersion < notice.noticeVersion ? "OUTDATED" : "GIVEN",
    consents,
    requests,
  };
};

// From a signed paper form. Date is when the form was signed (not in the future).
export const recordPaperConsent = async (studentId: number, body: any, userId: number) => {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!student) throw httpError(404, "Student not found");
  const { givenBy, relationship } = parseConsentInput(body);
  const signedOn = body?.signedOn ? new Date(body.signedOn) : new Date();
  if (Number.isNaN(signedOn.getTime()) || signedOn.getTime() > Date.now() + 24 * 3600 * 1000) throw httpError(400, "Enter the date the form was signed");
  const { noticeVersion } = await settingsRow();
  const consent = await prisma.dataConsent.create({
    data: { studentId, noticeVersion, givenBy, relationship, method: "PAPER", givenAt: signedOn, recordedByUserId: userId },
  });
  await createAuditLog({ action: "RECORD_PAPER_CONSENT", entityType: "Student", entityId: studentId, userId, newValues: { consentId: consent.id, givenBy, relationship } });
  return consent;
};

export const withdrawConsent = async (studentId: number, body: any, userId: number) => {
  const reason = clean(body?.reason, 500);
  if (!reason) throw httpError(400, "Say why consent is being withdrawn (e.g. parent's written request)");
  const active = await currentConsent(studentId);
  if (!active) throw httpError(400, "This student has no consent on record to withdraw");
  const updated = await prisma.dataConsent.update({ where: { id: active.id }, data: { withdrawnAt: new Date(), withdrawnByUserId: userId, withdrawReason: reason } });
  await createAuditLog({ action: "WITHDRAW_CONSENT", entityType: "Student", entityId: studentId, userId, newValues: { consentId: active.id, reason } });
  return updated;
};

export const listDataRequests = (status?: string) =>
  prisma.dataRequest.findMany({
    where: status && status !== "ALL" ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      student: { select: { id: true, name: true, admissionNo: true, classSection: { select: { className: true, section: true } } } },
      resolvedBy: { select: { name: true } },
    },
  });

export const resolveDataRequest = async (id: number, body: any, userId: number) => {
  const status = String(body?.status ?? "");
  if (!["RESOLVED", "REJECTED"].includes(status)) throw httpError(400, "Mark the request as done or declined");
  const response = clean(body?.response, 2000);
  if (!response) throw httpError(400, "Write a reply for the family (what was done, or why not)");
  const request = await prisma.dataRequest.findUnique({ where: { id } });
  if (!request) throw httpError(404, "Request not found");
  if (request.status !== "OPEN") throw httpError(400, "This request has already been answered");
  const updated = await prisma.dataRequest.update({ where: { id }, data: { status, response, resolvedByUserId: userId, resolvedAt: new Date() } });
  await createAuditLog({ action: "RESOLVE_DATA_REQUEST", entityType: "DataRequest", entityId: id, userId, newValues: { status } });
  return updated;
};

// How many active students have a current consent; the rest are listed for follow-up.
export const getConsentSummary = async () => {
  const { noticeVersion } = await settingsRow();
  const students = await prisma.student.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      admissionNo: true,
      classSection: { select: { className: true, section: true } },
      dataConsents: { where: { withdrawnAt: null }, orderBy: CURRENT_FIRST, take: 1, select: { noticeVersion: true } },
    },
    orderBy: [{ classSection: { className: "asc" } }, { name: "asc" }],
  });
  const missing = students
    .filter((s) => !s.dataConsents[0] || s.dataConsents[0].noticeVersion < noticeVersion)
    .map((s) => ({ id: s.id, name: s.name, admissionNo: s.admissionNo, className: `${s.classSection.className} - ${s.classSection.section}`, outdated: !!s.dataConsents[0] }));
  const openRequests = await prisma.dataRequest.count({ where: { status: "OPEN" } });
  const { consentEnabled } = await settingsRow();
  return { noticeVersion, consentEnabled, activeStudents: students.length, withConsent: students.length - missing.length, missing, openRequests };
};
