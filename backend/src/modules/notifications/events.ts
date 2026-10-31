import { prisma } from "../../config/prisma";
import { notify, notifyLater, type NotificationInput } from "./service";
import { isTodayOff } from "../calendar/service";

// What triggers a notification, who receives it and what it says. Each function is called
// from the module where the event happens and runs in the background (notifyLater).
// Student alerts go to the student's login (the family uses it today); students without a
// login are skipped.

const IST = 5.5 * 3600_000;
const istDate = (d = new Date()) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const prettyDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const ROLE_HOME: Record<string, string> = { SUPER_ADMIN: "/admin", ADMIN: "/admin", TEACHER: "/teacher", STUDENT: "/student" };

const studentUsers = (where: object) =>
  prisma.student.findMany({ where: { ...where, isActive: true, userId: { not: null } }, select: { id: true, name: true, userId: true } });

// ---- Attendance: marked absent (only for today's register, not back-dated corrections).
export const onAttendanceMarked = (date: Date, absentStudentIds: number[]) => {
  const day = date.toISOString().slice(0, 10);
  if (absentStudentIds.length === 0 || day !== istDate()) return;
  notifyLater(async () =>
    (await studentUsers({ id: { in: absentStudentIds } })).map((s: any) => ({
      userId: s.userId,
      type: "ABSENT",
      title: "Absent today",
      body: `${s.name} was marked absent today (${prettyDate(date)}). If this is a mistake, please contact the class teacher.`,
      link: "/student/attendance",
      dedupeKey: `absent:${day}`,
    }))
  );
};

// ---- Fees: payment received (office, multi-month desk or online).
export const onPaymentReceived = (paymentId: number) =>
  notifyLater(async () => {
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { amount: true, receiptNumber: true, status: true, student: { select: { name: true, userId: true } } },
    });
    if (!p || p.status !== "SUCCESS" || !p.student.userId) return [];
    return [
      {
        userId: p.student.userId,
        type: "PAYMENT",
        title: "Fee payment received",
        body: `${rupees(Number(p.amount))} received for ${p.student.name}${p.receiptNumber ? ` — receipt ${p.receiptNumber}` : ""}. Thank you!`,
        link: "/student/fees",
        dedupeKey: `payment:${paymentId}`,
      },
    ];
  });

// ---- Exams: results published.
export const onResultsPublished = (examId: number) =>
  notifyLater(async () => {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { name: true, classSectionId: true } });
    if (!exam) return [];
    return (await studentUsers({ classSectionId: exam.classSectionId })).map((s: any) => ({
      userId: s.userId,
      type: "RESULTS",
      title: `${exam.name} results are out`,
      body: `${s.name}'s report card for ${exam.name} is now available.`,
      link: "/student/report-card",
      dedupeKey: `results:${examId}`,
    }));
  });

// ---- Homework set for a class.
export const onHomeworkCreated = (assignmentId: number) =>
  notifyLater(async () => {
    const a = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { title: true, dueDate: true, classSectionId: true, subject: { select: { name: true } } },
    });
    if (!a) return [];
    return (await studentUsers({ classSectionId: a.classSectionId })).map((s: any) => ({
      userId: s.userId,
      type: "HOMEWORK",
      title: `New homework: ${a.subject?.name ?? "Homework"}`,
      body: `${a.title}${a.dueDate ? ` — due ${prettyDate(a.dueDate)}` : ""}`,
      link: "/student/assignments",
      dedupeKey: `homework:${assignmentId}`,
    }));
  });

// ---- Notices: same audience rules as the notice board (everyone / one role / one class).
export const onNoticesPosted = (noticeIds: number[]) =>
  notifyLater(async () => {
    const notices = await prisma.notice.findMany({ where: { id: { in: noticeIds } } });
    const out: NotificationInput[] = [];
    for (const n of notices as any[]) {
      let users: Array<{ id: number; role: string }>;
      if (n.targetClassSectionId) {
        users = (await studentUsers({ classSectionId: n.targetClassSectionId })).map((s: any) => ({ id: s.userId, role: "STUDENT" }));
      } else {
        users = await prisma.user.findMany({
          where: { isActive: true, role: n.targetRole ? n.targetRole : { in: ["STUDENT", "TEACHER"] } },
          select: { id: true, role: true },
        });
      }
      for (const u of users) {
        if (u.id === n.postedByUserId || !ROLE_HOME[u.role]) continue;
        out.push({
          userId: u.id,
          type: "NOTICE",
          title: `${n.isImportant ? "Important: " : "Notice: "}${n.title}`,
          body: String(n.body).replace(/\s+/g, " ").slice(0, 200),
          link: `${ROLE_HOME[u.role]}/notices`,
          dedupeKey: `notice:${n.id}`,
        });
      }
    }
    return out;
  });

