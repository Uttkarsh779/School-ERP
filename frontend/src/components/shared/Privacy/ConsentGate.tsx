import { useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { Button, Input, Select, Spinner } from "../../ui";
import { resetTokens } from "../../../store/reducers/authReducer";
import { useGetMyConsentStatusQuery, useGiveConsentMutation } from "../../../store/api/privacy.api";
import NoticeText from "./NoticeText";

// Student logins (which parents use) see the privacy notice once and a parent or guardian
// agrees to it before the portal opens. Asked again when the school changes the notice and
// chooses to ask families again. If the check itself fails, the portal still opens: a
// network hiccup must never lock a family out.
const ConsentGate = ({ children }: { children: ReactNode }) => {
  const { data, isLoading } = useGetMyConsentStatusQuery();
  const [give, { isLoading: saving }] = useGiveConsentMutation();
  const dispatch = useDispatch();
  const [givenBy, setGivenBy] = useState("");
  const [relationship, setRelationship] = useState("");
  const [agree, setAgree] = useState(false);
  const [declined, setDeclined] = useState(false);

  if (isLoading) return <Spinner />;
  if (!data?.needsConsent) return <>{children}</>;

  const n = data.notice;
  const submit = async () => {
    try {
      await give({ givenBy: givenBy.trim(), relationship, agree }).unwrap();
      toast.success("Thank you. Your consent has been recorded.");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save. Please try again.");
    }
  };
  const ready = givenBy.trim().length >= 3 && !!relationship && agree;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--erp-bg, #f4f6f9)", padding: "16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: "var(--erp-surface, #fff)", borderRadius: 12, padding: "clamp(16px, 4vw, 32px)", boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
        {declined ? (
          <>
            <h1 style={{ marginTop: 0, fontSize: "1.35rem" }}>We need a parent's consent to continue</h1>
            <p style={{ lineHeight: 1.6 }}>
              The portal can't be used without a parent's or guardian's consent. Please contact the school office if you have questions about how
              {` ${n.schoolName}`} uses your child's data{n.grievanceEmail ? `, or write to ${n.grievanceEmail}` : ""}.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="outline" onClick={() => setDeclined(false)}>Go back</Button>
              <Button onClick={() => dispatch(resetTokens())}>Sign out</Button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 0, fontSize: "1.35rem" }}>
              {data.consent ? "Our privacy notice has changed" : "Before you continue"}
            </h1>
            <p style={{ lineHeight: 1.6, marginTop: 0 }}>
              {data.studentName} is under 18, so a <strong>parent or guardian</strong> needs to read how {n.schoolName} uses your child's personal data, and agree to it.
            </p>
            <div style={{ maxHeight: "45vh", overflow: "auto", border: "1px solid var(--erp-border, #dfe3e8)", borderRadius: 8, padding: "12px 16px", margin: "12px 0 16px" }}>
              <NoticeText text={n.noticeText} />
              {(n.grievanceName || n.grievanceEmail || n.grievancePhone) && (
                <p style={{ margin: "0.5rem 0 0" }}>
                  <strong>Grievance officer:</strong> {[n.grievanceName, n.grievanceEmail, n.grievancePhone].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Input label="Parent / guardian's full name" value={givenBy} onChange={(e) => setGivenBy(e.target.value)} autoComplete="name" />
              <Select
                label="Relationship to the student"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                options={[{ label: "Choose…", value: "" }, { label: "Father", value: "Father" }, { label: "Mother", value: "Mother" }, { label: "Guardian", value: "Guardian" }]}
              />
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "16px 0", lineHeight: 1.5, cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18, flex: "none" }} />
              <span>
                I am {data.studentName}'s parent or legal guardian. I have read the privacy notice and I agree to the school using my child's
                personal data as it describes.
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setDeclined(true)}>I don't agree</Button>
              <Button onClick={submit} isLoading={saving} disabled={!ready}>Agree and continue</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ConsentGate;
