import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGetPublicAdmissionSettingsQuery, useSubmitApplicationMutation } from "../../store/api/admissions.api";
import { IMAGES } from "./content";
import { SiteIcon } from "./icons";
import { PageBanner, cx } from "./parts";
import { useRegistrationPayment } from "./useRegistrationPayment";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const EMPTY = {
  className: "",
  studentName: "",
  dob: "",
  gender: "",
  bloodGroup: "",
  category: "",
  aadharNumber: "",
  nationality: "Indian",
  previousSchool: "",
  previousClass: "",
  fatherName: "",
  fatherPhone: "",
  fatherOccupation: "",
  motherName: "",
  motherPhone: "",
  motherOccupation: "",
  email: "",
  address: "",
  message: "",
  website: "",
};
type Form = typeof EMPTY;
const MAX_FILES = 3;
const MAX_PDF_MB = 5;
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0, 10);
const errorText = (e: unknown) =>
  (e as { data?: { message?: string } } | undefined)?.data?.message ?? "Couldn't submit the application. Please check your connection and try again.";

// Online admission form (public). Open only while the office has admissions open.
const ApplyPage = () => {
  const { settings: site } = useSite();
  usePageTitle("Apply online", site.schoolName);
  const navigate = useNavigate();
  const { data: cfg, isLoading } = useGetPublicAdmissionSettingsQuery();
  const [submit, { isLoading: sending }] = useSubmitApplicationMutation();
  const { pay, paying, error: payError } = useRegistrationPayment(site.schoolName);

  const [form, setForm] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<Array<{ file: File; type: string }>>([]);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ applicationNo: string; feeAmount: number; feeStatus: string; onlinePayment: boolean; phone: string } | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fee = cfg?.classes.find((c) => c.name === form.className)?.fee ?? null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.type)) {
        setError(`"${f.name}" isn't a photo or PDF.`);
        continue;
      }
      if (f.type === "application/pdf" && f.size > MAX_PDF_MB * 1048576) {
        setError(`"${f.name}" is over ${MAX_PDF_MB} MB. Please scan at a lower quality.`);
        continue;
      }
      next.push({ file: f, type: "BIRTH_CERTIFICATE" });
    }
    setFiles(next);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.className) return setError("Choose the class you are applying for.");
    if (form.studentName.trim().length < 2) return setError("Enter the child's full name.");
    if (!form.dob) return setError("Enter the child's date of birth.");
    if (!form.gender) return setError("Choose the child's gender.");
    if (!form.fatherName.trim() && !form.motherName.trim()) return setError("Enter the father's or mother's name.");
    if (!form.fatherPhone.trim() && !form.motherPhone.trim()) return setError("Enter at least one parent's mobile number.");
    if (!form.address.trim()) return setError("Enter your address.");
    if (!agree) return setError("Please tick the box to confirm the details.");
    try {
      const res = await submit({ fields: form, files }).unwrap();
      setDone({ ...res, phone: form.fatherPhone.trim() || form.motherPhone.trim() });
      setForm(EMPTY);
      setFiles([]);
      setAgree(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorText(err));
    }
  };

  const payNow = async () => {
    if (!done) return;
    const status = await pay(done.applicationNo, done.phone);
    if (status) navigate(`/admissions/status?no=${encodeURIComponent(done.applicationNo)}&paid=1`, { state: { phone: done.phone } });
  };

  const field = (k: keyof Form, label: string, opts: { required?: boolean; type?: string; max?: number; full?: boolean; placeholder?: string; inputMode?: "numeric" | "tel" | "email" } = {}) => (
    <label className={cx(s.field, opts.full && s.fieldFull)}>
      <span className={s.fieldLabel}>
        {label} {opts.required && <span>*</span>}
      </span>
      <input
        className={s.input}
        type={opts.type ?? "text"}
        value={form[k]}
        onChange={set(k)}
        maxLength={opts.max ?? 80}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        max={opts.type === "date" ? today() : undefined}
        required={opts.required}
      />
    </label>
  );
  const select = (k: keyof Form, label: string, options: Array<[string, string]>, required = false) => (
    <label className={s.field}>
      <span className={s.fieldLabel}>
        {label} {required && <span>*</span>}
      </span>
      <select className={s.input} value={form[k]} onChange={set(k)} required={required}>
        <option value="">Select</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const heading = (t: string) => (
    <h4 className={s.fieldFull} style={{ margin: "10px 0 -4px", fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted, #5d6675)" }}>
      {t}
    </h4>
  );

  return (
    <>
      <PageBanner crumb="Apply online" title={`Apply online${cfg?.sessionName ? ` · ${cfg.sessionName}` : ""}`} text="Fill in the form below. Keep your application number to check the status and pay the registration fee." image={IMAGES.smartClassroom} />
      <section className={s.section}>
        <div className={s.container} style={{ maxWidth: 860 }}>
          {isLoading ? (
            <div className={s.formCard}>Loading…</div>
          ) : done ? (
            <div className={s.formCard}>
              <div className={s.formSuccess} role="status">
                <div className={s.successIcon}>
                  <SiteIcon name="check" size={32} strokeWidth={2.4} />
                </div>
                <h3 className={s.cardTitle} style={{ fontSize: "1.3rem" }}>
                  Application received
                </h3>
                <p className={s.cardText}>Your application number is</p>
                <p style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em", margin: "4px 0 10px" }}>{done.applicationNo}</p>
                <p className={s.cardText}>Please note it down. You'll need it, with your mobile number, to check the status.</p>
                {done.feeStatus === "UNPAID" && (
                  <div style={{ marginTop: 18 }}>
                    <p className={s.cardText}>
                      Registration fee: <strong>{rupees(done.feeAmount)}</strong>
                      {done.onlinePayment ? " — pay now online, or at the school office." : " — please pay at the school office."}
                    </p>
                    {done.onlinePayment && (
                      <button type="button" className={cx(s.btn, s.btnPrimary)} style={{ marginTop: 12 }} disabled={paying} onClick={payNow}>
                        {paying ? "Opening payment…" : `Pay ${rupees(done.feeAmount)} now`}
                      </button>
                    )}
                    {payError && (
                      <p role="alert" style={{ color: "#b42318", fontWeight: 600, marginTop: 10 }}>
                        {payError}
                      </p>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link to={`/admissions/status?no=${encodeURIComponent(done.applicationNo)}`} state={{ phone: done.phone }} className={cx(s.btn, s.btnOutline, s.btnSm)}>
                    Check status
                  </Link>
                  <button type="button" className={cx(s.btn, s.btnOutline, s.btnSm)} onClick={() => setDone(null)}>
                    Apply for another child
                  </button>
                </div>
              </div>
            </div>
          ) : !cfg?.isOpen ? (
            <div className={s.formCard}>
              <h3 className={s.cardTitle}>Online applications are closed right now</h3>
              <p className={s.cardText}>You can still send an enquiry and the school will call you back.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <Link to="/admissions#enquiry" className={cx(s.btn, s.btnPrimary, s.btnSm)}>
                  Send an enquiry
                </Link>
                <Link to="/admissions/status" className={cx(s.btn, s.btnOutline, s.btnSm)}>
                  Check an application
                </Link>
              </div>
            </div>
          ) : (
            <form className={s.formCard} onSubmit={onSubmit} noValidate>
              {cfg.instructions && (
                <div className={s.notice} style={{ marginBottom: 20, whiteSpace: "pre-line" }}>
                  {cfg.instructions}
                </div>
              )}
              {cfg.closesOn && (
                <p className={s.cardText} style={{ marginBottom: 14 }}>
                  Last date to apply: <strong>{new Date(cfg.closesOn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</strong>
                </p>
              )}
              <div className={s.formGrid}>
                {heading("Child")}
                <label className={s.field}>
                  <span className={s.fieldLabel}>
                    Class applying for <span>*</span>
                  </span>
                  <select className={s.input} value={form.className} onChange={set("className")} required>
                    <option value="">Select class</option>
                    {cfg.classes.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fee !== null && <span className={s.formNote} style={{ marginTop: 4 }}>{fee > 0 ? `Registration fee: ${rupees(fee)}` : "No registration fee"}</span>}
                </label>
                {field("studentName", "Child's full name", { required: true })}
                {field("dob", "Date of birth", { required: true, type: "date" })}
                {select("gender", "Gender", [["MALE", "Boy"], ["FEMALE", "Girl"], ["OTHER", "Other"]], true)}
                {select("bloodGroup", "Blood group", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => [b, b]))}
                {select("category", "Category", [["GENERAL", "General"], ["OBC", "OBC"], ["SC", "SC"], ["ST", "ST"], ["EWS", "EWS"]])}
                {field("aadharNumber", "Child's Aadhaar number", { max: 14, inputMode: "numeric", placeholder: "Optional" })}
                {field("nationality", "Nationality", { max: 40 })}
                {field("previousSchool", "Previous school", { max: 120, placeholder: "If any" })}
                {field("previousClass", "Class in previous school", { max: 40 })}

                {heading("Parents")}
                {field("fatherName", "Father's name")}
                {field("fatherPhone", "Father's mobile", { type: "tel", max: 15, inputMode: "tel" })}
                {field("fatherOccupation", "Father's occupation")}
                {field("motherName", "Mother's name")}
                {field("motherPhone", "Mother's mobile", { type: "tel", max: 15, inputMode: "tel" })}
                {field("motherOccupation", "Mother's occupation")}
                {field("email", "Email", { type: "email", max: 120, inputMode: "email", full: true })}
                <label className={cx(s.field, s.fieldFull)}>
                  <span className={s.fieldLabel}>
                    Address <span>*</span>
                  </span>
                  <textarea className={s.input} value={form.address} onChange={set("address")} maxLength={300} required style={{ minHeight: 70 }} />
                </label>

                {cfg.allowUploads && (
                  <>
                    {heading("Documents (optional)")}
                    <div className={s.fieldFull}>
                      <p className={s.formNote} style={{ marginTop: 0 }}>
                        Attach up to {MAX_FILES} photos or PDFs — birth certificate, Aadhaar, last report card. You can also bring them to the office.
                      </p>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
                          <select
                            className={s.input}
                            style={{ flex: "1 1 200px" }}
                            value={f.type}
                            aria-label={`What is ${f.file.name}?`}
                            onChange={(e) => setFiles((list) => list.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}
                          >
                            {cfg.fileTypes.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <span style={{ flex: "2 1 200px", overflowWrap: "anywhere", fontSize: "0.9rem" }}>{f.file.name}</span>
                          <button type="button" className={cx(s.btn, s.btnOutline, s.btnSm)} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>
                            Remove
                          </button>
                        </div>
                      ))}
                      {files.length < MAX_FILES && (
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} style={{ marginTop: 6 }} />
                      )}
                    </div>
                  </>
                )}

                <label className={cx(s.field, s.fieldFull)}>
                  <span className={s.fieldLabel}>Anything else we should know?</span>
                  <textarea className={s.input} value={form.message} onChange={set("message")} maxLength={1000} />
                </label>
                <label className={s.honeypot} aria-hidden="true">
                  Website
                  <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                </label>
                <label className={s.fieldFull} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.92rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
                  <span>
                    I am the child's parent or guardian. The details are correct, and the school may use them to process this admission (see the{" "}
                    <Link to="/privacy" target="_blank" rel="noreferrer">
                      privacy notice
                    </Link>
                    ).
                  </span>
                </label>
              </div>
              {error && (
                <p role="alert" style={{ color: "#b42318", fontWeight: 600, fontSize: "0.9rem", marginTop: 14 }}>
                  {error}
                </p>
              )}
              <button type="submit" className={cx(s.btn, s.btnPrimary)} style={{ marginTop: 20, width: "100%" }} disabled={sending}>
                {sending ? "Submitting…" : "Submit application"}
                {!sending && <SiteIcon name="arrowRight" size={18} />}
              </button>
              <p className={s.formNote}>
                Already applied? <Link to="/admissions/status">Check your application</Link>.
              </p>
            </form>
          )}
        </div>
      </section>
    </>
  );
};

export default ApplyPage;
