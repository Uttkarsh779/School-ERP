import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import { cloudinary } from "../config/cloudinary";
import * as docs from "../modules/studentRecords/documentsService";
import * as health from "../modules/studentRecords/healthService";
import { getClassRoster, getStudentOverviewForTeacher } from "../modules/teaching/studentsService";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Student documents (private storage, checklist, verify, remove) and health records
// (profile, checkups, vaccinations, the teacher's alert, the family view). Throwaway
// student in a non-current session; uploads two tiny files to Cloudinary and deletes them.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  const uploaded: number[] = [];
  try {
    const session = rows.add("AcademicSession", await prisma.academicSession.create({ data: { name: `${tag} session`, startDate: new Date("2020-06-01"), endDate: new Date("2021-05-31"), isCurrent: false } }));
    const office = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-o@test.local`, passwordHash: "x", role: "ADMIN", name: `${tag} Office` } }));
    const tUser = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-t@test.local`, passwordHash: "x", role: "TEACHER", name: `${tag} Teacher` } }));
    const teacher = rows.add("teachers", await prisma.staff.create({ data: { userId: tUser.id } }));
    const cs = rows.add("ClassSection", await prisma.classSection.create({ data: { sessionId: session.id, className: "ZZ Test", section: tag, classTeacherId: teacher.id } }));
    const student = rows.add("Student", await prisma.student.create({ data: { admissionNo: `${tag}-ADM`, name: `${tag} Student`, rollNo: "1", classSectionId: cs.id, category: "OBC", previousSchool: "Old School" } }));

    // --- Documents -----------------------------------------------------------
    let list = await docs.listStudentDocuments(student.id);
    assert.deepEqual(
      list.checklist.map((c) => `${c.docType}:${c.status}`),
      ["BIRTH_CERTIFICATE:MISSING", "AADHAAR:MISSING", "TRANSFER_CERTIFICATE:MISSING", "CASTE_CERTIFICATE:MISSING"],
      "expected documents follow previous school and category"
    );
    await rejects(docs.uploadStudentDocument(office.id, student.id, { buffer: PNG, mimetype: "image/png", size: PNG.length }, { docType: "NOPE" }), /what kind/);
    await rejects(docs.uploadStudentDocument(office.id, student.id, { buffer: PNG, mimetype: "image/png", size: PNG.length }, { docType: "OTHER" }), /Say what/);
    await rejects(docs.uploadStudentDocument(office.id, student.id, { buffer: PNG, mimetype: "image/gif", size: PNG.length }, { docType: "AADHAAR" }), /photo .* or a PDF/);
    await rejects(docs.uploadStudentDocument(office.id, student.id, { buffer: PDF, mimetype: "application/pdf", size: 6 * 1048576 }, { docType: "AADHAAR" }), /at most 5 MB/);

    const photo = await docs.uploadStudentDocument(office.id, student.id, { buffer: PNG, mimetype: "image/png", size: PNG.length }, { docType: "BIRTH_CERTIFICATE" });
    uploaded.push(photo.id);
    const pdf = await docs.uploadStudentDocument(office.id, student.id, { buffer: PDF, mimetype: "application/pdf", size: PDF.length }, { docType: "AADHAAR", title: " Aadhaar   front and back " });
    uploaded.push(pdf.id);
    assert.equal(pdf.title, "Aadhaar front and back");
    assert.equal(pdf.isPdf, true);

    // Stored privately: the public delivery URL doesn't work.
    const row = await prisma.studentDocument.findUniqueOrThrow({ where: { id: photo.id } });
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const publicTry = await fetch(`https://res.cloudinary.com/${cloud}/image/upload/${row.publicId}.${row.format}`);
    assert.notEqual(publicTry.status, 200, "no public link to a student document");

    // The ERP fetches both files, and logs each view.
    const gotPhoto = await docs.fetchStudentDocument(office.id, photo.id);
    assert.match(gotPhoto.mimeType, /^image\//);
    assert.ok(gotPhoto.buffer.length > 0);
    const gotPdf = await docs.fetchStudentDocument(office.id, pdf.id);
    assert.equal(gotPdf.mimeType, "application/pdf");
    assert.ok(gotPdf.buffer.subarray(0, 5).toString() === "%PDF-");
    const views = await prisma.feeAuditLog.count({ where: { entityType: "StudentDocument", action: "VIEW", entityId: { in: [photo.id, pdf.id] } } });
    assert.equal(views, 2);

    await docs.setDocumentVerified(office.id, photo.id, true);
    list = await docs.listStudentDocuments(student.id);
    assert.equal(list.checklist.find((c) => c.docType === "BIRTH_CERTIFICATE")?.status, "VERIFIED");
    assert.equal(list.checklist.find((c) => c.docType === "AADHAAR")?.status, "ON_FILE");

    // Families see the list and checklist, not the files or who uploaded.
    const family = await docs.familyDocumentSummary(student.id);
    assert.equal(family.documents.length, 2);
    assert.ok(!("uploadedBy" in family.documents[0]) && !("publicId" in family.documents[0]));

    // Removing deletes the file and keeps the log.
    await rejects(docs.removeStudentDocument(office.id, pdf.id, ""), /Say why/);
    await docs.removeStudentDocument(office.id, pdf.id, "Wrong student's Aadhaar");
    uploaded.splice(uploaded.indexOf(pdf.id), 1);
    await rejects(docs.fetchStudentDocument(office.id, pdf.id), /isn't on file/);
    assert.equal((await docs.listStudentDocuments(student.id)).documents.length, 1);
    assert.ok((await prisma.studentDocument.findUniqueOrThrow({ where: { id: pdf.id } })).removedAt);

    // --- Health --------------------------------------------------------------
    let h = await health.getStudentHealth(student.id);
    assert.equal(h.profile.allergies, null);
    await rejects(health.saveStudentHealth(office.id, student.id, { emergencyPhone: "12345" }), /10-digit/);
    await rejects(health.saveStudentHealth(office.id, student.id, { emergencyPhone: "9876543210" }), /contact's name/);
    h = await health.saveStudentHealth(office.id, student.id, {
      allergies: "Peanuts — severe",
      emergencyMedicine: "EpiPen in school bag",
      emergencyName: "Sunita",
      emergencyRelation: "Mother",
      emergencyPhone: "+91 98765-43210",
      officeNotes: "Doctor's letter on file",
      disability: "Low vision",
    });
    assert.equal(h.profile.emergencyPhone, "9876543210");
    const audit = await prisma.feeAuditLog.findFirstOrThrow({ where: { entityType: "StudentHealth", entityId: student.id }, orderBy: { id: "desc" } });
    assert.ok(!JSON.stringify(audit.newValues).includes("Peanuts"), "audit log names fields, not health details");
    // A disability on record asks for the UDID certificate.
    assert.ok((await docs.listStudentDocuments(student.id)).checklist.some((c) => c.docType === "DISABILITY_CERTIFICATE"));

    await rejects(health.addCheckup(office.id, student.id, { checkupDate: "2020-07-01" }), /at least one reading/);
    await rejects(health.addCheckup(office.id, student.id, { checkupDate: "2999-01-01", heightCm: 120 }), /future/);
    await rejects(health.addCheckup(office.id, student.id, { checkupDate: "2020-07-01", heightCm: 900 }), /between/);
    const c = await health.addCheckup(office.id, student.id, { checkupDate: "2020-07-01", heightCm: 125, weightKg: 25, visionLeft: "6/6" });
    assert.equal(c.bmi, 16);
    const v = await health.addVaccination(office.id, student.id, { vaccine: "MMR", dose: "2nd", givenOn: "2019-03-10" });
    await rejects(health.addVaccination(office.id, student.id, { vaccine: " " }), /Which vaccine/);

    // Family view: everything except the office notes.
    const fam = await health.getStudentHealth(student.id, { forFamily: true });
    assert.ok(!("officeNotes" in fam.profile));
    assert.equal(fam.checkups.length, 1);
    assert.equal(fam.vaccinations.length, 1);

    // Teacher: the short alert only, on the roster and the student page.
    const roster = await getClassRoster(tUser.id, cs.id);
    const alert = roster.students.find((s: any) => s.id === student.id)?.healthAlert;
    assert.equal(alert?.allergies, "Peanuts — severe");
    assert.ok(!("officeNotes" in (alert as object)) && !("disability" in (alert as object)) && !("emergencyPhone" in (alert as object)));
    const overview = await getStudentOverviewForTeacher(tUser.id, student.id);
    assert.equal(overview.healthAlert?.emergencyMedicine, "EpiPen in school bag");

    await health.deleteCheckup(office.id, c.id);
    await health.deleteVaccination(office.id, v.id);
    assert.equal((await health.getStudentHealth(student.id)).checkups.length, 0);

    console.log("student records: all checks passed");
  } finally {
    for (const d of await prisma.studentDocument.findMany({ where: { id: { in: uploaded } } })) {
      await cloudinary.uploader.destroy(d.publicId, { resource_type: d.resourceType, type: "authenticated", invalidate: true }).catch((e) => console.warn("cleanup", e?.message));
    }
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
