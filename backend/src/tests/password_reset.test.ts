import "dotenv/config";
import assert from "node:assert/strict";

// Forgot-password flow end to end, with the "console" email/SMS providers so nothing is sent.
// Uses throwaway accounts that are deleted afterwards.
process.env.EMAIL_PROVIDER = "console";
process.env.SMS_PROVIDER = "console";
process.env.OTP_TEST_EMAIL = "";
process.env.OTP_TEST_PHONE = "";

import { prisma } from "../config/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { normalizePhone, maskPhone } from "../utils/sms";
import { requestPasswordReset, resetPasswordWithCode } from "../modules/auth/passwordResetService";

// Capture what the console providers "send".
const sent: string[] = [];
const realLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.startsWith("[Mail:console]") || line.startsWith("[SMS:console]")) sent.push(line);
  else realLog(...args);
};
const lastCode = () => {
  const m = sent.at(-1)?.match(/\b(\d{6})\b/);
  assert.ok(m, "a 6-digit code was sent");
  return m[1];
};
const rejects = async (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));

const tag = `pwreset${Date.now()}`;

const main = async () => {
  // Phone parsing
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("098765-43210"), "+919876543210");
  assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("919876543210"), "+919876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(maskPhone("+919876543210"), "+91 ******3210");

  const classSection = await prisma.classSection.findFirst();
  assert.ok(classSection, "needs at least one class section");

  const staff = await prisma.user.create({
    data: { email: `${tag}@test.local`, passwordHash: await hashPassword("OldPass123"), role: "TEACHER", name: "Reset Test Teacher" },
  });
  const studentUser = await prisma.user.create({
    data: { email: `${tag}-s@students.rrsintl.local`, passwordHash: await hashPassword("OldPass123"), role: "STUDENT", name: "Reset Test Student" },
  });
  const student = await prisma.student.create({
    data: { admissionNo: `${tag}-ADM`, name: "Reset Test Student", rollNo: "999", classSectionId: classSection.id, userId: studentUser.id, fatherContact: "98765 43210" },
  });

  try {
    // Unknown accounts: same silent success, nothing sent.
    await requestPasswordReset("nobody@nowhere.test", "staff");
    await requestPasswordReset("NO-SUCH-ADM", "family");
    assert.equal(sent.length, 0);
    // A student can't use the staff email route, and vice versa.
    await requestPasswordReset(studentUser.email, "staff");
    await requestPasswordReset(staff.email, "family");
    assert.equal(sent.length, 0);

    // Staff: email code
    await requestPasswordReset(staff.email.toUpperCase(), "staff");
    assert.equal(sent.length, 1);
    assert.match(sent[0], new RegExp(`to=${staff.email}`));
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";

    // Asking again within a minute doesn't send a second code.
    await requestPasswordReset(staff.email, "staff");
    assert.equal(sent.length, 1);

    await rejects(resetPasswordWithCode(staff.email, "staff", code, "short"), /at least 8/);
    await rejects(resetPasswordWithCode(staff.email, "staff", wrong, "NewPass123"), /4 tries left/);
    await resetPasswordWithCode(staff.email, "staff", code, "NewPass123");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    assert.ok(await comparePassword("NewPass123", after.passwordHash));
    // A used code can't be reused.
    await rejects(resetPasswordWithCode(staff.email, "staff", code, "Another123"), /wrong or has expired/);

    // Student: SMS to the father's number (no own number on file)
    await requestPasswordReset(student.admissionNo.toLowerCase(), "family");
    assert.equal(sent.length, 2);
    assert.match(sent[1], /\[SMS:console\] to=\+919876543210/);
    const sCode = lastCode();
    const sWrong = sCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await rejects(resetPasswordWithCode(student.admissionNo, "family", sWrong, "NewPass123"), /left.|Too many wrong/);
    // After 5 wrong tries even the right code is dead.
    await rejects(resetPasswordWithCode(student.admissionNo, "family", sCode, "NewPass123"), /wrong or has expired/);

    // Test routing: codes go to OTP_TEST_PHONE instead.
    await prisma.passwordReset.deleteMany({ where: { userId: studentUser.id } }); // skip the 60s cooldown
    process.env.OTP_TEST_PHONE = "+91 90000 00001";
    await requestPasswordReset(student.admissionNo, "family");
    assert.match(sent.at(-1)!, /to=\+919000000001/);
    await resetPasswordWithCode(student.admissionNo, "family", lastCode(), "Student123");
    const sAfter = await prisma.user.findUniqueOrThrow({ where: { id: studentUser.id } });
    assert.ok(await comparePassword("Student123", sAfter.passwordHash));

    realLog("password reset: all checks passed");
  } finally {
    await prisma.student.delete({ where: { id: student.id } });
    await prisma.user.deleteMany({ where: { id: { in: [staff.id, studentUser.id] } } });
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
