import logo from "../../../assets/images/logo.png";
import styles from "./FeeReceipt.module.css";

export interface FeeReceiptItem {
  description: string;
  amount: number;
  billingPeriod?: string;
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
  schoolName?: string;
}

export function numberToWordsIndian(num: number): string {
  if (!num || num <= 0) return "Rupees Zero Only";

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
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

  const intPart = Math.floor(num);
  return `Rupees ${inWords(intPart)} Only`;
}

interface FeeReceiptProps {
  data: FeeReceiptData;
}

const FeeReceipt = ({ data }: FeeReceiptProps) => {
  const schoolName = data.schoolName || "RRS INTERNATIONAL SCHOOL";
  const items = data.items && data.items.length > 0
    ? data.items
    : [{ description: "School Monthly Fee Payment", amount: data.amountPaid }];

  return (
    <div className={styles.receiptCard}>
      {/* Official School Header */}
      <div className={styles.schoolHeader}>
        <div className={styles.schoolBrand}>
          <img src={logo} alt={schoolName} className={styles.schoolLogo} />
          <div>
            <h1 className={styles.schoolName}>{schoolName}</h1>
            <div className={styles.schoolSub}>
              Affiliated to CBSE · 123 Knowledge Park, Education Lane · Phone: +91 98765 43210
            </div>
          </div>
        </div>
        <div className={styles.titleBadgeBlock}>
          <div className={styles.receiptTitle}>Fee Receipt</div>
          <div className={styles.paidBadge}>✓ PAID &amp; VERIFIED</div>
        </div>
      </div>

      {/* 2-Column Meta Grid */}
      <div className={styles.metaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Receipt No:</span>
          <span className={styles.metaValue}>{data.receiptNo}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Date:</span>
          <span className={styles.metaValue}>{data.paidAt}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Student Name:</span>
          <span className={styles.metaValue}>{data.studentName}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Admission No:</span>
          <span className={styles.metaValue}>{data.admissionNo}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Class &amp; Section:</span>
          <span className={styles.metaValue}>{data.className || "N/A"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Roll No:</span>
          <span className={styles.metaValue}>{data.rollNo || "N/A"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Father's Name:</span>
          <span className={styles.metaValue}>{data.fatherName || "N/A"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Payment Mode:</span>
          <span className={styles.metaValue}>{data.mode}{data.transactionRef ? ` (${data.transactionRef})` : ""}</span>
        </div>
      </div>

      {/* Itemized Particulars Table */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: "40px" }}>S.No</th>
            <th>Particulars / Fee Description</th>
            <th style={{ textAlign: "right" }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>{item.description}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>
                ₹{item.amount.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total Amount Box */}
      <div className={styles.amountBox}>
        <span className={styles.amountLabel}>Total Amount Received</span>
        <span className={styles.amountValue}>₹{data.amountPaid.toLocaleString("en-IN")}</span>
      </div>

      {/* Amount in Words */}
      <div className={styles.wordsBox}>
        <strong>Amount in Words:</strong> {numberToWordsIndian(data.amountPaid)}
      </div>

      {/* Signatures & Stamps Section */}
      <div className={styles.signatureSection}>
        <div className={styles.sigBlock}>
          <div className={styles.sigLine} />
          <div className={styles.sigTitle}>Accounts Counter Stamp</div>
        </div>
        <div className={styles.sigBlock}>
          <div className={styles.sigLine} />
          <div className={styles.sigTitle}>Authorized Signatory</div>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className={styles.receiptFooter}>
        * Computer-generated official fee receipt. Retain this receipt for your records.
      </div>
    </div>
  );
};

export default FeeReceipt;
