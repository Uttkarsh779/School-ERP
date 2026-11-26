import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "../../../../components/ui";
import NoticeText from "../../../../components/shared/Privacy/NoticeText";
import ResolveRequestModal from "../../../../components/shared/Privacy/ResolveRequestModal";
import {
  REQUEST_LABEL,
  useGetConsentSummaryQuery,
  useGetDataRequestsQuery,
  useGetPrivacySettingsQuery,
  useUpdatePrivacySettingsMutation,
  type DataRequest,
} from "../../../../store/api/privacy.api";

const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

// Settings -> Privacy (DPDP Act): who has consented, parents' requests, and the notice.
const PrivacyPanel = ({ canEditNotice }: { canEditNotice: boolean }) => {
  const { data: summary, isLoading } = useGetConsentSummaryQuery();
  const [filter, setFilter] = useState("OPEN");
  const { data: requests = [] } = useGetDataRequestsQuery(filter);
  const { data: settings } = useGetPrivacySettingsQuery();
  const [save, { isLoading: saving }] = useUpdatePrivacySettingsMutation();
  const [replying, setReplying] = useState<DataRequest | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState({ noticeText: "", grievanceName: "", grievanceEmail: "", grievancePhone: "" });
  const [askAgain, setAskAgain] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (settings)
      setForm({
        noticeText: settings.noticeText,
        grievanceName: settings.grievanceName ?? "",
        grievanceEmail: settings.grievanceEmail ?? "",
        grievancePhone: settings.grievancePhone ?? "",
      });
  }, [settings]);

  if (isLoading || !summary) return <Spinner />;
  const pct = summary.activeStudents ? Math.round((summary.withConsent / summary.activeStudents) * 100) : 0;
  const dirty =
    !!settings &&
    (form.noticeText !== settings.noticeText ||
      form.grievanceName !== (settings.grievanceName ?? "") ||
      form.grievanceEmail !== (settings.grievanceEmail ?? "") ||
      form.grievancePhone !== (settings.grievancePhone ?? ""));

  const setConsentOn = async (on: boolean) => {
    if (!settings) return;
    setSwitching(true);
    try {
      await save({ ...form, noticeText: settings.noticeText, consentEnabled: on }).unwrap();
      toast.success(on ? "Student logins will now ask a parent to agree to the notice." : "Consent requests switched off.");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't change the setting");
    } finally {
      setSwitching(false);
    }
  };

  const onSave = async () => {
    try {
      const r = await save({ ...form, askAgain }).unwrap();
      toast.success(r.message ?? "Saved");
      setAskAgain(false);
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the notice");
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card
        title="Parents' consent"
        subtitle={`Privacy notice version ${summary.noticeVersion}`}
        action={<Badge tone={summary.consentEnabled ? "success" : "neutral"}>{summary.consentEnabled ? "Asking parents" : "Not asking yet"}</Badge>}
      >
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {!summary.consentEnabled && (
            <div style={{ background: "var(--erp-bg, #f4f6f9)", borderRadius: 8, padding: "0.75rem 0.9rem", fontSize: "0.9rem", lineHeight: 1.55 }}>
              <strong>Student logins don't ask for consent yet.</strong> First review the privacy notice below (it's a starting draft) and fill in the grievance
              officer. Then switch this on: the next time a student login is used, a parent will be asked to read the notice and agree.
              {canEditNotice ? (
                <div style={{ marginTop: "0.6rem" }}>
                  <Button size="sm" onClick={() => setConsentOn(true)} isLoading={switching}>
                    Start asking parents
                  </Button>
                </div>
              ) : (
                <div style={{ marginTop: "0.4rem", color: "var(--erp-text-muted)" }}>Only the Super Admin can switch this on.</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: "1.6rem" }}>{pct}%</strong>
            <span>
              {summary.withConsent} of {summary.activeStudents} current students have a parent's consent.
            </span>
          </div>
          <div style={{ height: 8, background: "var(--erp-border, #e5e8ec)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--erp-success, #1e7f4c)" }} />
          </div>
          {summary.consentEnabled && canEditNotice && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setConsentOn(false)} isLoading={switching}>
                Stop asking parents
              </Button>
            </div>
          )}
          <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--erp-text-muted)" }}>
            {summary.consentEnabled ? "Parents are asked automatically the next time the student login is used." : "Paper consent can be recorded at any time."} For parents who don't use the portal, record their signed paper form on the
            student's Privacy tab.
          </p>
          {summary.missing.length > 0 && (
            <div>
              <Button size="sm" variant="outline" onClick={() => setShowMissing((v) => !v)}>
                {showMissing ? "Hide" : "Show"} the {summary.missing.length} without consent
              </Button>
              {showMissing && (
                <ul style={{ margin: "0.6rem 0 0", paddingLeft: "1.1rem", columns: "16rem", fontSize: "0.88rem", lineHeight: 1.7 }}>
                  {summary.missing.map((m) => (
                    <li key={m.id}>
                      <Link to={`/admin/students/${m.id}`}>{m.name}</Link> · {m.className}
                      {m.outdated && " (older notice)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Requests from parents"
        subtitle={summary.openRequests ? `${summary.openRequests} waiting for a reply` : "Nothing waiting"}
        action={
          <Select
            aria-label="Show"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={[
              { label: "Waiting", value: "OPEN" },
              { label: "All", value: "ALL" },
            ]}
          />
        }
      >
        {requests.length === 0 ? (
          <EmptyState title={filter === "OPEN" ? "No requests waiting" : "No requests yet"} description="Parents send these from My Profile on the student login." />
        ) : (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {requests.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--erp-border, #dfe3e8)", borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
                  <span>
                    <strong>{REQUEST_LABEL[r.type]}</strong>
                    {r.student && (
                      <>
                        {" · "}
                        <Link to={`/admin/students/${r.student.id}`}>{r.student.name}</Link> ({r.student.classSection.className} - {r.student.classSection.section})
                      </>
                    )}
                  </span>
                  {r.status === "OPEN" ? (
                    <Button size="sm" onClick={() => setReplying(r)}>
                      Reply
                    </Button>
                  ) : (
                    <Badge tone={r.status === "RESOLVED" ? "success" : "neutral"}>{r.status === "RESOLVED" ? "Done" : "Declined"}</Badge>
                  )}
                </div>
                <div style={{ color: "var(--erp-text-muted)", margin: "0.2rem 0" }}>
                  {date(r.createdAt)} · {r.details}
                </div>
                {r.response && (
                  <div>
                    <strong>Reply</strong> ({r.resolvedBy?.name ?? "office"}): {r.response}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Privacy notice"
        subtitle={canEditNotice ? "What parents read and agree to. Shown at /privacy on the website." : "Only the Super Admin can change the notice."}
        action={
          <Button size="sm" variant="ghost" onClick={() => setPreview((v) => !v)}>
            {preview ? "Edit" : "Preview"}
          </Button>
        }
      >
        {preview || !canEditNotice ? (
          <NoticeText text={form.noticeText.split("{school}").join("the school")} />
        ) : (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
              Plain text. A blank line starts a new section; a short first line is its heading; lines starting with "- " are bullet points. {"{school}"} is replaced
              with the school's name. This is a starting draft: have it checked against your actual practices before relying on it.
            </p>
            <textarea
              value={form.noticeText}
              onChange={(e) => setForm({ ...form, noticeText: e.target.value })}
              rows={18}
              style={{ font: "inherit", fontSize: "0.9rem", padding: "0.6rem 0.75rem", borderRadius: 8, border: "1px solid var(--erp-border, #cfd5dd)", resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.8rem" }}>
              <Input label="Grievance officer" value={form.grievanceName} onChange={(e) => setForm({ ...form, grievanceName: e.target.value })} placeholder="e.g. Principal" />
              <Input label="Grievance email" type="email" value={form.grievanceEmail} onChange={(e) => setForm({ ...form, grievanceEmail: e.target.value })} />
              <Input label="Grievance phone" type="tel" value={form.grievancePhone} onChange={(e) => setForm({ ...form, grievancePhone: e.target.value })} />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem", cursor: "pointer" }}>
              <input type="checkbox" checked={askAgain} onChange={(e) => setAskAgain(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <strong>This is an important change — ask every parent to agree again.</strong> Leave unticked for small fixes such as spelling or contact details.
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ alignSelf: "center", fontSize: "0.9rem" }}>
                Open the website page
              </a>
              <Button onClick={onSave} isLoading={saving} disabled={!dirty && !askAgain}>
                Save notice
              </Button>
            </div>
          </div>
        )}
      </Card>

      {replying && <ResolveRequestModal request={replying} onClose={() => setReplying(null)} />}
    </div>
  );
};

export default PrivacyPanel;
