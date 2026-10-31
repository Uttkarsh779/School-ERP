import type { CalendarAudience, CalendarEvent, CalendarSettings } from "../../../store/api/calendar.api";

// Same rules as the backend (calendar/service.ts): Sunday and the chosen Saturdays of the
// month are weekly offs; HOLIDAY entries close the school for their audience.

export const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`; // m is 1-12
export const localToday = () => {
  const t = new Date();
  return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
};
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export const weeklyOff = (iso: string, s: CalendarSettings | undefined) => {
  if (!s) return null;
  const d = utc(iso);
  const wd = d.getUTCDay();
  if (wd === 0 && s.sundayOff) return "Sunday";
  if (wd === 6) {
    const nth = Math.ceil(d.getUTCDate() / 7);
    if (s.offSaturdays.includes(nth)) return `${["", "1st", "2nd", "3rd", "4th", "5th"][nth]} Saturday`;
  }
  return null;
};

const covers = (e: CalendarEvent, iso: string) => e.startDate.slice(0, 10) <= iso && iso <= e.endDate.slice(0, 10);
const forWho = (e: CalendarEvent, who: CalendarAudience) => e.audience === "ALL" || who === "ALL" || e.audience === who;

// Entries on a date (holidays first).
export const entriesOn = (events: CalendarEvent[], iso: string) =>
  events.filter((e) => covers(e, iso)).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "HOLIDAY" ? -1 : 1));

// Why a date is a day off for `who`, or null if it's a working day.
export const dayOffReason = (events: CalendarEvent[], settings: CalendarSettings | undefined, iso: string, who: CalendarAudience) =>
  events.find((e) => e.kind === "HOLIDAY" && covers(e, iso) && forWho(e, who))?.title ?? weeklyOff(iso, settings);

export const fmtRange = (e: CalendarEvent) => {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  const a = new Date(e.startDate).toLocaleDateString("en-IN", { ...opts, weekday: "short" });
  if (e.startDate.slice(0, 10) === e.endDate.slice(0, 10)) return a;
  return `${a} – ${new Date(e.endDate).toLocaleDateString("en-IN", { ...opts, weekday: "short" })}`;
};

export const daysIn = (e: CalendarEvent) => Math.round((utc(e.endDate.slice(0, 10)).getTime() - utc(e.startDate.slice(0, 10)).getTime()) / 86_400_000) + 1;

export const AUDIENCE_LABEL: Record<CalendarAudience, string> = { ALL: "Everyone", STUDENTS: "Students only", STAFF: "Staff only" };
