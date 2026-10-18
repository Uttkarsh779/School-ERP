// Shared labels/helpers for the detailed monthly attendance report.

export const LOW_ATTENDANCE_THRESHOLD = 75; // same default as the Defaulters tab

export const STATUS_META: Record<AttendanceStatus, { short: string; label: string }> = {
  PRESENT: { short: "P", label: "Present" },
  ABSENT: { short: "A", label: "Absent" },
  LATE: { short: "L", label: "Late" },
  LEAVE: { short: "Lv", label: "Leave" },
};

export const pctTone = (pct: number | null): "success" | "warning" | "danger" | "neutral" =>
  pct === null ? "neutral" : pct >= 90 ? "success" : pct >= LOW_ATTENDANCE_THRESHOLD ? "warning" : "danger";

export const formatPct = (pct: number | null) => (pct === null ? "—" : `${pct}%`);

export const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const dayKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// 0 = Sunday … 6 = Saturday
export const weekday = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

export const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const formatDayKey = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
