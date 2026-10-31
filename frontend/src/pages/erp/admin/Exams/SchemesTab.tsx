import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select, Spinner } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import {
  useDeleteSchemeMutation,
  useGetExamMetaQuery,
  useGetSchemesQuery,
  useSaveSchemeMutation,
  useUpdateExamSettingsMutation,
  type PaComponent,
  type Scheme,
} from "../../../../store/api/examPlan.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./AdminExamsPage.module.css";

// Assessment schemes: how each group of classes is assessed (terms, periodic assessment +
// exam marks and their parts, final weightage, grade scale, co-scholastic scale). The exam
// coordinator edits them; the Super Admin also sets the admit-card rule for fee dues here.

const PRE = ["Nursery", "LKG", "UKG"];
const classOrder = (c: string) => (PRE.includes(c) ? PRE.indexOf(c) - 10 : parseInt(c.replace(/\D/g, ""), 10) || 100);

const blank: Partial<Scheme> = {
  name: "",
  classNames: [],
  terms: 2,
  paMax: 20,
  examMax: 80,
  passPercentage: 33,
  finalWeights: [50, 50],
  paComponents: [
    { key: "PT", label: "Periodic tests", max: 10, source: "TESTS", rule: "AVERAGE" },
    { key: "NB", label: "Notebook", max: 5, source: "MARKS" },
    { key: "SEA", label: "Subject enrichment", max: 5, source: "MARKS" },
  ],
  gradeScale: [
    { min: 91, grade: "A1" },
    { min: 81, grade: "A2" },
    { min: 71, grade: "B1" },
    { min: 61, grade: "B2" },
    { min: 51, grade: "C1" },
    { min: 41, grade: "C2" },
    { min: 33, grade: "D" },
    { min: 0, grade: "E" },
  ],
  coScale: 3,
};

