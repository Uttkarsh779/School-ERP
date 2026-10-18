// Small formatting helpers shared by the admin student history tabs.

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const RESULT_META: Record<string, { label: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }> = {
  PASS: { label: "Pass", tone: "success" },
  FAIL: { label: "Fail", tone: "danger" },
  ABSENT: { label: "Absent", tone: "warning" },
  PENDING: { label: "Marks pending", tone: "info" },
  NOT_ENTERED: { label: "Not entered", tone: "neutral" },
};

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
