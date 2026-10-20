import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select, Spinner, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { useGetSessionsQuery } from "../../../../../store/api/sessions.api";
import { useGetClassSectionsQuery } from "../../../../../store/api/classSections.api";
import {
  useBulkUpdateFeeStructuresMutation,
  useCreateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  useGetFeeHeadsQuery,
  useGetFeeStructuresQuery,
} from "../../../../../store/api/fees.api";
import FeeItemsEditor, { emptyItem, itemsToApi, validateItems, type FeeItemDraft } from "../FeeItemsEditor";
import { classLabel, getErrorMessage, inr } from "../feeUtils";
import styles from "../Fees.module.css";

// Fee structures per class: matrix of every fee head, create a structure (any number of
// items), delete (Super Admin) and the bulk fee hike (Super Admin).
const StructuresTab = ({ isSuperAdmin }: { isSuperAdmin: boolean }) => {
  const navigate = useNavigate();
  const { data: sessions } = useGetSessionsQuery();
  const { data: classSections } = useGetClassSectionsQuery({ sessionId: "all" });
  const { data: feeHeads = [] } = useGetFeeHeadsQuery();
  const { data: structures = [], isLoading } = useGetFeeStructuresQuery();
  const [createStructure, { isLoading: creating }] = useCreateFeeStructureMutation();
  const [deleteStructure, { isLoading: deleting }] = useDeleteFeeStructureMutation();
  const [bulkUpdate, { isLoading: applying }] = useBulkUpdateFeeStructuresMutation();

  const currentSession = sessions?.find((s) => s.isCurrent) ?? sessions?.[0];
  const [sessionFilter, setSessionFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", sessionId: "", classSectionId: "" });
  const [items, setItems] = useState<FeeItemDraft[]>([emptyItem()]);
  const [pendingDelete, setPendingDelete] = useState<IFeeStructure | null>(null);

  const [selected, setSelected] = useState<number[]>([]);
  const [hike, setHike] = useState({ headId: "", mode: "FLAT" as "FLAT" | "PERCENT" | "FIXED", value: "", effectiveFrom: "" });
  const [hikePreview, setHikePreview] = useState<Array<{ id: number; label: string; oldAmount: number | null; newAmount: number | null }> | null>(null);

  const sessionId = sessionFilter ? Number(sessionFilter) : currentSession?.id;
  const visible = useMemo(() => structures.filter((s) => !sessionId || s.sessionId === sessionId), [structures, sessionId]);

  // Columns for every fee head actually used in the visible structures.
  const usedHeads = useMemo(() => {
    const ids = new Set(visible.flatMap((s) => (s.items ?? []).map((i) => i.feeHeadId)));
    return feeHeads.filter((h) => ids.has(h.id));
  }, [visible, feeHeads]);

  const annual = (s: IFeeStructure) =>
    (s.items ?? []).reduce((sum, i) => sum + Number(i.amount) * (i.applicableMonths?.length || 1), 0);

  const openCreate = () => {
    setForm({ name: "", sessionId: currentSession ? String(currentSession.id) : "", classSectionId: "" });
    setItems([emptyItem()]);
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (!form.sessionId) return toast.error("Choose the academic session");
    if (!form.classSectionId) return toast.error("Choose the class");
    const err = validateItems(items);
    if (err) return toast.error(err);
    try {
      await createStructure({
        name: form.name.trim() || `${classLabel(classSections?.find((c) => c.id === Number(form.classSectionId)))} fee plan`,
        sessionId: Number(form.sessionId),
        classSectionId: Number(form.classSectionId),
        items: itemsToApi(items),
      }).unwrap();
      toast.success("Fee structure created");
      setShowCreate(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the fee structure"));
    }
  };

  const buildHikePreview = () => {
    const val = Number(hike.value);
    if (!hike.headId || !(val > 0) || !hike.effectiveFrom) return toast.error("Choose a fee head, a value and a start date");
    setHikePreview(
      selected.map((id) => {
        const s = structures.find((x) => x.id === id)!;
        const item = s.items?.find((i) => i.feeHeadId === Number(hike.headId));
        const old = item ? Number(item.amount) : null; // never invent an amount
        const next =
          old === null ? null : hike.mode === "FLAT" ? old + val : hike.mode === "PERCENT" ? Math.round(old * (1 + val / 100)) : val;
        return { id, label: s.classSection ? classLabel(s.classSection) : s.name ?? `Structure #${id}`, oldAmount: old, newAmount: next };
      })
    );
  };

  const applyHike = async () => {
    if (!hikePreview) return;
    const targets = hikePreview.filter((p) => p.newAmount !== null);
    try {
      for (const t of targets) {
        await bulkUpdate({ feeStructureIds: [t.id], feeHeadId: Number(hike.headId), newAmount: t.newAmount!, effectiveFrom: hike.effectiveFrom }).unwrap();
      }
      toast.success(`Fee updated for ${targets.length} class(es)`);
      setHikePreview(null);
      setSelected([]);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't apply the fee change"));
    }
  };

  const columns: TableColumn<IFeeStructure>[] = [
    ...(isSuperAdmin
      ? [
          {
            key: "select",
            label: "",
            width: "40px",
            render: (s: IFeeStructure) => (
              <input
                type="checkbox"
                aria-label="Select for fee change"
                checked={selected.includes(s.id)}
                onChange={() => setSelected((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
              />
            ),
          },
        ]
      : []),
    {
      key: "class",
      label: "Class",
      render: (s) => (
        <div>
          <div className={styles.itemTitle}>{s.classSection ? classLabel(s.classSection) : "All classes"}</div>
          <div className={styles.muted}>{s.name}</div>
        </div>
      ),
    },
    ...usedHeads.map((h) => ({
      key: `head-${h.id}`,
      label: h.name,
      render: (s: IFeeStructure) => {
        const item = s.items?.find((i) => i.feeHeadId === h.id);
        return item ? (
          <div>
            {inr(item.amount)}
            <div className={styles.muted}>
              {item.frequency === "MONTHLY" ? `× ${item.applicableMonths?.length ?? 12} months` : item.frequency === "ANNUAL" ? "per year" : "one-time"}
            </div>
          </div>
        ) : (
          <span className={styles.muted}>—</span>
        );
      },
    })),
    { key: "annual", label: "Annual total", render: (s) => <strong>{inr(annual(s))}</strong> },
    {
      key: "actions",
      label: "",
      render: (s) => (
        <div className={styles.rowActions}>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/fees/structures/${s.id}`)}>
            Open plan
          </Button>
          {isSuperAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(s)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.section}>
      <Card
        title="Class fee structures"
        subtitle="What each class is charged, per fee head. Transport is billed separately by village."
        action={
          <div className={styles.rowActions}>
            <Select
              aria-label="Session"
              value={sessionFilter || (currentSession ? String(currentSession.id) : "")}
              onChange={(e) => setSessionFilter(e.target.value)}
              options={(sessions ?? []).map((s) => ({ label: `Session ${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }))}
            />
            <Button size="sm" onClick={openCreate} disabled={feeHeads.length === 0}>
              + New structure
            </Button>
          </div>
        }
      >
        {feeHeads.length === 0 && (
          <div className={`${styles.notice} ${styles.noticeWarn}`} style={{ marginBottom: "1rem" }}>
            Create fee heads (e.g. Tuition, Annual, Exam) in the Settings tab before setting up structures.
          </div>
        )}
        {isLoading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState title="No fee structures for this session" description="Create one per class so bills can be generated and payments collected." />
        ) : (
          <Table columns={columns} data={visible} keyField="id" mobilePrimary="class" />
        )}
      </Card>

      {isSuperAdmin && (
        <Card title="Change a fee for selected classes" subtitle="Super Admin · bills already generated are not changed">
          {selected.length === 0 ? (
            <p className={styles.muted}>Tick classes in the table above to change one of their fees from a date onwards.</p>
          ) : (
            <div className={styles.filters} style={{ marginBottom: 0 }}>
              <Select
                label="Fee head"
                value={hike.headId}
                onChange={(e) => setHike({ ...hike, headId: e.target.value })}
                options={[{ label: "Select…", value: "" }, ...feeHeads.map((h) => ({ label: h.name, value: String(h.id) }))]}
              />
              <Select
                label="Change"
                value={hike.mode}
                onChange={(e) => setHike({ ...hike, mode: e.target.value as typeof hike.mode })}
                options={[
                  { label: "Increase by ₹", value: "FLAT" },
                  { label: "Increase by %", value: "PERCENT" },
                  { label: "Set to ₹", value: "FIXED" },
                ]}
              />
              <Input label="Value" inputMode="decimal" value={hike.value} onChange={(e) => setHike({ ...hike, value: e.target.value })} />
              <Input label="From date" type="date" value={hike.effectiveFrom} onChange={(e) => setHike({ ...hike, effectiveFrom: e.target.value })} />
              <Button onClick={buildHikePreview}>Preview for {selected.length} class(es)</Button>
            </div>
          )}
        </Card>
      )}

      {showCreate && (
        <Modal title="New fee structure" size="xl" onClose={() => setShowCreate(false)}>
          <div className={styles.formStack}>
            <div className={styles.filters} style={{ marginBottom: 0 }}>
              <Select
                label="Session"
                required
                value={form.sessionId}
                onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
                options={[{ label: "Select…", value: "" }, ...(sessions ?? []).map((s) => ({ label: s.name, value: String(s.id) }))]}
              />
              <Select
                label="Class"
                required
                value={form.classSectionId}
                onChange={(e) => setForm({ ...form, classSectionId: e.target.value })}
                options={[
                  { label: "Select…", value: "" },
                  ...(classSections ?? [])
                    .filter((c) => !form.sessionId || c.sessionId === Number(form.sessionId))
                    .map((c) => ({ label: classLabel(c), value: String(c.id) })),
                ]}
              />
              <div className={styles.wide}>
                <Input label="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Class 5 standard plan" />
              </div>
            </div>
            <FeeItemsEditor items={items} onChange={setItems} feeHeads={feeHeads} />
          </div>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={submitCreate} isLoading={creating}>Create structure</Button>
          </div>
        </Modal>
      )}

      {hikePreview && (
        <Modal title="Confirm fee change" onClose={() => setHikePreview(null)}>
          <ul className={styles.list}>
            {hikePreview.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <div className={styles.listMain}>
                  <div className={styles.itemTitle}>{p.label}</div>
                </div>
                {p.oldAmount === null ? (
                  <Badge tone="neutral">Fee head not in this plan — skipped</Badge>
                ) : (
                  <span>
                    {inr(p.oldAmount)} → <strong>{inr(p.newAmount)}</strong>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.muted} style={{ marginTop: "0.75rem" }}>Applies from {hike.effectiveFrom}. Existing bills and receipts stay as they are.</p>
          <div className={styles.formActions}>
            <Button variant="outline" onClick={() => setHikePreview(null)}>Cancel</Button>
            <Button onClick={applyHike} isLoading={applying} disabled={!hikePreview.some((p) => p.newAmount !== null)}>Apply</Button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete fee structure?"
          message={`"${pendingDelete.name}" will be removed. Bills already generated from it are not deleted.`}
          confirmLabel="Delete"
          isLoading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await deleteStructure(pendingDelete.id).unwrap();
              toast.success("Fee structure deleted");
            } catch (e) {
              toast.error(getErrorMessage(e, "Couldn't delete the fee structure"));
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default StructuresTab;
