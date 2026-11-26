import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { printRegistrationReceipt } from "../../components/shared/Print/registrationReceipt";
import { useGetFamilyStatusMutation, type FamilyStatus } from "../../store/api/admissions.api";
import { IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { PageBanner, cx } from "./parts";
import { useRegistrationPayment } from "./useRegistrationPayment";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const errorText = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message ?? fallback;
const STEPS: Array<[FamilyStatus["stage"], string]> = [
  ["APPLIED", "Applied"],
  ["TEST", "Interaction / test"],
  ["SELECTED", "Selected"],
  ["ADMITTED", "Admitted"],
];

// Families: application status, registration fee payment and receipt.
const ApplicationStatusPage = () => {
  const { settings: site } = useSite();
  usePageTitle("Application status", site.schoolName);
  const [params] = useSearchParams();
  const location = useLocation() as { state?: { phone?: string } };
  const [no, setNo] = useState(params.get("no") ?? "");
  const [phone, setPhone] = useState(location.state?.phone ?? "");
  const [lookup, { isLoading }] = useGetFamilyStatusMutation();
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pay, paying, error: payError } = useRegistrationPayment(site.schoolName);
  const autoTried = useRef(false);

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!no.trim() || !phone.trim()) return setError("Enter the application number and mobile number.");
    try {
      setStatus(await lookup({ applicationNo: no.trim(), phone: phone.trim() }).unwrap());
    } catch (err) {
      setStatus(null);
      setError(errorText(err, "Couldn't check the status. Please try again."));
    }
  };

  // Coming straight from the form (number + phone known): show the status at once.
  useEffect(() => {
    if (!autoTried.current && no && phone) {
      autoTried.current = true;
      check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payNow = async () => {
    if (!status) return;
    const updated = await pay(status.applicationNo, phone.trim());
    if (updated) setStatus(updated);
  };

  const printReceipt = () =>
    status?.fee.receiptNo &&
    printRegistrationReceipt(
      {
        receiptNo: status.fee.receiptNo,
        paidAt: status.fee.paidAt ?? new Date().toISOString(),
        amount: status.fee.amount,
        mode: status.fee.mode,
        reference: status.fee.reference,
        applicationNo: status.applicationNo,
        studentName: status.studentName,
        className: status.className,
        sessionName: status.sessionName,
        receivedFrom: status.fee.contactName,
      },
      site
    );

  const stepIndex = status ? STEPS.findIndex(([k]) => k === status.stage) : -1;
  const closed = status && (status.stage === "REJECTED" || status.stage === "WITHDRAWN");

  return (
    <>
      <PageBanner crumb="Application status" title="Check your application" text="Enter your application number and the mobile number you gave on the form." image={IMAGES.smartClassroom} />
      <section className={s.section}>
        <div className={s.container} style={{ maxWidth: 720, display: "grid", gap: 20 }}>
          <form className={s.formCard} onSubmit={check} noValidate>
            <div className={s.formGrid}>
              <label className={s.field}>
                <span className={s.fieldLabel}>Application number</span>
                <input className={s.input} value={no} onChange={(e) => setNo(e.target.value)} placeholder="e.g. APP-2027-0012" autoCapitalize="characters" maxLength={30} />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Mobile number</span>
                <input className={s.input} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} />
              </label>
            </div>
            {error && (
              <p role="alert" style={{ color: "#b42318", fontWeight: 600, fontSize: "0.9rem", marginTop: 14 }}>
                {error}
              </p>
            )}
            <button type="submit" className={cx(s.btn, s.btnPrimary)} style={{ marginTop: 16, width: "100%" }} disabled={isLoading}>
              {isLoading ? "Checking…" : "Check status"}
            </button>
          </form>

          {status && (
            <div className={s.formCard} aria-live="polite">
              <p className={s.eyebrow} style={{ marginBottom: 4 }}>
                {status.applicationNo}
              </p>
              <h3 className={s.cardTitle} style={{ fontSize: "1.3rem" }}>
                {status.studentName} · {status.className}
                {status.sessionName ? ` (${status.sessionName})` : ""}
              </h3>
              <p className={s.cardText} style={{ fontWeight: 700, marginTop: 6 }}>
                {status.stageText}
              </p>

              {!closed && status.stage !== "ENQUIRY" && (
                <ol style={{ listStyle: "none", padding: 0, margin: "16px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {STEPS.map(([k, label], i) => (
                    <li
                      key={k}
                      style={{
                        textAlign: "center",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        padding: "8px 4px",
                        borderRadius: 6,
                        background: i <= stepIndex ? "#e7efe9" : "#f2f3f5",
                        color: i <= stepIndex ? "#1d6b3a" : "#6b7380",
                      }}
                      aria-current={i === stepIndex ? "step" : undefined}
                    >
                      {i < stepIndex || (i === stepIndex && k === "ADMITTED") ? "✓ " : ""}
                      {label}
                    </li>
                  ))}
                </ol>
              )}

              {status.stage === "TEST" && status.testAt && (
                <div className={s.notice} style={{ marginBottom: 14 }}>
                  <SiteIcon name="calendar" size={18} /> Interaction / test: <strong>{when(status.testAt)}</strong>
                  {status.testVenue ? ` · ${status.testVenue}` : ""}. Please come with your child and this application number.
                </div>
              )}

              {status.fee.amount > 0 && status.fee.status !== "NONE" && (
                <div style={{ borderTop: "1px solid #e3e6eb", paddingTop: 14, marginTop: 10 }}>
                  <p className={s.cardText}>
                    Registration fee {rupees(status.fee.amount)}:{" "}
                    <strong>{status.fee.status === "PAID" ? `paid — receipt ${status.fee.receiptNo}` : status.fee.status === "WAIVED" ? "waived by the school" : "not paid yet"}</strong>
                  </p>
                  {status.canPayOnline && (
                    <button type="button" className={cx(s.btn, s.btnPrimary)} style={{ marginTop: 12 }} disabled={paying} onClick={payNow}>
                      {paying ? "Opening payment…" : `Pay ${rupees(status.fee.amount)} online`}
                    </button>
                  )}
                  {status.fee.status === "UNPAID" && !status.canPayOnline && <p className={s.formNote}>Please pay at the school office.</p>}
                  {status.fee.status === "PAID" && (
                    <button type="button" className={cx(s.btn, s.btnOutline, s.btnSm)} style={{ marginTop: 12 }} onClick={printReceipt}>
                      <SiteIcon name="download" size={16} /> Print / save receipt
                    </button>
                  )}
                  {payError && (
                    <p role="alert" style={{ color: "#b42318", fontWeight: 600, marginTop: 10 }}>
                      {payError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <p className={s.formNote} style={{ textAlign: "center" }}>
            Haven't applied yet? <Link to="/admissions/apply">Apply online</Link> or <Link to="/admissions#enquiry">send an enquiry</Link>.
          </p>
        </div>
      </section>
    </>
  );
};

export default ApplicationStatusPage;
