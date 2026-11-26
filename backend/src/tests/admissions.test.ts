import "dotenv/config";
import crypto from "crypto";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import { cloudinary } from "../config/cloudinary";
import * as adm from "../modules/admissions/service";
import { getSummary } from "../modules/accounts/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Online admissions end to end: settings (fee is Super Admin only), website enquiry and
// application (validation, duplicates, a file), family status lookup, online fee (signed the
// way Razorpay signs; no call to Razorpay), office stages, counter fee, admit → student with
// documents moved, Accounts counts the fee. Throwaway session/class; real settings restored.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  const saved = await prisma.admissionSetting.findUniqueOrThrow({ where: { id: 1 } });
  const appIds: number[] = [];
  try {
    const session = rows.add("AcademicSession", await prisma.academicSession.create({ data: { name: `${tag}`.slice(0, 20), startDate: new Date("2031-04-01"), endDate: new Date("2032-03-31"), isCurrent: false } }));
    const cs = rows.add("ClassSection", await prisma.classSection.create({ data: { sessionId: session.id, className: "ZZ Class 3", section: "A" } }));
    const sa = { id: rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-sa@test.local`, passwordHash: "x", role: "SUPER_ADMIN", name: `${tag} SA` } })).id, role: "SUPER_ADMIN" };
    const office = { id: rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-o@test.local`, passwordHash: "x", role: "ADMIN", name: `${tag} Office` } })).id, role: "ADMIN" };

    // --- Settings ------------------------------------------------------------
    await rejects(adm.saveSettings(office, { defaultFee: 100 }), /Only the Super Admin/);
    await rejects(adm.saveSettings(office, { isOpen: true, sessionId: null }), /Choose the session/);
    await adm.saveSettings(sa, { isOpen: false, sessionId: session.id, classNames: [], defaultFee: 500, classFees: { "ZZ Class 3": 300 }, closesOn: null, allowUploads: true });
    let pub = await adm.getPublicSettings();
    assert.equal(pub.isOpen, false);
    assert.deepEqual(pub.classes, [], "closed: no classes offered");
    await adm.saveSettings(office, { isOpen: true });
    pub = await adm.getPublicSettings();
    assert.equal(pub.isOpen, true);
    assert.deepEqual(pub.classes, [{ name: "ZZ Class 3", fee: 300 }], "per-class fee overrides the default");

    // --- Website enquiry -----------------------------------------------------
    await rejects(adm.submitEnquiry({ studentName: "A", parentName: "B", phone: "98", gradeApplyingFor: "ZZ Class 3" }), /names/);
    await rejects(adm.submitEnquiry({ studentName: `${tag} Enq`, parentName: "Parent", phone: "12345", gradeApplyingFor: "ZZ Class 3" }), /10-digit/);
    const enq = await adm.submitEnquiry({ studentName: `${tag} Enq`, parentName: "Ravi Kumar", phone: "+91 98765 00001", gradeApplyingFor: "ZZ Class 3" });
    appIds.push(enq.id);

    // --- Website application ---------------------------------------------------
    const base = {
      className: "ZZ Class 3",
      studentName: `${tag} Child`,
      dob: "2023-05-12",
      gender: "FEMALE",
      fatherName: "Suresh Sharma",
      fatherPhone: "9876500002",
      motherName: "Anita Sharma",
      address: "12 Main Road, Village",
      category: "OBC",
      fileType0: "BIRTH_CERTIFICATE",
    };
    await rejects(adm.submitApplication({ ...base, className: "Class 99" }, [], null), /aren't open for that class/);
    await rejects(adm.submitApplication({ ...base, dob: "" }, [], null), /Date of birth/);
    await rejects(adm.submitApplication({ ...base, fatherPhone: "", motherPhone: "" }, [], null), /at least one parent's mobile/);
    await rejects(adm.submitApplication({ ...base, aadharNumber: "1234" }, [], null), /12 digits/);
    const applied = await adm.submitApplication(base, [{ buffer: PNG, mimetype: "image/png", size: PNG.length, fieldname: "files" }], null);
    appIds.push(applied.id);
    assert.match(applied.applicationNo, /^APP-2031-\d{4}$/);
    assert.equal(applied.feeAmount, 300);
    assert.equal(applied.feeStatus, "UNPAID");
    await rejects(adm.submitApplication(base, [], null), /already in progress/);

    // Family status: number + any mobile on the form; wrong mobile finds nothing.
    await rejects(adm.getStatusForFamily(applied.applicationNo, "9000000000"), /No application matches/);
    let status = await adm.getStatusForFamily(applied.applicationNo.toLowerCase(), "98765 00002");
    assert.equal(status.stage, "APPLIED");
    assert.equal(status.fee.status, "UNPAID");

    // Online fee: a checkout for this application's order, signed like Razorpay does.
    const orderId = `order_${tag}`;
    await prisma.admissionApplication.update({ where: { id: applied.id }, data: { razorpayOrderId: orderId } });
    await rejects(adm.verifyOnlinePayment(applied.applicationNo, "9876500002", { razorpayOrderId: orderId, razorpayPaymentId: "pay_x", razorpaySignature: "bad" }), /couldn't be verified/);
    const sig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|pay_${tag}`).digest("hex");
    status = await adm.verifyOnlinePayment(applied.applicationNo, "9876500002", { razorpayOrderId: orderId, razorpayPaymentId: `pay_${tag}`, razorpaySignature: sig });
    assert.equal(status.fee.status, "PAID");
    assert.match(String(status.fee.receiptNo), /^REG\//);
    // The webhook arriving after the checkout changes nothing.
    assert.equal(await adm.confirmFromWebhook(orderId, `pay_${tag}`), true);
    assert.equal((await prisma.admissionApplication.findUniqueOrThrow({ where: { id: applied.id } })).feeReceiptNo, status.fee.receiptNo);

    // --- Office stages -------------------------------------------------------
    await rejects(adm.changeStage(office, applied.id, { action: "RESULT", testResult: "PASS" }), /Can't record a result/);
    await adm.changeStage(office, applied.id, { action: "SCHEDULE", testAt: "2031-03-10T10:30:00+05:30", testVenue: "Room 4" });
    status = await adm.getStatusForFamily(applied.applicationNo, "9876500002");
    assert.equal(status.stage, "TEST");
    assert.equal(status.testVenue, "Room 4");
    await adm.changeStage(office, applied.id, { action: "RESULT", testResult: "ABSENT" });
    assert.equal((await adm.getApplication(applied.id)).stage, "TEST", "absent stays at test");
    await adm.changeStage(office, applied.id, { action: "SCHEDULE", testAt: "2031-03-12T10:30:00+05:30" });
    await adm.changeStage(office, applied.id, { action: "RESULT", testResult: "PASS", testRemarks: "Confident" });
    assert.equal((await adm.getApplication(applied.id)).stage, "SELECTED");

    // Enquiry → contacted → application (needs full details) → selected; fee unpaid blocks admit.
    await adm.changeStage(office, enq.id, { action: "CONTACTED" });
    await rejects(adm.changeStage(office, enq.id, { action: "APPLY", sessionId: session.id, className: "ZZ Class 3" }), /Date of birth/);
    await adm.changeStage(office, enq.id, { action: "APPLY", sessionId: session.id, className: "ZZ Class 3", dob: "2023-01-02", gender: "MALE", fatherName: "Ravi Kumar", fatherPhone: "9876500001", address: "Village" });
    let enqApp = await adm.getApplication(enq.id);
    assert.equal(enqApp.stage, "APPLIED");
    assert.equal(enqApp.feeStatus, "UNPAID", "fee set when it becomes an application");
    await adm.changeStage(office, enq.id, { action: "SELECT" });
    await rejects(adm.admit(office, enq.id, { classSectionId: cs.id, admissionNo: `${tag}-2`, rollNo: "2" }), /isn't paid yet/);
    await rejects(adm.waiveFee(office, enq.id, "Sibling"), /Only the Super Admin/);
    await rejects(adm.recordFee(office, enq.id, { mode: "UPI" }), /UPI/);
    await adm.recordFee(office, enq.id, { mode: "CASH" });
    await rejects(adm.recordFee(office, enq.id, { mode: "CASH" }), /already paid/);
    // Reject and reopen returns to the stage it was at.
    await rejects(adm.changeStage(office, enq.id, { action: "REJECT" }), /Say why/);
    await adm.changeStage(office, enq.id, { action: "REJECT", note: "No seats" });
    await adm.changeStage(office, enq.id, { action: "REOPEN" });
    assert.equal((await adm.getApplication(enq.id)).stage, "SELECTED");

    // --- Admit -----------------------------------------------------------------
    const prefill = await adm.getAdmitPrefill(applied.id);
    assert.ok(prefill.sections.some((s) => s.id === cs.id && s.nextRollNo === "1"));
    await rejects(adm.admit(office, applied.id, { classSectionId: cs.id, admissionNo: "", rollNo: "1" }), /admission number/);
    const res = await adm.admit(office, applied.id, { classSectionId: cs.id, admissionNo: `${tag}-1`, rollNo: "1", admissionDate: "2031-04-01" });
    rows.add("Student", { id: res.studentId });
    const student = await prisma.student.findUniqueOrThrow({ where: { id: res.studentId }, include: { documents: true, enrollments: true } });
    rows.add("User", { id: student.userId! });
    assert.equal(student.name, `${tag} Child`);
    assert.equal(student.fatherContact, "9876500002");
    assert.equal(student.category, "OBC");
    assert.equal(student.documents.length, 1, "uploaded file moved onto the student");
    assert.equal(student.documents[0].docType, "BIRTH_CERTIFICATE");
    assert.equal(student.enrollments[0]?.sessionId, session.id);
    await rejects(adm.admit(office, applied.id, { classSectionId: cs.id, admissionNo: `${tag}-9`, rollNo: "9" }), /Only a selected/);
    await rejects(adm.admit(office, enq.id, { classSectionId: cs.id, admissionNo: `${tag}-1`, rollNo: "3" }), /already used/);
    await rejects(adm.admit(office, enq.id, { classSectionId: cs.id, admissionNo: `${tag}-2`, rollNo: "1" }), /Roll number 1 is taken/);
    const timeline = (await adm.getApplication(applied.id)).events.map((e) => e.action);
    assert.deepEqual(timeline, ["APPLIED_ONLINE", "FEE_PAID_ONLINE", "TEST_SCHEDULED", "TEST_RESULT", "RESCHEDULED", "TEST_RESULT", "ADMITTED"]);

    // --- Accounts: both paid fees (300 + 300) count as other income today ---------
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const summary = await getSummary(sa as any, { from: today, to: today });
    const reg = summary.categories.find((c) => c.name === "Admission registration fees");
    assert.ok(reg && reg.amount >= 600, "registration fees appear in the Accounts summary");

    // List, counts and the Excel sheet.
    const list = await adm.listApplications({ q: tag });
    assert.equal(list.applications.length, 2);
    const sheets = await adm.applicationsSheets({ sessionId: session.id });
    assert.equal(sheets[0].rows.length, 2);

    console.log("admissions: all checks passed");
  } finally {
    await prisma.admissionSetting.update({
      where: { id: 1 },
      data: { isOpen: saved.isOpen, sessionId: saved.sessionId, classNames: saved.classNames, defaultFee: saved.defaultFee, classFees: saved.classFees as any, closesOn: saved.closesOn, instructions: saved.instructions, allowUploads: saved.allowUploads, updatedByUserId: saved.updatedByUserId },
    });
    const files = await prisma.admissionFile.findMany({ where: { applicationId: { in: appIds } } });
    for (const f of files) await cloudinary.uploader.destroy(f.publicId, { resource_type: f.resourceType, type: "authenticated", invalidate: true }).catch((e) => console.warn("cleanup", e?.message));
    await prisma.admissionApplication.deleteMany({ where: { id: { in: appIds } } });
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
