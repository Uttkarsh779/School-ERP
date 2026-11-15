import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from "../../../../../components/ui";
import ResolveRequestModal from "../../../../../components/shared/Privacy/ResolveRequestModal";
import {
  REQUEST_LABEL,
  useGetStudentPrivacyQuery,
  useRecordPaperConsentMutation,
  useWithdrawConsentMutation,
  type DataRequest,
} from "../../../../../store/api/privacy.api";

const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);

const STATUS = {
  GIVEN: { label: "Consent given", tone: "success" },
  OUTDATED: { label: "Agreed to an older notice", tone: "warning" },
  NONE: { label: "No consent yet", tone: "danger" },
} as const;

const RELATIONSHIPS = [
  { label: "Choose…", value: "" },
  { label: "Father", value: "Father" },
  { label: "Mother", value: "Mother" },
  { label: "Guardian", value: "Guardian" },
];

// Office view of one student's consent (DPDP Act) and the family's data requests.
const StudentPrivacyTab = ({ studentId }: { studentId: number }) => {
  const { data, isLoading } = useGetStudentPrivacyQuery(studentId);
  const [record, { isLoading: recording }] = useRecordPaperConsentMutation();
  const [withdraw, { isLoading: withdrawing }] = useWithdrawConsentMutation();
  const [paperOpen, setPaperOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [form, setForm] = useState({ givenBy: "", relationship: "", signedOn: today() });
  const [reason, setReason] = useState("");
  const [replying, setReplying] = useState<DataRequest | null>(null);

  if (isLoading || !data) return <Spinner />;
  const active = data.consents.find((c) => !c.withdrawnAt);

  const savePaper = async () => {
    try {
      await record({ studentId, ...form, givenBy: form.givenBy.trim() }).unwrap();
      toast.success("Paper consent recorded");
      setPaperOpen(false);
      setForm({ givenBy: "", relationship: "", signedOn: today() });
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't record the consent");
    }
  };
  const saveWithdraw = async () => {
    try {
      await withdraw({ studentId, reason: reason.trim() }).unwrap();
      toast.success("Consent marked as withdrawn");
      setWithdrawOpen(false);
      setReason("");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save");
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card title="Parent's consent" subtitle={`Privacy notice version ${data.noticeVersion}`} action={<Badge tone={STATUS[data.status].tone}>{STATUS[data.status].label}</Badge>}>
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {active ? (
            <p style={{ margin: 0 }}>
              <strong>{active.givenBy}</strong> ({active.relationship}) agreed on {date(active.givenAt)} —{" "}
              {active.method === "PAPER" ? `paper form, recorded by ${active.recordedBy?.name ?? "the office"}` : "online, on the student login"}.
            </p>
          ) : (
            <p style={{ margin: 0 }}>The family is asked to agree the next time the student login is used. If they signed consent on the admission form, record it here.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" onClick={() => setPaperOpen(true)}>
              Record paper consent
            </Button>
            {active && (
              <Button size="sm" variant="outline" onClick={() => setWithdrawOpen(true)}>
                Record withdrawal
              </Button>
            )}
          </div>
          {data.consents.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.86rem", color: "var(--erp-text-muted)", lineHeight: 1.6 }}>
              {data.consents.map((c) => (
                <li key={c.id}>
                  {date(c.givenAt)}: {c.givenBy} ({c.relationship}), {c.method === "PAPER" ? "paper" : "online"}, notice v{c.noticeVersion}
                  {c.withdrawnAt && ` — withdrawn ${date(c.withdrawnAt)} by ${c.withdrawnBy?.name ?? "the office"}: ${c.withdrawReason}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Data requests from the family">
        {data.requests.length === 0 ? (
          <EmptyState title="No requests" description="Requests the family sends from My Profile appear here." />
        ) : (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {data.requests.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--erp-border, #dfe3e8)", borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{REQUEST_LABEL[r.type]}</strong>
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
                    <strong>Reply</strong> ({r.resolvedBy?.name ?? "office"}, {date(r.resolvedAt)}): {r.response}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {paperOpen && (
        <Modal title="Record paper consent" onClose={() => setPaperOpen(false)}>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--erp-text-muted)" }}>
              Only record this from a form the parent or guardian has signed. Keep the signed form on file.
            </p>
            <Input label="Signed by (parent / guardian's name)" value={form.givenBy} onChange={(e) => setForm({ ...form, givenBy: e.target.value })} />
            <Select label="Relationship" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} options={RELATIONSHIPS} />
            <Input label="Date signed" type="date" max={today()} value={form.signedOn} onChange={(e) => setForm({ ...form, signedOn: e.target.value })} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setPaperOpen(false)}>
                Cancel
              </Button>
              <Button onClick={savePaper} isLoading={recording} disabled={form.givenBy.trim().length < 3 || !form.relationship || !form.signedOn}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {withdrawOpen && (
        <Modal title="Record withdrawal of consent" onClose={() => setWithdrawOpen(false)}>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--erp-text-muted)" }}>
              Record this when the parent has asked in writing. The student login will ask for consent again. Records the school must keep by law stay on file.
            </p>
            <Input label="Reason / reference" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Father's letter dated 12 Nov" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={saveWithdraw} isLoading={withdrawing} disabled={reason.trim().length < 3}>
                Record withdrawal
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {replying && <ResolveRequestModal request={replying} onClose={() => setReplying(null)} />}
    </div>
  );
};

export default StudentPrivacyTab;
