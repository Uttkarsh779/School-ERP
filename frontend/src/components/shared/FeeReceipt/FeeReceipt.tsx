import styles from "./FeeReceipt.module.css";

export interface FeeReceiptItem {
  description: string;
  amount: number;
  billingPeriod?: string;
}

// Letterhead comes from Website CMS settings (served with every receipt), so a new logo,
// name or address there shows up on all receipts automatically.
export interface ReceiptSchool {
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  boardName?: string | null;
  affiliationNo?: string | null;
  schoolCode?: string | null;
}

export interface FeeReceiptData {
  receiptNo: string;
  paidAt: string;
  studentName: string;
  admissionNo: string;
  rollNo?: string | number;
  className?: string;
  fatherName?: string;
  contactNumber?: string;
  mode: string;
  transactionRef?: string;
  amountPaid: number;
  sessionName?: string;
  items?: FeeReceiptItem[];
  advanceAmount?: number;
  receivedBy?: string;
  status?: string;
  school?: ReceiptSchool;
}

export function numberToWordsIndian(num: number): string {
  if (!num || num <= 0) return "Rupees Zero Only";

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + inWords(n % 10000000) : "");
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  return `Rupees ${inWords(rupees) || "Zero"}${paise ? ` and ${inWords(paise)} Paise` : ""} Only`;
}

const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && /[A-Z]/.test(w[0]))
    .map((w) => w[0])
    .slice(0, 3)
    .join("") || name.slice(0, 2).toUpperCase();

