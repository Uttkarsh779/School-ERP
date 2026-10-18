import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, Input, Select, Spinner } from "../../../../../components/ui";
import { useGetSessionsQuery } from "../../../../../store/api/sessions.api";
import {
  useCreateFeeHeadMutation,
  useCreateLateFeeRuleMutation,
  useDeleteFeeHeadMutation,
  useGetFeeHeadsQuery,
  useGetLateFeeRulesQuery,
  useUpdateFeeHeadMutation,
} from "../../../../../store/api/fees.api";
import { fmtDate, getErrorMessage, inr } from "../feeUtils";
import styles from "../Fees.module.css";

type Slab = { uptoDays: string; amount: string };

const describeRule = (r: { feeType: string; amount: unknown; gracePeriodDays: number; slabsJson: string | null }) => {
  if (r.feeType === "FIXED") return `${inr(Number(r.amount))} once, after ${r.gracePeriodDays} grace day(s)`;
  if (r.feeType === "DAILY") return `${inr(Number(r.amount))} per day after ${r.gracePeriodDays} grace day(s)`;
  try {
    const slabs = JSON.parse(r.slabsJson ?? "[]") as Array<{ uptoDays: number | null; amount: number }>;
    return (
      `After ${r.gracePeriodDays} grace day(s): ` +
      slabs.map((s) => (s.uptoDays === null ? `beyond → ${inr(s.amount)}` : `up to ${s.uptoDays} days → ${inr(s.amount)}`)).join(", ")
    );
  } catch {
    return "Slab rule";
  }
};

