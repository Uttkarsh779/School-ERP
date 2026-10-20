import { prisma } from "../../config/prisma";
import { getStudentDueSummary } from "../fees/feeChargeService";
import { getExamAnalysis } from "../exams/analysisService";
import { percentage } from "../attendance/reportService";

// Complete history of one student for the admin "360°" view: academic (class per session),
// attendance by session and month, every exam result with rank, the full fee record
// (charges, payments, discounts, concessions, refunds) and transport assignments.
//
// Money is converted with Number() field by field — never `decimal + decimal`, which in JS
// concatenates Prisma Decimals as strings.

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
type Counts = { PRESENT: number; ABSENT: number; LATE: number; LEAVE: number };
const emptyCounts = (): Counts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 });
const markedOf = (c: Counts) => c.PRESENT + c.ABSENT + c.LATE + c.LEAVE;

export const getStudentHistory = async (studentId: number) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { classSection: { include: { session: true } } },
  });
  if (!student) return null;

  const [attendance, examIds, charges, payments, adjustments, concessions, refunds, legacyPayments, transport] =
    await Promise.all([
      prisma.attendance.findMany({
        where: { studentId },
        orderBy: { date: "asc" },
        select: {
          date: true,
          status: true,
          classSection: { select: { id: true, className: true, section: true, session: { select: { id: true, name: true, startDate: true } } } },
        },
      }),
      prisma.examResult.findMany({ where: { studentId }, select: { examId: true }, distinct: ["examId"] }),
      prisma.feeCharge.findMany({
        where: { studentId },
        include: { feeHead: { select: { name: true } }, session: { select: { name: true } } },
        orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }],
      }),
      prisma.payment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
      prisma.feeAdjustment.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        include: { appliedByUser: { select: { name: true } } },
      }),
      prisma.studentConcession.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        include: { concessionScheme: { select: { name: true } }, approvedByUser: { select: { name: true } } },
      }),
      prisma.refund.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
      prisma.feePayment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
      prisma.studentTransportAssignment.findMany({
        where: { studentId },
        orderBy: { startDate: "desc" },
        include: { village: { select: { name: true } } },
      }),
    ]);

  // ---- Academic history: one row per session, from attendance + exams + current class.
  const academic = new Map<number, { sessionId: number; sessionName: string; startDate: Date; classes: Set<string>; current: boolean; outcome?: string | null; remarks?: string | null }>();
  const addAcademic = (session: any, cs: { className: string; section: string }, current = false) => {
    if (!session) return;
    const row = academic.get(session.id) ?? { sessionId: session.id, sessionName: session.name, startDate: session.startDate, classes: new Set<string>(), current: false };
    row.classes.add(`${cs.className} - ${cs.section}`);
    row.current = row.current || current;
    academic.set(session.id, row);
  };
  addAcademic(student.classSection.session, student.classSection, true);
  for (const a of attendance as any[]) addAcademic(a.classSection.session, a.classSection);
  // Enrollment history (class per session + year-end result from promotion).
  const enrollments = await prisma.studentEnrollment.findMany({ where: { studentId }, include: { session: true, classSection: true } });
  for (const e of enrollments as any[]) {
    addAcademic(e.session, e.classSection);
    const row = academic.get(e.session.id)!;
    row.outcome = e.outcome;
    row.remarks = e.remarks;
  }

  // ---- Attendance by session, then month.
  type MonthRow = { year: number; month: number; counts: Counts; days: Record<string, string> };
  const bySession = new Map<number, { sessionId: number; sessionName: string; startDate: Date; classes: Set<string>; months: Map<string, MonthRow> }>();
  for (const a of attendance as any[]) {
    const s = a.classSection.session;
    const entry = bySession.get(s.id) ?? { sessionId: s.id, sessionName: s.name, startDate: s.startDate, classes: new Set<string>(), months: new Map() };
    entry.classes.add(`${a.classSection.className} - ${a.classSection.section}`);
    const key = a.date.toISOString().slice(0, 7);
    const m = entry.months.get(key) ?? { year: a.date.getUTCFullYear(), month: a.date.getUTCMonth() + 1, counts: emptyCounts(), days: {} };
    m.counts[a.status as keyof Counts] += 1;
    m.days[a.date.toISOString().slice(0, 10)] = a.status;
    entry.months.set(key, m);
    bySession.set(s.id, entry);
  }
  const attendanceHistory = [...bySession.values()]
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .map((s) => {
      const totals = emptyCounts();
      const months = [...s.months.values()]
        .sort((a, b) => b.year - a.year || b.month - a.month)
        .map((m) => {
          (Object.keys(totals) as (keyof Counts)[]).forEach((k) => (totals[k] += m.counts[k]));
          const marked = markedOf(m.counts);
          return { ...m, marked, percentage: percentage(m.counts.PRESENT, marked) };
        });
      const marked = markedOf(totals);
      return {
        sessionId: s.sessionId,
        sessionName: s.sessionName,
        classes: [...s.classes],
        totals: { counts: totals, marked, percentage: percentage(totals.PRESENT, marked) },
        months,
      };
    });
  const overallCounts = emptyCounts();
  for (const a of attendance as any[]) overallCounts[a.status as keyof Counts] += 1;

  // ---- Exam history: every exam with marks for this student, with the class-wide rank.
  const examHistory: any[] = [];
  for (const { examId } of examIds as { examId: number }[]) {
    const analysis = await getExamAnalysis(examId);
    if (!analysis) continue;
    const mine = analysis.students.find((s) => s.studentId === studentId);
    if (!mine) continue;
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { sessionId: true, session: { select: { startDate: true } } } });
    if (exam) {
      addAcademic({ id: exam.sessionId, name: analysis.exam.sessionName, startDate: exam.session.startDate }, analysis.exam.classSection);
    }
    const subjectName = new Map(analysis.subjects.map((s) => [s.id, s.name]));
    examHistory.push({
      examId,
      examName: analysis.exam.name,
      sessionName: analysis.exam.sessionName,
      sessionStart: exam?.session.startDate ?? null,
      className: `${analysis.exam.classSection.className} - ${analysis.exam.classSection.section}`,
      isLocked: analysis.exam.isLocked,
      passPercentage: analysis.passPercentage,
      total: mine.total,
      maxTotal: mine.maxTotal,
      percentage: mine.percentage,
      status: mine.status,
      rank: mine.rank,
      rankedCount: analysis.summary.appeared,
      classAverage: analysis.summary.averagePercentage,
      failedSubjects: mine.failedSubjects,
      subjects: mine.marks.map((m) => ({ subjectName: subjectName.get(m.subjectId) ?? "—", ...m })),
    });
  }
  examHistory.sort(
    (a, b) => (b.sessionStart?.getTime?.() ?? 0) - (a.sessionStart?.getTime?.() ?? 0) || b.examId - a.examId
  );

  // ---- Fees.
  let outstanding: { totalOutstanding: number; totalAdvanceAvailable: number } | null = null;
  try {
    const due = await getStudentDueSummary(studentId);
    outstanding = { totalOutstanding: due.totalOutstanding, totalAdvanceAvailable: due.totalAdvanceAvailable };
  } catch {
    outstanding = null;
  }
  const liveCharges = (charges as any[]).filter((c) => c.status !== "CANCELLED" && c.status !== "VOID");
  const successfulPayments = (payments as any[]).filter((p) => p.status === "SUCCESS");
  const fees = {
    summary: {
      totalBilled: liveCharges.reduce((s, c) => s + num(c.netAmount), 0),
      totalPaid: successfulPayments.reduce((s, p) => s + num(p.amount), 0),
      totalDiscounts: (adjustments as any[]).reduce((s, a) => s + num(a.amount), 0),
      totalRefunded: (refunds as any[]).filter((r) => r.status === "REFUND_PROCESSED").reduce((s, r) => s + num(r.amount), 0),
      totalOutstanding: outstanding?.totalOutstanding ?? null,
      advanceAvailable: outstanding?.totalAdvanceAvailable ?? null,
    },
    charges: (charges as any[]).map((c) => ({
      id: c.id,
      feeHead: c.feeHead?.name ?? "—",
      sessionName: c.session?.name ?? null,
      billingMonth: c.billingMonth,
      billingYear: c.billingYear,
      dueDate: c.dueDate,
      baseAmount: num(c.baseAmount),
      discountAmount: num(c.discountAmount),
      lateFeeAmount: num(c.lateFeeAmount),
      netAmount: num(c.netAmount),
      paidAmount: num(c.paidAmount),
      balance: Math.max(0, num(c.netAmount) - num(c.paidAmount)),
      status: c.status,
    })),
    payments: (payments as any[]).map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      receiptNumber: p.receiptNumber,
      amount: num(p.amount),
      mode: p.mode,
      status: p.status,
      transactionRef: p.transactionRef ?? p.razorpayPaymentId ?? null,
      date: p.paidAt ?? p.createdAt,
    })),
    adjustments: (adjustments as any[]).map((a) => ({
      id: a.id,
      type: a.type,
      amount: num(a.amount),
      reason: a.reason,
      appliedBy: a.appliedByUser?.name ?? null,
      date: a.createdAt,
    })),
    concessions: (concessions as any[]).map((c) => ({
      id: c.id,
      name: c.concessionScheme?.name ?? null,
      type: c.type,
      calculationType: c.calculationType,
      value: num(c.value),
      status: c.status,
      startsFrom: c.startsFrom,
      endsOn: c.endsOn,
      reason: c.reason,
      approvedBy: c.approvedByUser?.name ?? null,
    })),
    refunds: (refunds as any[]).map((r) => ({
      id: r.id,
      refundNumber: r.refundNumber,
      amount: num(r.amount),
      reason: r.reason,
      status: r.status,
      date: r.processedAt ?? r.createdAt,
    })),
    // Older single-table payments (pre ledger) — shown separately so nothing is hidden.
    legacyPayments: (legacyPayments as any[]).map((p) => ({
      id: p.id,
      amount: num(p.amount),
      mode: p.mode,
      status: p.status,
      receiptNumber: p.receiptNumber,
      date: p.paidAt ?? p.createdAt,
    })),
  };

  return {
    studentId,
    academicHistory: [...academic.values()]
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
      .map((a) => ({ sessionId: a.sessionId, sessionName: a.sessionName, classes: [...a.classes], current: a.current, outcome: a.outcome ?? null, remarks: a.remarks ?? null })),
    attendance: {
      overall: { counts: overallCounts, marked: markedOf(overallCounts), percentage: percentage(overallCounts.PRESENT, markedOf(overallCounts)) },
      sessions: attendanceHistory,
    },
    exams: examHistory.map(({ sessionStart, ...rest }) => rest),
    fees,
    transport: (transport as any[]).map((t) => ({
      id: t.id,
      villageName: t.village?.name ?? null,
      monthlyFee: t.monthlyFee === null ? null : num(t.monthlyFee),
      startDate: t.startDate,
      endDate: t.endDate,
      status: t.status,
      policy: t.policy,
      discontinuedAt: t.discontinuedAt,
      discontinueReason: t.discontinueReason,
    })),
  };
};
