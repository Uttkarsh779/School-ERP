import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { notify, type NotificationInput } from "../notifications/service";

// School calendar: holidays and events, plus weekly offs (Sunday and chosen Saturdays).
// Admins manage it; everyone can view it. offDays() is the one place that decides whether a
// date is a day off, used by leave approval, fee reminders and (later) payroll.
//  - kind HOLIDAY = school closed (for its audience); EVENT = shown on the calendar only.
//  - audience ALL | STUDENTS | STAFF: e.g. a staff training day is off for students only.

export const KINDS = ["HOLIDAY", "EVENT"] as const;
export const AUDIENCES = ["ALL", "STUDENTS", "STAFF"] as const;
type Audience = (typeof AUDIENCES)[number];
type Actor = { id: number };

const DAY = 86_400_000;
const IST = 5.5 * 3600_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date(Date.now() + IST));
const parseDate = (v: unknown, label: string) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw httpError(400, `${label} must be a date`);
  return new Date(`${v}T00:00:00.000Z`);
};
const pretty = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Weekly offs
// ---------------------------------------------------------------------------

export const getSettings = () => prisma.calendarSetting.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

export const updateSettings = async (body: any) => {
  const data: any = {};
  if (body?.sundayOff !== undefined) {
    if (typeof body.sundayOff !== "boolean") throw httpError(400, "sundayOff must be true or false");
    data.sundayOff = body.sundayOff;
  }
  if (body?.offSaturdays !== undefined) {
    const list: number[] | null = Array.isArray(body.offSaturdays) ? [...new Set<number>(body.offSaturdays.map(Number))] : null;
    if (!list || list.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw httpError(400, "offSaturdays must be a list of 1–5 (which Saturdays of the month)");
    data.offSaturdays = (list as number[]).sort();
  }
  await getSettings();
  return prisma.calendarSetting.update({ where: { id: 1 }, data });
};

// Weekly-off reason for a date, or null. Saturdays are counted within the month (2nd, 4th…).
export const weeklyOff = (d: Date, s: { sundayOff: boolean; offSaturdays: number[] }) => {
  const wd = d.getUTCDay();
  if (wd === 0 && s.sundayOff) return "Sunday";
  if (wd === 6) {
    const nth = Math.ceil(d.getUTCDate() / 7);
    if (s.offSaturdays.includes(nth)) return `${["", "1st", "2nd", "3rd", "4th", "5th"][nth]} Saturday`;
  }
  return null;
};

const appliesTo = (eventAudience: string, who: Audience) => eventAudience === "ALL" || who === "ALL" || eventAudience === who;

// Every day off between from and to (inclusive) for `who`: date → reason.
export const offDays = async (from: Date, to: Date, who: Audience = "ALL") => {
  const [settings, holidays] = await Promise.all([
    getSettings(),
    prisma.calendarEvent.findMany({ where: { kind: "HOLIDAY", startDate: { lte: to }, endDate: { gte: from } } }),
  ]);
  const out = new Map<string, string>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    const w = weeklyOff(d, settings);
    if (w) out.set(iso(d), w);
  }
  for (const h of holidays as any[]) {
    if (!appliesTo(h.audience, who)) continue;
    for (let t = Math.max(h.startDate.getTime(), from.getTime()); t <= Math.min(h.endDate.getTime(), to.getTime()); t += DAY) {
      out.set(iso(new Date(t)), h.title);
    }
  }
  return out;
};

export const isDayOff = async (date: Date, who: Audience = "ALL") => (await offDays(date, date, who)).get(iso(date)) ?? null;
export const isTodayOff = (who: Audience = "ALL") => isDayOff(new Date(`${todayIso()}T00:00:00.000Z`), who);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const include = { createdByUser: { select: { name: true } } };

export const listEvents = async (q: any) => {
  const from = q?.from ? parseDate(q.from, "From") : new Date(Date.now() - 31 * DAY);
  const to = q?.to ? parseDate(q.to, "To") : new Date(Date.now() + 400 * DAY);
  if (to.getTime() - from.getTime() > 800 * DAY) throw httpError(400, "Choose a shorter date range");
  const [events, settings] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { startDate: { lte: to }, endDate: { gte: from } }, orderBy: [{ startDate: "asc" }, { id: "asc" }], include }),
    getSettings(),
  ]);
  return { events, settings };
};

