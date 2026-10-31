import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Fee day book: every receipt in a date range (India calendar days), totals by payment mode
// and by who collected it, cancelled receipts, and refunds paid out, so the counter can be
// closed and cash handed over at the end of the day.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

// Money that came in (later refunds are listed separately as money going out).
const COLLECTED = ["SUCCESS", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export const MODE_LABEL: Record<string, string> = { CASH: "Cash", UPI_MANUAL: "UPI", BANK_TRANSFER: "Bank transfer", GATEWAY: "Online" };

export const getDayBook = async (fromRaw: unknown, toRaw: unknown) => {
  const from = String(fromRaw ?? "");
  const to = String(toRaw ?? "") || from;
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) throw httpError(400, "Pick the dates");
  if (to < from) throw httpError(400, "The end date is before the start date");
  const start = istStart(from);
  const end = new Date(istStart(to).getTime() + 86400_000);
  if (end.getTime() - start.getTime() > 92 * 86400_000) throw httpError(400, "Pick at most 3 months at a time");

  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: {
        OR: [
          { status: { in: [...COLLECTED] }, paidAt: { gte: start, lt: end } },
          // Receipts cancelled in the range (shown so the cash count can be explained).
          { status: "CANCELLED", cancelledAt: { gte: start, lt: end } },
        ],
      },
      orderBy: { paidAt: "asc" },
      include: { student: { select: { id: true, name: true, admissionNo: true, classSection: { select: { className: true, section: true } } } } },
    }),
    prisma.refund.findMany({
      where: { status: "REFUND_PROCESSED", processedAt: { gte: start, lt: end } },
      orderBy: { processedAt: "asc" },
      include: { student: { select: { name: true, admissionNo: true } } },
    }),
  ]);

  const userIds = [...new Set(payments.flatMap((p) => [p.recordedByUserId, p.cancelledByUserId]).filter((x): x is number => x !== null))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const collectorOf = (p: (typeof payments)[number]) => (p.mode === "GATEWAY" ? "Online payment" : (p.recordedByUserId && users.get(p.recordedByUserId)) || "Office");

  const receipts = payments.map((p) => ({
    id: p.id,
    receiptNumber: p.receiptNumber ?? p.paymentNumber,
    paidAt: p.paidAt,
    day: p.paidAt ? istDay(p.paidAt) : null,
    student: p.student.name,
    studentId: p.student.id,
    admissionNo: p.student.admissionNo,
    className: p.student.classSection ? `${p.student.classSection.className} - ${p.student.classSection.section}` : null,
    amount: Number(p.amount),
    mode: p.mode,
    transactionRef: p.transactionRef,
    collectedBy: collectorOf(p),
    cancelled: p.status === "CANCELLED",
    cancelledAt: p.cancelledAt,
    cancelReason: p.cancelReason,
    cancelledBy: p.cancelledByUserId ? users.get(p.cancelledByUserId) ?? null : null,
  }));

  const valid = receipts.filter((r) => !r.cancelled);
  const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const group = <K extends string>(key: (r: (typeof valid)[number]) => K) => {
    const m = new Map<K, typeof valid>();
    for (const r of valid) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].map(([k, rows]) => ({ key: k, count: rows.length, amount: sum(rows) })).sort((a, b) => b.amount - a.amount);
  };

  const refundRows = refunds.map((r) => ({
    id: r.id,
    refundNumber: r.refundNumber,
    processedAt: r.processedAt,
    student: r.student.name,
    admissionNo: r.student.admissionNo,
    amount: Number(r.amount),
    reason: r.reason,
  }));
  const collected = sum(valid);
  const refunded = sum(refundRows);

  return {
    from,
    to,
    totals: { collected, receipts: valid.length, refunded, net: Math.round((collected - refunded) * 100) / 100, cancelled: receipts.length - valid.length },
    byMode: group((r) => r.mode),
    byCollector: group((r) => r.collectedBy),
    byDay: from === to ? [] : group((r) => r.day ?? "").sort((a, b) => a.key.localeCompare(b.key)),
    receipts: valid,
    cancelled: receipts.filter((r) => r.cancelled),
    refunds: refundRows,
  };
};