// Fee heads (what can be charged) and the late-fee rule per session — the rule used by
// every dues screen and payment (see backend lateFeeService).
const FeeSettingsTab = ({ isSuperAdmin }: { isSuperAdmin: boolean }) => {
  const { data: heads = [], isLoading: headsLoading } = useGetFeeHeadsQuery();
  const [createHead, { isLoading: creatingHead }] = useCreateFeeHeadMutation();
  const [updateHead, { isLoading: updatingHead }] = useUpdateFeeHeadMutation();
  const [deleteHead, { isLoading: deletingHead }] = useDeleteFeeHeadMutation();
  const [headForm, setHeadForm] = useState({ id: 0, name: "", code: "", description: "" });
  const [pendingDelete, setPendingDelete] = useState<IFeeHead | null>(null);

  const { data: sessions } = useGetSessionsQuery();
  const [sessionId, setSessionId] = useState("");
  const session = useMemo(
    () => sessions?.find((s) => s.id === Number(sessionId)) ?? sessions?.find((s) => s.isCurrent) ?? sessions?.[0],
    [sessions, sessionId]
  );
  const { data: rules = [], isFetching: rulesLoading } = useGetLateFeeRulesQuery(session?.id ?? 0, { skip: !session });
  const [createRule, { isLoading: savingRule }] = useCreateLateFeeRuleMutation();
  const [rule, setRule] = useState({ feeType: "FIXED", amount: "", grace: "10" });
  const [slabs, setSlabs] = useState<Slab[]>([
    { uptoDays: "10", amount: "" },
    { uptoDays: "", amount: "" },
  ]);

  const saveHead = async () => {
    if (!headForm.name.trim() || !headForm.code.trim()) return toast.error("Name and code are required");
    const body = { name: headForm.name.trim(), code: headForm.code.trim().toUpperCase(), description: headForm.description.trim() || undefined };
    try {
      if (headForm.id) await updateHead({ id: headForm.id, body }).unwrap();
      else await createHead(body).unwrap();
      toast.success(headForm.id ? "Fee head updated" : "Fee head added");
      setHeadForm({ id: 0, name: "", code: "", description: "" });
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the fee head"));
    }
  };

  const saveRule = async () => {
    if (!session) return;
    const grace = Number(rule.grace);
    if (!Number.isInteger(grace) || grace < 0) return toast.error("Grace days must be 0 or more");
    try {
      if (rule.feeType === "SLAB") {
        const parsed = slabs
          .filter((s) => s.amount !== "")
          .map((s) => ({ uptoDays: s.uptoDays === "" ? null : Number(s.uptoDays), amount: Number(s.amount) }));
        if (parsed.length === 0) return toast.error("Add at least one slab with an amount");
        await createRule({ sessionId: session.id, gracePeriodDays: grace, feeType: "SLAB", amount: 0, slabsJson: parsed }).unwrap();
      } else {
        const amount = Number(rule.amount);
        if (!(amount >= 0) || rule.amount === "") return toast.error("Enter the late fee amount");
        await createRule({ sessionId: session.id, gracePeriodDays: grace, feeType: rule.feeType, amount }).unwrap();
      }
      toast.success("Late-fee rule saved — it applies to all overdue fees in this session");
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the rule"));
    }
  };

  const activeRule = rules[0];

  return (
    <div className={styles.twoCol}>
      <Card title="Late-fee rule" subtitle="Applied automatically to every overdue fee; shown on all dues screens and receipts">
        <div className={styles.formStack}>
          <Select
            label="Session"
            value={session ? String(session.id) : ""}
            onChange={(e) => setSessionId(e.target.value)}
            options={(sessions ?? []).map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }))}
          />
          {rulesLoading ? (
            <Spinner />
          ) : activeRule ? (
            <div className={styles.notice}>
              <strong>Current rule:</strong> {describeRule(activeRule)} <span className={styles.muted}>· set {fmtDate(activeRule.createdAt)}</span>
            </div>
          ) : (
            <div className={`${styles.notice} ${styles.noticeWarn}`}>No late-fee rule for this session — no late fees are charged.</div>
          )}

          <div className={styles.filters} style={{ marginBottom: 0 }}>
            <Select
              label="Type"
              value={rule.feeType}
              onChange={(e) => setRule({ ...rule, feeType: e.target.value })}
              options={[
                { label: "Fixed (charged once)", value: "FIXED" },
                { label: "Per day", value: "DAILY" },
                { label: "Slabs by days late", value: "SLAB" },
              ]}
            />
            <Input label="Grace days" inputMode="numeric" value={rule.grace} onChange={(e) => setRule({ ...rule, grace: e.target.value })} hint="Days after the due date with no late fee" />
            {rule.feeType !== "SLAB" && (
              <Input
                label={rule.feeType === "DAILY" ? "Amount per day (₹)" : "Amount (₹)"}
                inputMode="decimal"
                value={rule.amount}
                onChange={(e) => setRule({ ...rule, amount: e.target.value })}
              />
            )}
          </div>

          {rule.feeType === "SLAB" && (
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Up to days late</th>
                  <th>Late fee (₹)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slabs.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className={styles.cellInput}
                        inputMode="numeric"
                        placeholder="Leave empty = no limit"
                        value={s.uptoDays}
                        onChange={(e) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, uptoDays: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.cellInput}
                        inputMode="decimal"
                        value={s.amount}
                        onChange={(e) => setSlabs(slabs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rule.feeType === "SLAB" && (
            <Button size="sm" variant="outline" onClick={() => setSlabs([...slabs, { uptoDays: "", amount: "" }])}>+ Add slab</Button>
          )}
          <div className={styles.formActions} style={{ marginTop: 0 }}>
            <Button onClick={saveRule} isLoading={savingRule} disabled={!session}>Save rule</Button>
          </div>
          <p className={styles.muted}>Saving creates a new rule for the session; the latest rule is the one in effect.</p>
        </div>
      </Card>

      <Card title="Fee heads" subtitle="Types of fee that can be charged (Tuition, Annual, Exam…)">
        <div className={styles.formStack}>
          {headsLoading ? (
            <Spinner />
          ) : heads.length === 0 ? (
            <p className={styles.muted}>No fee heads yet.</p>
          ) : (
            <ul className={styles.list}>
              {heads.map((h) => (
                <li key={h.id} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>
                      {h.name} <Badge tone="neutral">{h.code}</Badge>
                    </div>
                    {h.description && <div className={styles.muted}>{h.description}</div>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setHeadForm({ id: h.id, name: h.name, code: h.code, description: h.description ?? "" })}>
                    Edit
                  </Button>
                  {isSuperAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => setPendingDelete(h)}>
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.filters} style={{ marginBottom: 0 }}>
            <Input label="Name" value={headForm.name} onChange={(e) => setHeadForm({ ...headForm, name: e.target.value })} placeholder="e.g. Tuition Fee" />
            <Input label="Code" value={headForm.code} onChange={(e) => setHeadForm({ ...headForm, code: e.target.value })} placeholder="e.g. TUITION" />
            <div className={styles.wide}>
              <Input label="Description" value={headForm.description} onChange={(e) => setHeadForm({ ...headForm, description: e.target.value })} />
            </div>
          </div>
          <div className={styles.formActions} style={{ marginTop: 0 }}>
            {headForm.id !== 0 && (
              <Button variant="ghost" onClick={() => setHeadForm({ id: 0, name: "", code: "", description: "" })}>Cancel edit</Button>
            )}
            <Button onClick={saveHead} isLoading={creatingHead || updatingHead}>{headForm.id ? "Save changes" : "Add fee head"}</Button>
          </div>
          <p className={styles.muted}>Renaming a fee head keeps all past bills and receipts linked to it.</p>
        </div>
      </Card>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete fee head?"
          message={`"${pendingDelete.name}" can only be deleted if it has never been charged. Otherwise, rename it instead.`}
          confirmLabel="Delete"
          isLoading={deletingHead}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await deleteHead(pendingDelete.id).unwrap();
              toast.success("Fee head deleted");
            } catch (e) {
              toast.error(getErrorMessage(e, "This fee head is in use — rename it instead"));
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default FeeSettingsTab;