const SchemeEditor = ({ scheme, allClasses, onClose }: { scheme: Partial<Scheme>; allClasses: string[]; onClose: () => void }) => {
  const [s, setS] = useState<Partial<Scheme>>(structuredClone(scheme));
  const [save, { isLoading }] = useSaveSchemeMutation();
  const set = (patch: Partial<Scheme>) => setS((x) => ({ ...x, ...patch }));
  const comps = s.paComponents ?? [];
  const setComp = (i: number, patch: Partial<PaComponent>) => set({ paComponents: comps.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const compTotal = comps.reduce((a, c) => a + (Number(c.max) || 0), 0);

  const onSave = async () => {
    try {
      await save(s).unwrap();
      toast.success("Scheme saved");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the scheme");
    }
  };

  return (
    <Modal title={s.id ? `Edit ${scheme.name}` : "New assessment scheme"} onClose={onClose}>
      <div className={styles.admitForm}>
        <Input label="Scheme name" value={s.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Middle (Class 6–8)" />
        <div>
          <div className={styles.planClassesHead}>
            <span>Classes</span>
          </div>
          <div className={styles.planClasses}>
            {allClasses.map((c) => {
              const on = s.classNames?.includes(c);
              return (
                <label key={c} className={`${styles.planClass} ${on ? styles.planClassOn : ""}`}>
                  <input type="checkbox" checked={!!on} onChange={() => set({ classNames: on ? s.classNames!.filter((x) => x !== c) : [...(s.classNames ?? []), c] })} />
                  {c}
                </label>
              );
            })}
          </div>
        </div>
        <div className={styles.planRow}>
          <Select label="Terms" value={String(s.terms)} onChange={(e) => set({ terms: Number(e.target.value), finalWeights: Number(e.target.value) === 1 ? [100] : [50, 50] })} options={[{ label: "Two terms", value: "2" }, { label: "One result for the year", value: "1" }]} />
          <Input label="Periodic assessment marks" type="number" value={s.paMax ?? ""} onChange={(e) => set({ paMax: Number(e.target.value) })} />
          <Input label="Term exam marks" type="number" value={s.examMax ?? ""} onChange={(e) => set({ examMax: Number(e.target.value) })} />
          <Input label="Pass mark (%)" type="number" value={s.passPercentage ?? ""} onChange={(e) => set({ passPercentage: Number(e.target.value) })} />
          {s.terms === 2 && (
            <Input
              label="Default Term 1 weightage (%)"
              type="number"
              value={s.finalWeights?.[0] ?? 50}
              onChange={(e) => {
                const w = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                set({ finalWeights: [w, 100 - w] });
              }}
            />
          )}
          <Select label="Co-scholastic grades" value={String(s.coScale)} onChange={(e) => set({ coScale: Number(e.target.value) })} options={[{ label: "3-point (A–C)", value: "3" }, { label: "5-point (A–E)", value: "5" }]} />
        </div>

        <div>
          <div className={styles.planClassesHead}>
            <span>
              Periodic assessment parts <small className={compTotal === s.paMax ? styles.readyPill : styles.failText}>({compTotal} of {s.paMax})</small>
            </span>
            <button type="button" className={styles.linkBtn} onClick={() => set({ paComponents: [...comps, { key: `C${comps.length + 1}`, label: "", max: 5, source: "MARKS" }] })}>
              + Add part
            </button>
          </div>
          <div className={styles.admitTableWrap}>
            <table className={styles.admitTable}>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>Marks</th>
                  <th>Comes from</th>
                  <th>Periodic tests counted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comps.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <input value={c.label} onChange={(e) => setComp(i, { label: e.target.value })} aria-label="Part name" />
                    </td>
                    <td>
                      <input type="number" value={c.max} onChange={(e) => setComp(i, { max: Number(e.target.value) })} style={{ width: 64 }} aria-label="Part marks" />
                    </td>
                    <td>
                      <select value={c.source} onChange={(e) => setComp(i, { source: e.target.value as PaComponent["source"] })}>
                        <option value="TESTS">Periodic tests</option>
                        <option value="MARKS">Teacher enters</option>
                      </select>
                    </td>
                    <td>
                      {c.source === "TESTS" ? (
                        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <select value={c.rule ?? "AVERAGE"} onChange={(e) => setComp(i, { rule: e.target.value as "AVERAGE" | "BEST" })}>
                            <option value="AVERAGE">Average of all</option>
                            <option value="BEST">Best of</option>
                          </select>
                          {c.rule === "BEST" && <input type="number" min={1} value={c.best ?? 2} onChange={(e) => setComp(i, { best: Number(e.target.value) })} style={{ width: 52 }} aria-label="Best of" />}
                        </span>
                      ) : (
                        <span className={styles.admitHint}>—</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className={styles.linkBtn} onClick={() => set({ paComponents: comps.filter((_, j) => j !== i) })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.admitHint}>The subject teacher can still adjust each student's final periodic-assessment mark before the result is published.</p>
        </div>

        <div>
          <div className={styles.planClassesHead}>
            <span>Grade scale (minimum % for each grade)</span>
          </div>
          <div className={styles.gradeGrid}>
            {(s.gradeScale ?? []).map((g, i) => (
              <span key={i} className={styles.gradeCell}>
                <input value={g.grade} onChange={(e) => set({ gradeScale: s.gradeScale!.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)) })} aria-label="Grade" />
                <input type="number" value={g.min} onChange={(e) => set({ gradeScale: s.gradeScale!.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} aria-label="Minimum %" />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.admitActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} isLoading={isLoading}>
            Save scheme
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const SchemesTab = () => {
  const { data: schemes, isLoading, isError, refetch } = useGetSchemesQuery();
  const { data: meta } = useGetExamMetaQuery();
  const { data: classSections } = useGetClassSectionsQuery();
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const [editing, setEditing] = useState<Partial<Scheme> | null>(null);
  const [deleting, setDeleting] = useState<Scheme | null>(null);
  const [remove, { isLoading: removing }] = useDeleteSchemeMutation();
  const [updateSettings, { isLoading: savingSetting }] = useUpdateExamSettingsMutation();
  const coordinator = !!meta?.permissions.coordinator;
  const allClasses = useMemo(() => [...new Set((classSections ?? []).map((c) => c.className))].sort((a, b) => classOrder(a) - classOrder(b)), [classSections]);
  const unassigned = allClasses.filter((c) => !(schemes ?? []).some((s) => s.classNames.includes(c)));

  return (
    <div className={styles.listPage}>
      <Card title="Admit cards and unpaid fees" subtitle={isSuperAdmin ? "Only the Super Admin can change this." : undefined}>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={!!meta?.settings.admitCardsForDefaulters}
            disabled={!isSuperAdmin || savingSetting}
            onChange={async (e) => {
              try {
                await updateSettings({ admitCardsForDefaulters: e.target.checked }).unwrap();
                toast.success("Saved");
              } catch (err: any) {
                toast.error(err?.data?.message ?? "Couldn't save");
              }
            }}
          />
          Issue admit cards to students with overdue fees too
        </label>
        <p className={styles.admitHint} style={{ marginTop: 6 }}>
          When off, students with overdue fees are left out when admit cards are printed, and listed so the office can follow up.
        </p>
      </Card>

      <div className={styles.planClassesHead}>
        <span>Assessment schemes</span>
        {coordinator && (
          <Button size="sm" onClick={() => setEditing(structuredClone(blank))}>
            New scheme
          </Button>
        )}
      </div>
      {unassigned.length > 0 && <p className={styles.resultWarn}>Not in any scheme yet (they use the default two-term pattern): {unassigned.join(", ")}</p>}

      {isLoading ? (
        <Spinner />
      ) : isError || !schemes ? (
        <EmptyState title="Couldn't load the schemes" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <div className={styles.schemeGrid}>
          {schemes.map((s) => (
            <Card
              key={s.id}
              title={s.name}
              subtitle={s.classNames.join(", ") || "No classes"}
              action={
                coordinator ? (
                  <div className={styles.resultActions}>
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                      Delete
                    </Button>
                  </div>
                ) : undefined
              }
            >
              <ul className={styles.schemeFacts}>
                <li>
                  <span>Pattern</span>
                  <strong>
                    {s.terms === 2 ? "Two terms" : "One result for the year"} · {s.paMax} + {s.examMax}
                  </strong>
                </li>
                <li>
                  <span>Periodic assessment</span>
                  <strong>
                    {s.paComponents.map((c) => `${c.label} ${c.max}${c.source === "TESTS" ? (c.rule === "BEST" ? ` (best ${c.best ?? 2})` : " (average)") : ""}`).join(" · ") || "—"}
                  </strong>
                </li>
                {s.terms === 2 && (
                  <li>
                    <span>Final weightage (default)</span>
                    <strong>
                      Term 1 {s.finalWeights[0]}% · Term 2 {s.finalWeights[1]}%
                    </strong>
                  </li>
                )}
                <li>
                  <span>Pass mark · Co-scholastic</span>
                  <strong>
                    {s.passPercentage}% · {s.coScale}-point scale
                  </strong>
                </li>
                <li>
                  <span>Grades</span>
                  <strong>{[...s.gradeScale].sort((a, b) => b.min - a.min).map((g) => `${g.grade} ${g.min}+`).join(", ")}</strong>
                </li>
              </ul>
            </Card>
          ))}
        </div>
      )}

      {editing && <SchemeEditor scheme={editing} allClasses={allClasses} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="Its classes will use the default two-term pattern until you add them to another scheme. Published results aren't affected."
          confirmLabel="Delete"
          tone="danger"
          isLoading={removing}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await remove(deleting.id).unwrap();
              toast.success("Scheme deleted");
            } catch (e: any) {
              toast.error(e?.data?.message ?? "Couldn't delete");
            }
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
};

export default SchemesTab;