const parseEvent = (body: any) => {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) throw httpError(400, "Title is required");
  if (title.length > 100) throw httpError(400, "Title is too long (max 100)");
  if (!KINDS.includes(body?.kind)) throw httpError(400, "Choose holiday or event");
  const audience = body?.audience ?? "ALL";
  if (!AUDIENCES.includes(audience)) throw httpError(400, "Choose who it applies to");
  const startDate = parseDate(body?.startDate, "Start date");
  const endDate = body?.endDate ? parseDate(body.endDate, "End date") : startDate;
  if (endDate < startDate) throw httpError(400, "End date can't be before the start date");
  if ((endDate.getTime() - startDate.getTime()) / DAY > 90) throw httpError(400, "A single entry can be at most 90 days long");
  const description = typeof body?.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null;
  return { title, kind: body.kind as string, audience: audience as string, startDate, endDate, description };
};

// A holiday still ahead waits to be announced (see runCalendarNotifications).
const pendingFor = (e: { kind: string; endDate: Date }) => e.kind === "HOLIDAY" && iso(e.endDate) >= todayIso();

export const createEvent = async (actor: Actor, body: any) => {
  const data = parseEvent(body);
  return prisma.calendarEvent.create({ data: { ...data, announcePending: pendingFor(data), createdByUserId: actor.id }, include });
};

export const updateEvent = async (id: number, body: any) => {
  const before = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!before) throw httpError(404, "Calendar entry not found");
  const data = parseEvent(body);
  const changed = +before.startDate !== +data.startDate || +before.endDate !== +data.endDate || before.kind !== data.kind || before.title !== data.title;
  return prisma.calendarEvent.update({
    where: { id },
    data: { ...data, ...(changed ? { announcePending: pendingFor(data) } : {}) },
    include,
  });
};

export const deleteEvent = async (id: number) => {
  const { count } = await prisma.calendarEvent.deleteMany({ where: { id } });
  if (count === 0) throw httpError(404, "Calendar entry not found");
};

// Start of a new session: copy last session's entries a year (or more) ahead. Festival
// dates move every year, so the admin then adjusts them. Entries already there are skipped.
export const copyFromSession = async (actor: Actor, body: any) => {
  const [from, to] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: Number(body?.fromSessionId) } }),
    prisma.academicSession.findUnique({ where: { id: Number(body?.toSessionId) } }),
  ]);
  if (!from || !to) throw httpError(400, "Choose both sessions");
  const years = new Date(to.startDate.getTime() + IST).getUTCFullYear() - new Date(from.startDate.getTime() + IST).getUTCFullYear();
  if (years <= 0) throw httpError(400, "Copy into a later session");
  const shift = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));

  const source = await prisma.calendarEvent.findMany({ where: { startDate: { gte: from.startDate }, endDate: { lte: from.endDate } } });
  const existing = await prisma.calendarEvent.findMany({ where: { startDate: { gte: to.startDate, lte: to.endDate } }, select: { title: true } });
  const have = new Set(existing.map((e: any) => e.title.toLowerCase()));
  const rows = (source as any[])
    .filter((e) => !have.has(e.title.toLowerCase()))
    .map((e) => ({
      title: e.title,
      kind: e.kind,
      audience: e.audience,
      startDate: shift(e.startDate),
      endDate: shift(e.endDate),
      description: e.description,
      createdByUserId: actor.id,
    }));
  if (rows.length) await prisma.calendarEvent.createMany({ data: rows });
  return { copied: rows.length, skipped: source.length - rows.length };
};

// ---------------------------------------------------------------------------
// Notifications (calendar job)
// ---------------------------------------------------------------------------
//  1. Summary: holidays added/changed are announced together once the admin has stopped
//     editing for 10 minutes — one notification per person however many were added.
//  2. Reminder: on the last working day before a holiday (from 2 PM) — "Tomorrow is a holiday".
// Only between 8 AM and 8 PM India time; anything due overnight goes out in the morning.

const QUIET_MS = 10 * 60_000;
const istHour = () => new Date(Date.now() + IST).getUTCHours();
const linkFor = (role: string) => (role === "TEACHER" ? "/teacher/calendar" : role === "STUDENT" ? "/student/calendar" : "/admin/calendar");
const whoFor = (role: string): Audience => (role === "STUDENT" ? "STUDENTS" : "STAFF");
const recipients = () =>
  prisma.user.findMany({ where: { isActive: true, role: { in: ["STUDENT", "TEACHER", "PRINCIPAL", "ACCOUNTANT"] } }, select: { id: true, role: true } });
const when = (e: { startDate: Date; endDate: Date }) =>
  +e.endDate === +e.startDate ? pretty(e.startDate) : `${pretty(e.startDate)} – ${pretty(e.endDate)}`;

