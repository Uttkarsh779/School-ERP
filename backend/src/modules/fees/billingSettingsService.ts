import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { generateCollectionPeriodBills } from "./collectionEngineService";
import { periodCodeFor } from "./billingService";
import { createAuditLog } from "./ledgerService";
import { notify } from "../notifications/service";

// Monthly billing settings and the automatic monthly run.
//  - autoGenerate on: each month's bills are generated on generateDay (or the first hourly
//    check after it, if the server was down that day). Each month runs once — the claim on
//    lastAutoRunPeriod makes a second server/process skip it.
//  - Bills for a month that's already billed are skipped (generation is idempotent), so
//    turning this on mid-month only fills in missing bills.
//  - transportDueDay is the transport fee's due day; fee items carry their own due day.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IST = 5.5 * 3600_000;
const istNow = () => new Date(Date.now() + IST);

export const getBillingSettings = () =>
  prisma.feeBillingSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

const dayField = (v: unknown, label: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 28) throw httpError(400, `${label} must be a day between 1 and 28`);
  return n;
};

export const updateBillingSettings = async (actor: { id: number }, body: any) => {
  const before = await getBillingSettings();
  const data: any = { updatedByUserId: actor.id };
  if (body?.autoGenerate !== undefined) {
    if (typeof body.autoGenerate !== "boolean") throw httpError(400, "autoGenerate must be true or false");
    data.autoGenerate = body.autoGenerate;
  }
  if (body?.generateDay !== undefined) data.generateDay = dayField(body.generateDay, "Bill generation day");
  if (body?.transportDueDay !== undefined) data.transportDueDay = dayField(body.transportDueDay, "Transport due day");
  const after = await prisma.feeBillingSetting.update({ where: { id: 1 }, data });
  await createAuditLog({
    action: "UPDATE_BILLING_SETTINGS",
    entityType: "FeeBillingSetting",
    entityId: 1,
    userId: actor.id,
    oldValues: { autoGenerate: before.autoGenerate, generateDay: before.generateDay, transportDueDay: before.transportDueDay },
    newValues: { autoGenerate: after.autoGenerate, generateDay: after.generateDay, transportDueDay: after.transportDueDay },
  });
  return after;
};

export const runAutoBilling = async () => {
  const settings = await getBillingSettings();
  if (!settings.autoGenerate) return null;
  const now = istNow();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  if (now.getUTCDate() < settings.generateDay) return null;
  const code = periodCodeFor(month, year);
  if (settings.lastAutoRunPeriod === code) return null;

  // Only inside the current session (no bills during a gap between sessions).
  const monthMid = new Date(Date.UTC(year, month - 1, 15));
  const session = await prisma.academicSession.findFirst({
    where: { isCurrent: true, startDate: { lte: monthMid }, endDate: { gte: monthMid } },
  });
  if (!session) return null;

  // Claim this month; whoever loses the race does nothing.
  const { count } = await prisma.feeBillingSetting.updateMany({
    where: { id: 1, OR: [{ lastAutoRunPeriod: null }, { lastAutoRunPeriod: { not: code } }] },
    data: { lastAutoRunPeriod: code, lastAutoRunAt: new Date(), lastAutoRunSummary: "Running…" },
  });
  if (count === 0) return null;

  const label = `${MONTHS[month - 1]} ${year}`;
  try {
    const result = await generateCollectionPeriodBills({ sessionId: session.id, billingMonth: month, billingYear: year });
    const summary = `${label}: ${result.newlyGenerated} new bill(s), ${result.alreadyBilled} already billed${result.errors ? `, ${result.errors} failed` : ""}`;
    await prisma.feeBillingSetting.update({ where: { id: 1 }, data: { lastAutoRunSummary: summary } });
    console.log(`[Auto billing] ${summary}`);

    const admins = await prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    await notify(
      admins.map((a: any) => ({
        userId: a.id,
        type: "NOTICE" as const,
        title: `${label} fee bills generated`,
        body: `${result.newlyGenerated} new bill(s) generated automatically${result.errors ? ` · ${result.errors} could not be generated — check Fees → Bills` : ""}.`,
        link: "/admin/fees?tab=bills",
        dedupeKey: `auto-billing:${code}`,
      }))
    );
    return result;
  } catch (err: any) {
    // Release the claim so the next hourly check tries again.
    await prisma.feeBillingSetting.update({
      where: { id: 1 },
      data: { lastAutoRunPeriod: settings.lastAutoRunPeriod, lastAutoRunSummary: `${label}: failed — ${err?.message ?? err}` },
    });
    throw err;
  }
};

export const startAutoBillingJob = () => {
  const run = () => runAutoBilling().catch((err) => console.error("[Auto billing] Failed:", err?.message ?? err));
  setTimeout(run, 90_000);
  setInterval(run, 60 * 60_000).unref();
};
