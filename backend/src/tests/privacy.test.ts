import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import * as svc from "../modules/privacy/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Privacy (DPDP): consent online and on paper, a new notice version asks again, withdrawal,
// families' requests and the office reply. Throwaway student; the school's real privacy
// settings are saved first and restored exactly at the end.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  await svc.getPrivacySettings(); // make sure the row exists
  const saved = await prisma.privacySetting.findUniqueOrThrow({ where: { id: 1 } });
  try {
    const session = rows.add("AcademicSession", await prisma.academicSession.create({ data: { name: `${tag} session`, startDate: new Date("2026-06-01"), endDate: new Date("2027-05-31"), isCurrent: false } }));
    const cs = rows.add("ClassSection", await prisma.classSection.create({ data: { sessionId: session.id, className: "ZZ Test", section: tag } }));
    const office = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-o@test.local`, passwordHash: "x", role: "ADMIN", name: `${tag} Office` } }));
    const user = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-s@test.local`, passwordHash: "x", role: "STUDENT", name: `${tag} Student` } }));
    const student = rows.add("Student", await prisma.student.create({ data: { userId: user.id, admissionNo: `${tag}-ADM`, name: `${tag} Student`, rollNo: "1", classSectionId: cs.id, aadharNumber: `9${Date.now()}`.slice(0, 12) } }));

    // Public notice fills in the school name.
    const notice = await svc.getPublicNotice();
    assert.ok(!notice.noticeText.includes("{school}"));

    // Switched off (the default until the notice is reviewed): nobody is asked.
    await prisma.privacySetting.update({ where: { id: 1 }, data: { consentEnabled: false } });
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, false, "not asked while switched off");
    // Turning it on needs a grievance contact.
    await prisma.privacySetting.update({ where: { id: 1 }, data: { grievanceName: null, grievanceEmail: null } });
    await rejects(svc.updatePrivacySettings({ noticeText: saved.noticeText, consentEnabled: true }, office.id), /grievance officer/);
    await svc.updatePrivacySettings({ noticeText: saved.noticeText, consentEnabled: true, grievanceName: "Principal" }, office.id);

    // New student: asked for consent; validation; then agreed online.
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, true);
    await rejects(svc.giveMyConsent(user.id, { givenBy: "Ramesh Kumar", relationship: "Father" }), /tick the box/);
    await rejects(svc.giveMyConsent(user.id, { givenBy: "Ra", relationship: "Father", agree: true }), /full name/);
    await rejects(svc.giveMyConsent(user.id, { givenBy: "Ramesh Kumar", relationship: "Uncle", agree: true }), /Father, Mother or Guardian/);
    await svc.giveMyConsent(user.id, { givenBy: "Ramesh Kumar", relationship: "Father", agree: true }, "test-agent");
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, false);
    assert.equal((await svc.getStudentPrivacy(student.id)).status, "GIVEN");

    // A small edit doesn't ask again; an important change does.
    await rejects(svc.updatePrivacySettings({ noticeText: "too short" }, office.id), /too short/);
    await svc.updatePrivacySettings({ noticeText: saved.noticeText, grievanceEmail: "privacy@school.test" }, office.id);
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, false);
    await svc.updatePrivacySettings({ noticeText: saved.noticeText, askAgain: true }, office.id);
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, true, "new version asks again");
    assert.equal((await svc.getStudentPrivacy(student.id)).status, "OUTDATED");
    assert.ok((await svc.getConsentSummary()).missing.some((m) => m.id === student.id && m.outdated));

    // Paper consent from the office covers the new version.
    await rejects(svc.recordPaperConsent(student.id, { givenBy: "Sunita Kumari", relationship: "Mother", signedOn: "2999-01-01" }, office.id), /date the form was signed/);
    await svc.recordPaperConsent(student.id, { givenBy: "Sunita Kumari", relationship: "Mother", signedOn: new Date().toISOString().slice(0, 10) }, office.id);
    assert.equal((await svc.getMyConsentStatus(user.id)).needsConsent, false);

    // Withdrawal: the latest consent is withdrawn; the older (outdated) one remains -> OUTDATED.
    await rejects(svc.withdrawConsent(student.id, {}, office.id), /Say why/);
    await svc.withdrawConsent(student.id, { reason: "Mother's letter" }, office.id);
    assert.equal((await svc.getStudentPrivacy(student.id)).status, "OUTDATED");

    // Requests: validation, create, office reply, no second reply.
    await rejects(svc.createMyDataRequest(user.id, { type: "DELETE_ALL", details: "please remove" }), /Choose what/);
    await rejects(svc.createMyDataRequest(user.id, { type: "CORRECTION", details: "short" }), /sentence or two/);
    const req = await svc.createMyDataRequest(user.id, { type: "CORRECTION", details: "Date of birth should be 12 May 2014" });
    assert.ok((await svc.listDataRequests("OPEN")).some((r) => r.id === req.id));
    await rejects(svc.resolveDataRequest(req.id, { status: "RESOLVED" }, office.id), /reply/);
    await svc.resolveDataRequest(req.id, { status: "RESOLVED", response: "Corrected on 14 Nov." }, office.id);
    await rejects(svc.resolveDataRequest(req.id, { status: "RESOLVED", response: "again" }, office.id), /already been answered/);
    assert.equal((await svc.listMyDataRequests(user.id))[0].response, "Corrected on 14 Nov.");

    // "Your data": Aadhaar is masked; consents and requests are listed.
    const mine = await svc.getMyData(user.id);
    assert.match(String(mine.profile.aadhaar), /^•+\d{4}$/);
    assert.equal(mine.consents.length, 2);
    assert.equal(mine.requests.length, 1);

    console.log("privacy: all checks passed");
  } finally {
    await prisma.privacySetting.update({
      where: { id: 1 },
      data: { noticeText: saved.noticeText, noticeVersion: saved.noticeVersion, consentEnabled: saved.consentEnabled, grievanceName: saved.grievanceName, grievanceEmail: saved.grievanceEmail, grievancePhone: saved.grievancePhone },
    });
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