// ---- Leave: a new request goes to whoever decides it; the decision goes back to the applicant.
export const onLeaveApplied = (leaveId: number) =>
  notifyLater(async () => {
    const l = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        fromDate: true,
        toDate: true,
        student: { select: { name: true, classSection: { select: { className: true, section: true, classTeacher: { select: { userId: true } } } } } },
        staff: { select: { user: { select: { name: true } } } },
      },
    });
    if (!l) return [];
    const range = `${prettyDate(l.fromDate)}${+l.toDate !== +l.fromDate ? ` – ${prettyDate(l.toDate)}` : ""}`;
    if (l.student) {
      const teacherUserId = l.student.classSection?.classTeacher?.userId;
      if (!teacherUserId) return [];
      return [
        {
          userId: teacherUserId,
          type: "LEAVE",
          title: "New leave request",
          body: `${l.student.name} (${l.student.classSection.className} - ${l.student.classSection.section}) has applied for leave: ${range}.`,
          link: "/teacher/leave",
          dedupeKey: `leave-new:${leaveId}`,
        },
      ];
    }
    const admins = await prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    return admins.map((a: any) => ({
      userId: a.id,
      type: "LEAVE" as const,
      title: "New staff leave request",
      body: `${l.staff?.user?.name ?? "A staff member"} has applied for leave: ${range}.`,
      link: "/admin/leaves",
      dedupeKey: `leave-new:${leaveId}`,
    }));
  });

export const onLeaveDecided = (leaveId: number) =>
  notifyLater(async () => {
    const l = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: { status: true, fromDate: true, toDate: true, decisionNote: true, requestedByUser: { select: { id: true, role: true } } },
    });
    if (!l || (l.status !== "APPROVED" && l.status !== "REJECTED") || !ROLE_HOME[l.requestedByUser.role]) return [];
    const range = `${prettyDate(l.fromDate)}${+l.toDate !== +l.fromDate ? ` – ${prettyDate(l.toDate)}` : ""}`;
    const role = l.requestedByUser.role;
    return [
      {
        userId: l.requestedByUser.id,
        type: "LEAVE",
        title: `Leave ${l.status === "APPROVED" ? "approved" : "not approved"}`,
        body: `Your leave for ${range} was ${l.status === "APPROVED" ? "approved" : "not approved"}.${l.decisionNote ? ` Note: ${l.decisionNote}` : ""}`,
        link: role === "STUDENT" ? "/student/leave" : role === "TEACHER" ? "/teacher/leave" : "/admin/leaves",
        dedupeKey: `leave-decided:${leaveId}`,
      },
    ];
  });

// ---- Fee reminders (scheduled): due in the next 3 days, and overdue (at most once a week).
// One notification per student per due date / per week, summing that student's charges.
export const buildFeeReminders = async (): Promise<NotificationInput[]> => {
  const today = new Date(`${istDate()}T00:00:00.000Z`);
  const soon = new Date(today.getTime() + 4 * 86_400_000);
  const charges = await prisma.feeCharge.findMany({
    where: {
      status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      dueDate: { lt: soon },
      student: { isActive: true, userId: { not: null } },
    },
    select: { dueDate: true, netAmount: true, paidAmount: true, student: { select: { id: true, name: true, userId: true } } },
  });

  // ISO-ish week number, so an overdue reminder repeats weekly rather than hourly.
  const week = Math.floor((today.getTime() / 86_400_000 + 3) / 7);
  const groups = new Map<string, { userId: number; name: string; amount: number; dueDate: Date; overdue: boolean }>();
  for (const c of charges as any[]) {
    const balance = Number(c.netAmount) - Number(c.paidAmount);
    if (balance <= 0) continue;
    const dueDay = new Date(c.dueDate.getTime() + IST).toISOString().slice(0, 10);
    const overdue = dueDay < istDate();
    const key = overdue ? `fee-overdue:${c.student.id}:w${week}` : `fee-due:${c.student.id}:${dueDay}`;
    const g = groups.get(key) ?? { userId: c.student.userId, name: c.student.name, amount: 0, dueDate: c.dueDate, overdue };
    g.amount += balance;
    if (c.dueDate < g.dueDate) g.dueDate = c.dueDate;
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, g]) => ({
    userId: g.userId,
    type: g.overdue ? "FEE_OVERDUE" : "FEE_DUE",
    title: g.overdue ? "Fee overdue" : "Fee due soon",
    body: g.overdue
      ? `${rupees(g.amount)} is overdue for ${g.name} (due since ${prettyDate(g.dueDate)}). Please pay to avoid late fees.`
      : `${rupees(g.amount)} is due for ${g.name} on ${prettyDate(g.dueDate)}.`,
    link: "/student/fees",
    dedupeKey: key,
  }));
};

export const sendFeeReminders = async () => {
  const sent = await notify(await buildFeeReminders());
  if (sent.length) console.log(`[Notifications] Fee reminders sent: ${sent.length}`);
};

// Checks hourly; sends only between 9 AM and 7 PM India time so nobody is woken up. The
// dedupe keys make repeated runs harmless.
export const startFeeReminderJob = () => {
  const run = () => {
    const hour = new Date(Date.now() + IST).getUTCHours();
    if (hour < 9 || hour >= 19) return;
    // No fee reminders on Sundays, weekly offs and school holidays.
    isTodayOff("STUDENTS")
      .then((off) => (off ? undefined : sendFeeReminders()))
      .catch((err) => console.error("[Notifications] Fee reminders failed:", err?.message ?? err));
  };
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60_000).unref();
};