// Watermark for receipts that aren't a plain successful payment.
const STAMP: Record<string, { text: string; tone: "paid" | "void" | "warn" }> = {
  SUCCESS: { text: "PAID", tone: "paid" },
  PARTIALLY_REFUNDED: { text: "PART REFUNDED", tone: "warn" },
  REFUNDED: { text: "REFUNDED", tone: "void" },
  PENDING: { text: "PENDING", tone: "warn" },
  FAILED: { text: "FAILED", tone: "void" },
  CANCELLED: { text: "CANCELLED", tone: "void" },
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Apr 2026", "May 2026", "Jun 2026" -> "Apr – Jun 2026"; gaps/mixed years -> "Apr, Jun 2026 · Jan 2027".
const monthRange = (labels: string[]) => {
  const parsed = labels.map((l) => {
    const [m, y] = l.split(" ");
    return { m: MON.indexOf(m), y: Number(y), raw: l };
  });
  if (parsed.some((p) => p.m < 0 || !p.y)) return labels.join(", ");
  parsed.sort((a, b) => a.y * 12 + a.m - (b.y * 12 + b.m));
  const idx = parsed.map((p) => p.y * 12 + p.m);
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (parsed.length === 1) return first.raw;
  if (consecutive) return first.y === last.y ? `${MON[first.m]} – ${MON[last.m]} ${last.y}` : `${MON[first.m]} ${first.y} – ${MON[last.m]} ${last.y}`;
  const byYear = new Map<number, string[]>();
  for (const p of parsed) byYear.set(p.y, [...(byYear.get(p.y) ?? []), MON[p.m]]);
  return [...byYear.entries()].map(([y, ms]) => `${ms.join(", ")} ${y}`).join(" · ");
};

// One line per fee head with the months it covers — how school counter receipts read.
const groupItems = (items: FeeReceiptItem[]) => {
  const groups = new Map<string, { description: string; periods: string[]; amount: number }>();
  for (const it of items) {
    const g = groups.get(it.description) ?? { description: it.description, periods: [], amount: 0 };
    if (it.billingPeriod && !g.periods.includes(it.billingPeriod)) g.periods.push(it.billingPeriod);
    g.amount += it.amount;
    groups.set(it.description, g);
  }
  return [...groups.values()].map((g) => ({ description: g.description, billingPeriod: g.periods.length ? monthRange(g.periods) : undefined, amount: Math.round(g.amount * 100) / 100 }));
};

const FeeReceipt = ({ data }: { data: FeeReceiptData }) => {
  const school: ReceiptSchool = data.school ?? { name: "School" };
  const items =
    data.items && data.items.length > 0 ? groupItems(data.items) : [{ description: "Fee payment", billingPeriod: undefined, amount: data.amountPaid - (data.advanceAmount ?? 0) }];
  const advance = data.advanceAmount ?? 0;
  const stamp = STAMP[data.status ?? "SUCCESS"] ?? STAMP.SUCCESS;
  const affiliation = [
    school.boardName && school.affiliationNo ? `Affiliated to ${school.boardName} · Affiliation No. ${school.affiliationNo}` : school.boardName ? `Affiliated to ${school.boardName}` : null,
    school.schoolCode ? `School Code ${school.schoolCode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const contact = [school.phone ? `Ph: ${school.phone}` : null, school.email].filter(Boolean).join(" · ");

  return (
    <div className={styles.receiptCard} data-receipt>
      <div className={`${styles.stamp} ${styles[`stamp_${stamp.tone}`]}`} aria-hidden="true">
        {stamp.text}
      </div>

      {/* Letterhead */}
      <header className={styles.letterhead}>
        {school.logoUrl ? (
          <img src={school.logoUrl} alt="" className={styles.logo} />
        ) : (
          <span className={styles.crest} aria-hidden="true">
            {initials(school.name)}
          </span>
        )}
        <div className={styles.letterText}>
          <h1 className={styles.schoolName}>{school.name}</h1>
          {school.tagline && <div className={styles.tagline}>{school.tagline}</div>}
          {school.address && <div className={styles.letterLine}>{school.address}</div>}
          {contact && <div className={styles.letterLine}>{contact}</div>}
          {affiliation && <div className={styles.affiliation}>{affiliation}</div>}
        </div>
        <span className={styles.logoSpacer} aria-hidden="true" />
      </header>

      <div className={styles.titleBand}>
        <span>Fee Receipt</span>
        {data.sessionName && <span className={styles.session}>Session {data.sessionName}</span>}
      </div>

      {/* Receipt info */}
      <div className={styles.infoRow}>
        <div>
          <span className={styles.label}>Receipt No.</span>
          <strong>{data.receiptNo}</strong>
        </div>
        <div>
          <span className={styles.label}>Date</span>
          <strong>{data.paidAt}</strong>
        </div>
        <div>
          <span className={styles.label}>Payment mode</span>
          <strong>{data.mode}</strong>
        </div>
        {data.transactionRef && (
          <div className={styles.refCell}>
            <span className={styles.label}>Transaction ref.</span>
            <strong className={styles.mono}>{data.transactionRef}</strong>
          </div>
        )}
      </div>

      {/* Student */}
      <table className={styles.studentTable}>
        <tbody>
          <tr>
            <th>Student name</th>
            <td>{data.studentName}</td>
            <th>Admission No.</th>
            <td>{data.admissionNo}</td>
          </tr>
          <tr>
            <th>Class &amp; section</th>
            <td>{data.className || "—"}</td>
            <th>Roll No.</th>
            <td>{data.rollNo || "—"}</td>
          </tr>
          <tr>
            <th>Father's name</th>
            <td>{data.fatherName || "—"}</td>
            <th>Contact</th>
            <td>{data.contactNumber || "—"}</td>
          </tr>
        </tbody>
      </table>

      {/* Particulars */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.sno}>S.No</th>
            <th>Particulars</th>
            <th>Period</th>
            <th className={styles.amt}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className={styles.sno}>{idx + 1}</td>
              <td>{item.description}</td>
              <td>{item.billingPeriod ?? "—"}</td>
              <td className={styles.amt}>{money(item.amount)}</td>
            </tr>
          ))}
          {advance > 0 && (
            <tr>
              <td className={styles.sno}>{items.length + 1}</td>
              <td>Advance (credited to fee account)</td>
              <td>—</td>
              <td className={styles.amt}>{money(advance)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Total amount received</td>
            <td className={styles.amt}>₹ {money(data.amountPaid)}</td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.words}>
        <span className={styles.label}>Amount in words</span>
        <strong>{numberToWordsIndian(data.amountPaid)}</strong>
      </div>

      {/* Signatures */}
      <div className={styles.signRow}>
        <div className={styles.received}>
          <span className={styles.label}>Received by</span>
          <strong>{data.receivedBy || "Accounts office"}</strong>
        </div>
        <div className={styles.signBlock}>
          <div className={styles.signLine} />
          <span>Accountant / Authorised signatory</span>
        </div>
      </div>

      <footer className={styles.footer}>
        This is a computer-generated receipt and is valid without a physical signature. Please keep it for your records.
      </footer>
    </div>
  );
};

export default FeeReceipt;