const sendSummary = async () => {
  const pending = await prisma.calendarEvent.findMany({ where: { announcePending: true }, orderBy: { startDate: "asc" } });
  if (pending.length === 0) return 0;
  // Still editing: wait until nothing has changed for 10 minutes.
  if (pending.some((e: any) => Date.now() - e.updatedAt.getTime() < QUIET_MS)) return 0;
  const { count } = await prisma.calendarEvent.updateMany({
    where: { id: { in: pending.map((e: any) => e.id) }, announcePending: true },
    data: { announcePending: false },
  });
  if (count === 0) return 0; // another process took them

  const upcoming = (pending as any[]).filter((e) => e.kind === "HOLIDAY" && iso(e.endDate) >= todayIso());
  const items: NotificationInput[] = [];
  for (const u of (await recipients()) as any[]) {
    const mine = upcoming.filter((e) => appliesTo(e.audience, whoFor(u.role)));
    if (mine.length === 0) continue;
    const first = mine[0];
    items.push({
      userId: u.id,
      type: "HOLIDAY",
      title: mine.length === 1 ? `Holiday: ${first.title}` : `School calendar updated: ${mine.length} holidays`,
      body:
        mine.length === 1
          ? `School will be closed on ${when(first)}.${first.description ? ` ${first.description}` : ""}`
          : `Next: ${first.title} (${when(first)}). See the school calendar for all dates.`,
      link: linkFor(u.role),
      dedupeKey: `calendar-summary:${mine.map((e) => e.id).join(",")}:${Date.now()}`,
    });
  }
  await notify(items);
  return items.length;
};

// Last working day before `start` for `who` (within a week), so a Monday holiday is
// announced on Saturday or Friday rather than on Sunday.
const lastWorkingDayBefore = async (start: Date, who: Audience) => {
  const from = new Date(start.getTime() - 7 * DAY);
  const off = await offDays(from, new Date(start.getTime() - DAY), who);
  for (let t = start.getTime() - DAY; t >= from.getTime(); t -= DAY) {
    if (!off.has(iso(new Date(t)))) return iso(new Date(t));
  }
  return iso(new Date(start.getTime() - DAY));
};

const nextWorkingDayAfter = async (end: Date, who: Audience) => {
  const to = new Date(end.getTime() + 30 * DAY);
  const off = await offDays(new Date(end.getTime() + DAY), to, who);
  for (let t = end.getTime() + DAY; t <= to.getTime(); t += DAY) {
    if (!off.has(iso(new Date(t)))) return new Date(t);
  }
  return null;
};

const sendReminders = async () => {
  if (istHour() < 14) return 0;
  const today = todayIso();
  const soon = await prisma.calendarEvent.findMany({
    where: { kind: "HOLIDAY", startDate: { gt: new Date(`${today}T00:00:00.000Z`), lte: new Date(Date.parse(`${today}T00:00:00.000Z`) + 8 * DAY) } },
  });
  if (soon.length === 0) return 0;
  const users = (await recipients()) as any[];
  const items: NotificationInput[] = [];
  for (const h of soon as any[]) {
    for (const who of ["STUDENTS", "STAFF"] as const) {
      if (!appliesTo(h.audience, who)) continue;
      if ((await lastWorkingDayBefore(h.startDate, who)) !== today) continue;
      const reopens = await nextWorkingDayAfter(h.endDate, who);
      const days = Math.round((h.endDate.getTime() - h.startDate.getTime()) / DAY) + 1;
      const startsTomorrow = iso(h.startDate) === iso(new Date(Date.parse(`${today}T00:00:00.000Z`) + DAY));
      for (const u of users.filter((x) => whoFor(x.role) === who)) {
        items.push({
          userId: u.id,
          type: "HOLIDAY",
          title: `${startsTomorrow ? "Tomorrow" : `From ${pretty(h.startDate)}`}: ${h.title}`,
          body: `School is closed${days > 1 ? ` for ${days} days (${when(h)})` : ""}.${
            reopens ? ` Reopens on ${reopens.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}.` : ""
          }`,
          link: linkFor(u.role),
          dedupeKey: `holiday-reminder:${h.id}:${iso(h.startDate)}`,
        });
      }
    }
  }
  return (await notify(items)).length;
};

export const runCalendarNotifications = async () => {
  const hour = istHour();
  if (hour < 8 || hour >= 20) return;
  const summaries = await sendSummary();
  const reminders = await sendReminders();
  if (summaries || reminders) console.log(`[Calendar] Notifications sent: ${summaries} summary, ${reminders} reminder`);
};

export const startCalendarJob = () => {
  const run = () => runCalendarNotifications().catch((err) => console.error("[Calendar] Notifications failed:", err?.message ?? err));
  setInterval(run, 5 * 60_000).unref();
};
