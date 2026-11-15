import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { Role } from "../../generated/prisma/enums";
import { schoolName, testRouting } from "../../config/messaging";
import { httpError } from "../../utils/httpError";
import { hashPassword } from "../../utils/password";
import { sendMail } from "../../utils/mailer";
import { maskPhone, normalizePhone, sendSms } from "../../utils/sms";
import { validateNewPassword } from "../profile/service";
import { signOutEverywhere } from "./tokens";

// Forgot password, without the school office:
//   Staff / Admin  -> 6-digit code to the account's email.
//   Students       -> 6-digit code by SMS to the student's mobile on file (parents use the
//                     student's login, so the father's / mother's number is the fallback).
// While OTP_TEST_EMAIL / OTP_TEST_PHONE are set, every code goes there instead (testing).

export type ResetMode = "staff" | "family";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
};

type Target = { userId: number; name: string; channel: "EMAIL" | "SMS"; to: string | null };

// Finds the account the person is resetting and where the code would go. Mirrors login:
// staff sign in with email; students with admission number (or email).
const resolveTarget = async (identifierRaw: unknown, mode: unknown): Promise<Target | null> => {
  const identifier = typeof identifierRaw === "string" ? identifierRaw.trim() : "";
  if (!identifier) throw httpError(400, mode === "staff" ? "Enter your email" : "Enter your admission number");
  if (mode !== "staff" && mode !== "family") throw httpError(400, "Choose Student or Staff / Admin");

  if (mode === "staff") {
    const user =
      (await prisma.user.findUnique({ where: { email: identifier } })) ??
      (await prisma.user.findFirst({ where: { email: { equals: identifier, mode: "insensitive" } } }));
    if (!user || !user.isActive || user.role === Role.STUDENT) return null;
    return { userId: user.id, name: user.name, channel: "EMAIL", to: user.email };
  }

  const student =
    (await prisma.student.findUnique({ where: { admissionNo: identifier }, include: { user: true } })) ??
    (await prisma.student.findFirst({
      where: { OR: [{ admissionNo: { equals: identifier, mode: "insensitive" } }, { user: { email: { equals: identifier, mode: "insensitive" } } }] },
      include: { user: true },
    }));
  const user = student?.user;
  if (!student || !user || !user.isActive || user.role !== Role.STUDENT) return null;
  const phone = [student.contactNumber, student.fatherContact, student.motherContact].map((p) => normalizePhone(p)).find(Boolean) ?? null;
  return { userId: user.id, name: student.name, channel: "SMS", to: phone };
};

const deliver = async (target: Target, code: string) => {
  const school = schoolName();
  const test = testRouting();
  if (target.channel === "EMAIL") {
    const to = test.email || target.to!;
    const text =
      `Hello ${target.name},\n\n` +
      `Your ${school} password reset code is: ${code}\n\n` +
      `It expires in ${CODE_TTL_MIN} minutes. If you didn't ask to reset your password, ignore this email; your password stays the same.` +
      (test.email ? `\n\n[Test mode: meant for ${target.to}]` : "");
    const html =
      `<p>Hello ${escapeHtml(target.name)},</p>` +
      `<p>Your ${escapeHtml(school)} password reset code is:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>` +
      `<p>It expires in ${CODE_TTL_MIN} minutes. If you didn't ask to reset your password, ignore this email; your password stays the same.</p>` +
      (test.email ? `<p style="color:#888">[Test mode: meant for ${escapeHtml(target.to!)}]</p>` : "");
    await sendMail({ to, subject: `${school} password reset code: ${code}`, text, html });
    return maskEmail(to);
  }
  const to = normalizePhone(test.phone) || target.to!;
  await sendSms(to, `${code} is your ${school} password reset code. It expires in ${CODE_TTL_MIN} minutes. Don't share it with anyone.`, code);
  return maskPhone(to);
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// The reply is the same whether or not the account exists, so this can't be used to find out
// which emails / admission numbers are registered.
export const requestPasswordReset = async (identifier: unknown, mode: unknown): Promise<void> => {
  const target = await resolveTarget(identifier, mode);
  if (!target) return;
  if (!target.to && !(target.channel === "SMS" && testRouting().phone)) {
    console.warn(`[PasswordReset] user ${target.userId} has no ${target.channel === "SMS" ? "mobile number" : "email"} on file`);
    return;
  }

  const last = await prisma.passwordReset.findFirst({ where: { userId: target.userId }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_SEC * 1000) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  let destination: string;
  try {
    destination = await deliver(target, code);
  } catch (err) {
    console.error(`[PasswordReset] sending ${target.channel} code to user ${target.userId} failed:`, err);
    throw httpError(502, "The code couldn't be sent right now. Please try again in a few minutes, or contact the school office.");
  }
  await prisma.$transaction([
    // Only the newest code works.
    prisma.passwordReset.updateMany({ where: { userId: target.userId, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordReset.create({
      data: {
        userId: target.userId,
        channel: target.channel,
        destination,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
      },
    }),
  ]);
};

export const resetPasswordWithCode = async (identifier: unknown, mode: unknown, codeRaw: unknown, newPassword: unknown): Promise<void> => {
  const code = typeof codeRaw === "string" ? codeRaw.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(code)) throw httpError(400, "Enter the 6-digit code");
  validateNewPassword(newPassword);

  const invalid = httpError(400, "This code is wrong or has expired. Ask for a new one.");
  const target = await resolveTarget(identifier, mode);
  if (!target) throw invalid;

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: target.userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!reset || reset.attempts >= MAX_ATTEMPTS) throw invalid;

  if (!(await bcrypt.compare(code, reset.codeHash))) {
    const attempts = reset.attempts + 1;
    await prisma.passwordReset.update({
      where: { id: reset.id },
      data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { usedAt: new Date() } : {}) },
    });
    const left = MAX_ATTEMPTS - attempts;
    throw httpError(400, left > 0 ? `Wrong code. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Ask for a new one.");
  }

  const passwordHash = await hashPassword(newPassword as string);
  // Claim the code first so two requests with the same code can't both succeed.
  const claimed = await prisma.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw invalid;
  await prisma.user.update({ where: { id: target.userId }, data: { passwordHash, ...signOutEverywhere } });
};
