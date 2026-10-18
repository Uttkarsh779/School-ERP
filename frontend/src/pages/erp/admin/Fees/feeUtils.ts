// Shared helpers for the fee screens (admin tabs, payment desk, student fees page).

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const classLabel = (cs?: { className?: string; section?: string } | string | null) => {
  if (!cs) return "—";
  if (typeof cs === "string") return cs;
  return cs.className ? `${cs.className}${cs.section ? ` - ${cs.section}` : ""}` : "—";
};

export const MODE_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer / Cheque",
  UPI_MANUAL: "UPI",
  GATEWAY: "Online (Razorpay)",
};

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// Billing period "4/2026" -> "Apr 2026"
export const periodLabel = (period: string) => {
  const [m, y] = period.split("/").map(Number);
  return m && y ? `${MONTH_NAMES[m - 1]?.slice(0, 3)} ${y}` : period;
};
