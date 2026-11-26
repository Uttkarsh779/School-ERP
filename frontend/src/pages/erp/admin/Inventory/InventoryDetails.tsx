import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, EmptyState, Icon, Input, Modal, Select, Spinner } from "../../../../components/ui";
import {
  CLOSE_REASONS,
  ISSUE_STATUS,
  KIND_LABEL,
  useCloseIssueLineMutation,
  useGetInventoryDocQuery,
  useGetItemLedgerQuery,
  useReceiveBackMutation,
  useVoidInventoryDocMutation,
  type DocLine,
  type InventoryDoc,
} from "../../../../store/api/inventory.api";
import { useGetPublicWebsiteDataQuery } from "../../../../store/api/cms.api";
import { fmtDate, getErrorMessage, inr } from "../Fees/feeUtils";
import { qty, today } from "./InventoryForms";
import { printInventoryDoc } from "./inventoryPrint";
import styles from "./Inventory.module.css";

// ---------------------------------------------------------------------------
// One document (any kind). Issue slips also show what's still out, with Receive back.
// ---------------------------------------------------------------------------

export const DocModal = ({ id, canEdit, onClose, onOpenDoc }: { id: number; canEdit: boolean; onClose: () => void; onOpenDoc: (id: number) => void }) => {
  const { data: d, isLoading, isError } = useGetInventoryDocQuery(id);
  const { data: site } = useGetPublicWebsiteDataQuery();
  const [returning, setReturning] = useState(false);
  const [closing, setClosing] = useState<DocLine | null>(null);
  const [voiding, setVoiding] = useState(false);

  const outLines = (d?.lines ?? []).filter((l) => l.toReturn && (l.balance?.out ?? 0) > 0);
  const isIssue = d?.kind === "ISSUE";

  return (
    <Modal title={d ? `${KIND_LABEL[d.kind]} ${d.docNo}` : "Document"} size="xl" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !d ? (
        <EmptyState title="Couldn't load the document" />
      ) : (
        <div>
          <div className={styles.actionBar}>
            {isIssue && d.status && <Badge tone={ISSUE_STATUS[d.status].tone}>{ISSUE_STATUS[d.status].label}</Badge>}
            {d.isVoid && <Badge tone="danger">Void</Badge>}
            {isIssue && canEdit && !d.isVoid && outLines.length > 0 && (
              <Button size="sm" icon={<Icon name="arrowLeft" size={15} />} onClick={() => setReturning(true)}>
                Receive back
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} onClick={() => printInventoryDoc(d, site?.settings)}>
              Print
            </Button>
            {canEdit && !d.isVoid && d.kind !== "OPENING" && (
              <Button size="sm" variant="ghost" onClick={() => setVoiding(true)}>
                Void
              </Button>
            )}
          </div>
          {d.isVoid && <p className={styles.danger}>Voided: {d.voidReason}</p>}

          <dl className={styles.detailGrid}>
            {(
              [
                ["Date", fmtDate(d.docDate)],
                ["Supplier", d.supplier],
                ["Bill no.", d.billNo],
                ["Issued to", d.issuedTo ? `${d.issuedTo}${d.staffCode ? ` (${d.staffCode})` : ""}` : null],
                ["Purpose", d.purpose],
                ["Return by", d.expectedReturnOn ? fmtDate(d.expectedReturnOn) : null],
                ["Against issue", d.issueNo],
                ["Reason", d.reasonLabel],
                ["Note", d.note],
                ["Entered by", d.createdBy],
              ] as Array<[string, string | null]>
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>
                    {k === "Against issue" && d.issueId ? (
                      <button type="button" className={styles.link} onClick={() => onOpenDoc(d.issueId!)}>
                        {v}
                      </button>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
          </dl>

          <div className={styles.tableWrap} style={{ marginTop: "1rem" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.num}>Qty</th>
                  {(d.kind === "RECEIPT" || d.kind === "OPENING") && (
                    <>
                      <th className={styles.num}>Rate</th>
                      <th className={styles.num}>Amount</th>
                    </>
                  )}
                  {isIssue && (
                    <>
                      <th>Type</th>
                      <th className={styles.num}>Returned</th>
                      <th className={styles.num}>Closed</th>
                      <th className={styles.num}>Still out</th>
                      <th />
                    </>
                  )}
                  {(d.kind === "RETURN" || d.kind === "ADJUST") && <th>Stock effect</th>}
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={styles.strong}>{l.item}</td>
                    <td className={styles.num}>{qty(l.quantity, l.unit)}</td>
                    {(d.kind === "RECEIPT" || d.kind === "OPENING") && (
                      <>
                        <td className={styles.num}>{l.rate === null ? "—" : inr(l.rate)}</td>
                        <td className={styles.num}>{l.amount === null ? "—" : inr(l.amount)}</td>
                      </>
                    )}
                    {isIssue && (
                      <>
                        <td>{l.toReturn ? <Badge tone="warning">To be returned</Badge> : <span className={styles.muted}>Consumed</span>}</td>
                        <td className={styles.num}>{l.balance ? `${qty(l.balance.returnedGood)}${l.balance.returnedDamaged ? ` + ${qty(l.balance.returnedDamaged)} damaged` : ""}` : "—"}</td>
                        <td className={styles.num}>{l.balance?.closed ? qty(l.balance.closed) : "—"}</td>
                        <td className={styles.num}>{l.balance ? <strong className={l.balance.out > 0 ? styles.danger : styles.success}>{qty(l.balance.out)}</strong> : "—"}</td>
                        <td>
                          {canEdit && !d.isVoid && l.balance && l.balance.out > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => setClosing(l)}>
                              Won't come back
                            </Button>
                          )}
                        </td>
                      </>
                    )}
                    {(d.kind === "RETURN" || d.kind === "ADJUST") && (
                      <td>{l.change > 0 ? <span className={styles.success}>+{qty(l.change)} in</span> : l.change < 0 ? <span className={styles.danger}>−{qty(-l.change)} out</span> : <span className={styles.muted}>{l.condition === "DAMAGED" ? "Damaged — not back in stock" : "No change (already issued)"}</span>}</td>
                    )}
                    <td className={styles.muted}>{l.remark ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isIssue && (d.settlements?.length ?? 0) > 0 && (
            <section style={{ marginTop: "1rem" }}>
              <h4 className={styles.sectionTitle}>Returns and closings on this slip</h4>
              <ul className={styles.list}>
                {d.settlements!.map((s) => (
                  <li key={s.id} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <button type="button" className={styles.link} onClick={() => onOpenDoc(s.id)}>
                        {s.docNo}
                      </button>{" "}
                      <span className={styles.muted}>
                        · {fmtDate(s.docDate)} · {s.kind === "RETURN" ? "Received back" : s.reasonLabel} · {s.lines.map((l) => `${qty(l.quantity, l.unit)} ${l.item}${l.condition === "DAMAGED" ? " (damaged)" : ""}`).join(", ")}
                        {s.isVoid ? " · void" : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {d && returning && <ReceiveBackModal issue={d} onClose={() => setReturning(false)} />}
      {d && closing && <CloseLineModal issue={d} line={closing} onClose={() => setClosing(null)} />}
      {d && voiding && <VoidModal doc={d} onClose={() => setVoiding(false)} />}
    </Modal>
  );
};

const ReceiveBackModal = ({ issue, onClose }: { issue: InventoryDoc; onClose: () => void }) => {
  const out = issue.lines.filter((l) => l.toReturn && (l.balance?.out ?? 0) > 0);
  const [rows, setRows] = useState<Record<number, { good: string; damaged: string }>>(() => Object.fromEntries(out.map((l) => [l.id, { good: String(l.balance!.out), damaged: "" }])));
  const [f, setF] = useState({ docDate: today(), note: "" });
  const [save, { isLoading }] = useReceiveBackMutation();
  const any = Object.values(rows).some((r) => Number(r.good) > 0 || Number(r.damaged) > 0);

  const submit = async () => {
    try {
      await save({ issueId: issue.id, ...f, lines: out.map((l) => ({ lineId: l.id, good: rows[l.id]?.good, damaged: rows[l.id]?.damaged })) }).unwrap();
      toast.success("Return recorded — good items are back in stock");
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  return (
    <Modal title={`Receive back — ${issue.docNo}`} size="md" onClose={onClose}>
      <p className={styles.help}>
        From <strong>{issue.issuedTo}</strong>. Enter how many came back. <strong>Good</strong> ones go back into stock; <strong>damaged</strong> ones are recorded but not added to stock.
        Leave the rest — they stay on the slip.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item</th>
              <th className={styles.num}>Still out</th>
              <th>Back in good condition</th>
              <th>Back damaged</th>
            </tr>
          </thead>
          <tbody>
            {out.map((l) => (
              <tr key={l.id}>
                <td className={styles.strong}>
                  {l.item}
                  {l.remark && <div className={styles.muted}>{l.remark}</div>}
                </td>
                <td className={styles.num}>{qty(l.balance!.out, l.unit)}</td>
                <td>
                  <Input aria-label={`${l.item} good`} type="number" min={0} max={l.balance!.out} step="any" value={rows[l.id]?.good ?? ""} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id], good: e.target.value } })} />
                </td>
                <td>
                  <Input aria-label={`${l.item} damaged`} type="number" min={0} max={l.balance!.out} step="any" value={rows[l.id]?.damaged ?? ""} onChange={(e) => setRows({ ...rows, [l.id]: { ...rows[l.id], damaged: e.target.value } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.formGrid}>
        <Input label="Date received back" type="date" max={today()} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} />
        <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!any} onClick={submit}>
          Save return
        </Button>
      </div>
    </Modal>
  );
};

const CloseLineModal = ({ issue, line, onClose }: { issue: InventoryDoc; line: DocLine; onClose: () => void }) => {
  const [f, setF] = useState({ quantity: String(line.balance?.out ?? ""), reason: "", note: "", docDate: today() });
  const [save, { isLoading }] = useCloseIssueLineMutation();
  const needsNote = f.reason === "LOST" || f.reason === "DAMAGED";
  const submit = async () => {
    try {
      await save({ issueId: issue.id, lineId: line.id, ...f }).unwrap();
      toast.success("Closed on the slip");
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };
  return (
    <Modal title={`${line.item} won't come back`} size="sm" onClose={onClose}>
      <p className={styles.help}>
        Use this when {issue.issuedTo} can't return it. It's closed on the slip so it stops showing as pending. Stock doesn't change — it already left the store when it was issued.
      </p>
      <div className={styles.formGrid}>
        <Input label={`Quantity (still out: ${qty(line.balance?.out ?? 0, line.unit)})`} type="number" min={0} step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        <Input label="Date" type="date" max={today()} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} />
        <div className={styles.wide}>
          <Select label="Why" required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} options={[{ label: "Choose…", value: "" }, ...CLOSE_REASONS]} />
        </div>
        <div className={styles.wide}>
          <Input label={needsNote ? "What happened (required)" : "Note"} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!f.reason || Number(f.quantity) <= 0 || (needsNote && !f.note.trim())} onClick={submit}>
          Close it
        </Button>
      </div>
    </Modal>
  );
};

const VoidModal = ({ doc, onClose }: { doc: InventoryDoc; onClose: () => void }) => {
  const [reason, setReason] = useState("");
  const [voidDoc, { isLoading }] = useVoidInventoryDocMutation();
  return (
    <Modal title={`Void ${doc.docNo}?`} size="sm" onClose={onClose}>
      <p className={styles.help}>Use this only for a wrong entry. Its effect on stock is reversed and it stays listed as void. To fix a quantity, void it and enter it again.</p>
      <Input label="Reason" required value={reason} placeholder="e.g. Entered twice" onChange={(e) => setReason(e.target.value)} />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button
          variant="danger"
          isLoading={isLoading}
          disabled={reason.trim().length < 3}
          onClick={async () => {
            try {
              await voidDoc({ id: doc.id, reason: reason.trim() }).unwrap();
              toast.success(`${doc.docNo} voided`);
              onClose();
            } catch (e) {
              toast.error(getErrorMessage(e, "Couldn't void"));
            }
          }}
        >
          Void
        </Button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Stock ledger of one item
// ---------------------------------------------------------------------------

export const LedgerModal = ({ itemId, onClose, onOpenDoc }: { itemId: number; onClose: () => void; onOpenDoc: (id: number) => void }) => {
  const { data, isLoading } = useGetItemLedgerQuery({ id: itemId });
  return (
    <Modal title={data ? `Stock ledger — ${data.item.name}` : "Stock ledger"} size="xl" onClose={onClose}>
      {isLoading || !data ? (
        <Spinner />
      ) : !data.rows.length ? (
        <EmptyState title="No entries yet" />
      ) : (
        <>
          <p className={styles.help}>Every time this item came in or went out, with the document and the balance left in the store after it. Click a document number to open it.</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Document</th>
                  <th>Details</th>
                  <th className={styles.num}>In</th>
                  <th className={styles.num}>Out</th>
                  <th className={styles.num}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.lineId}>
                    <td>{fmtDate(r.date)}</td>
                    <td>
                      <button type="button" className={styles.link} onClick={() => onOpenDoc(r.docId)}>
                        {r.docNo}
                      </button>
                      <div className={styles.muted}>{KIND_LABEL[r.kind]}</div>
                    </td>
                    <td>
                      {[r.particulars, r.party, r.remark].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={`${styles.num} ${styles.success}`}>{r.inQty ? qty(r.inQty) : ""}</td>
                    <td className={`${styles.num} ${styles.danger}`}>{r.outQty ? qty(r.outQty) : ""}</td>
                    <td className={`${styles.num} ${styles.strong}`}>{qty(r.balance, data.item.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
};
