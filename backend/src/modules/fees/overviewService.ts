import { prisma } from "../../config/prisma";
import { withLateFees, num } from "./lateFeeService";

// Real fee figures for the Admin Fees "Overview" tab and the admin dashboard. Everything is
// computed from persisted charges/payments — no placeholder numbers when there's no data.
//
// - collectedToday / collectedThisMonth: successful payments by paidAt (IST calendar)
// - billedThisMonth: net of this month's charges (cancelled/void excluded)
// - collectionRate: paid against this month's charges / billed this month
// - outstanding / overdue: all open charges incl. late fees (lateFeeService)

const istParts = (now = new Date()) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  // IST midnight expressed in UTC (IST = UTC+05:30)
  const istMidnight = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd) - 330 * 60_000);
  return {
    year: y,
    month: m,
    todayStart: istMidnight(y, m, d),
    monthStart: istMidnight(y, m, 1),
    nextMonthStart: m === 12 ? istMidnight(y + 1, 1, 1) : istMidnight(y, m + 1, 1),
  };
};

export const getFeeOverview = async () => {
  const now = new Date();
  const t = istParts(now);

  const [todayAgg, monthPayments, monthCharges, openCharges, recentPayments, pendingRefunds, pendingOnline] =
    await Promise.all([
      prisma.payment.aggregate({
        where: { status: "SUCCESS", paidAt: { gte: t.todayStart } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { status: "SUCCESS", paidAt: { gte: t.monthStart, lt: t.nextMonthStart } },
        select: { amount: true, mode: true },
      }),
      prisma.feeCharge.findMany({
        where: { billingYear: t.year, billingMonth: t.month, status: { notIn: ["CANCELLED", "VOID"] } },
        select: { netAmount: true, paidAmount: true },
      }),
      prisma.feeCharge.findMany({
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        include: { student: { select: { id: true, isActive: true, classSection: { select: { id: true, className: true, section: true } } } } },
      }),
      prisma.payment.findMany({
        where: { status: "SUCCESS" },
        orderBy: { paidAt: "desc" },
        take: 8,
        include: {
          student: { select: { id: true, name: true, admissionNo: true, classSection: { select: { className: true, section: true } } } },
        },
      }),
      prisma.refund.count({ where: { status: { in: ["REFUND_REQUESTED", "REFUND_APPROVED"] } } }),
      prisma.payment.count({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 30 * 60_000) } } }),
    ]);

  const collectedThisMonth = monthPayments.reduce((s: number, p: any) => s + num(p.amount), 0);
  const byMode: Record<string, number> = {};
  for (const p of monthPayments as any[]) byMode[p.mode] = (byMode[p.mode] ?? 0) + num(p.amount);

  const billedThisMonth = monthCharges.reduce((s: number, c: any) => s + num(c.netAmount), 0);
  const paidAgainstThisMonth = monthCharges.reduce((s: number, c: any) => s + num(c.paidAmount), 0);

  const computed = await withLateFees(prisma, openCharges as any[], now);
  let outstanding = 0;
  let overdue = 0;
  const overdueStudents = new Set<number>();
  const byClass = new Map<string, { classSection: string; outstanding: number; students: Set<number> }>();
  for (const { charge, outstanding: o } of computed as any[]) {
    if (o <= 0) continue;
    outstanding += o;
    if (new Date(charge.dueDate) < now) {
      overdue += o;
      overdueStudents.add(charge.studentId);
    }
    const cs = charge.student?.classSection;
    const label = cs ? `${cs.className} - ${cs.section}` : "Unassigned";
    const row = byClass.get(label) ?? { classSection: label, outstanding: 0, students: new Set<number>() };
    row.outstanding += o;
    row.students.add(charge.studentId);
    byClass.set(label, row);
  }

  return {
    month: { year: t.year, month: t.month },
    collectedToday: num(todayAgg._sum.amount),
    paymentsToday: todayAgg._count._all,
    collectedThisMonth,
    paymentsThisMonth: monthPayments.length,
    byMode,
    billedThisMonth,
    collectionRate: billedThisMonth > 0 ? Math.round((paidAgainstThisMonth / billedThisMonth) * 1000) / 10 : null,
    outstanding,
    overdue,
    defaulterCount: overdueStudents.size,
    pendingRefunds,
    stalePendingOnlinePayments: pendingOnline,
    outstandingByClass: [...byClass.values()]
      .map((r) => ({ classSection: r.classSection, outstanding: r.outstanding, students: r.students.size }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8),
    recentPayments: (recentPayments as any[]).map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber ?? p.paymentNumber,
      amount: num(p.amount),
      mode: p.mode,
      paidAt: p.paidAt,
      student: {
        id: p.student.id,
        name: p.student.name,
        admissionNo: p.student.admissionNo,
        classSection: p.student.classSection ? `${p.student.classSection.className} - ${p.student.classSection.section}` : null,
      },
    })),
  };
};
