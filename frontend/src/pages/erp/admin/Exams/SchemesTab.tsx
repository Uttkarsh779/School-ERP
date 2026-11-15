import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, ConfirmDialog, EmptyState, Input, Modal, Select, Spinner } from "../../../../components/ui";
import {
  useDeleteSchemeMutation,
  useGetExamClassesQuery,
  useGetExamMetaQuery,
  useGetSchemesQuery,
  useSaveSchemeMutation,
  useUpdateExamSettingsMutation,
  type PaComponent,
  type Scheme,
} from "../../../../store/api/examPlan.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./AdminExamsPage.module.css";
import ui from "./SchemesTab.module.css";

// Assessment schemes: how each group of classes is assessed (terms, periodic assessment +
// exam marks and their parts, final weightage, grade scale, co-scholastic scale). The exam
// Super Admin and the Principal edit them (others read them); the Super Admin also sets the
// admit-card rule for fee dues here.

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
    <Modal title={s.id ? `Edit ${scheme.name}` : "New assessment scheme"} onClose={onClose} size="lg">
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
            <button type="button" className={styles.linkBtn} onClick={() => {
                // A key is never reused: marks already entered stay tied to their own part.
                let n = comps.length + 1;
                while (comps.some((c) => c.key === `C${n}`)) n += 1;
                set({ paComponents: [...comps, { key: `C${n}`, label: "", max: 5, source: "MARKS" }] });
              }}>
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
  const { data: classSections } = useGetExamClassesQuery();
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const [editing, setEditing] = useState<Partial<Scheme> | null>(null);
  const [deleting, setDeleting] = useState<Scheme | null>(null);
  const [remove, { isLoading: removing }] = useDeleteSchemeMutation();
  const [updateSettings, { isLoading: savingSetting }] = useUpdateExamSettingsMutation();
  const canEdit = !!meta?.permissions.schemes; // Super Admin and Principal
  const allClasses = useMemo(() => [...new Set((classSections ?? []).map((c) => c.className))].sort((a, b) => classOrder(a) - classOrder(b)), [classSections]);
  const unassigned = allClasses.filter((c) => !(schemes ?? []).some((s) => s.classNames.includes(c)));

  return (
    <div className={ui.page}>
      <div className={ui.settingRow}>
        <div className={ui.settingText}>
          <strong>Admit cards for students with overdue fees</strong>
          <span>
            When off, these students are left out when admit cards are printed and listed for the office to follow up.
            {!isSuperAdmin && " Only the Super Admin can change this."}
          </span>
        </div>
        <label className={ui.switch}>
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
          {meta?.settings.admitCardsForDefaulters ? "Issue" : "Hold back"}
        </label>
      </div>

      <div className={ui.head}>
        <div>
          <h2>Assessment schemes</h2>
          <p>How each group of classes is marked and graded.{!canEdit && " Only the Super Admin and the Principal can change these."}</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(structuredClone(blank))}>
            New scheme
          </Button>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className={ui.unassigned}>
          <span>Not in any scheme (default two-term pattern):</span>
          {unassigned.map((c) => (
            <span key={c} className={ui.chipMuted}>
              {c}
            </span>
          ))}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError || !schemes ? (
        <EmptyState title="Couldn't load the schemes" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : schemes.length === 0 ? (
        <EmptyState title="No schemes yet" description="Every class uses the default two-term pattern until you add a scheme." />
      ) : (
        <div className={ui.grid}>
          {schemes.map((s) => {
            const total = s.paMax + s.examMax || 1;
            const classes = [...s.classNames].sort((a, b) => classOrder(a) - classOrder(b));
            return (
              <article key={s.id} className={ui.card}>
                <div className={ui.cardTop}>
                  <div style={{ minWidth: 0 }}>
                    <h3>{s.name}</h3>
                    <div className={ui.chips}>
                      {classes.length ? classes.map((c) => <span key={c} className={ui.chip}>{c}</span>) : <span className={ui.chipMuted}>No classes</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className={ui.actions}>
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
                        Delete
                      </Button>
                    </div>
                  )}
                </div>

                <div className={ui.section}>
                  <p className={ui.sectionLabel}>Each {s.terms === 2 ? "term" : "subject"} out of {s.paMax + s.examMax}</p>
                  <div className={ui.bar}>
                    {s.paMax > 0 && (
                      <span className={ui.barPa} style={{ flex: s.paMax / total }} title="Periodic assessment">
                        PA {s.paMax}
                      </span>
                    )}
                    {s.examMax > 0 && (
                      <span className={ui.barExam} style={{ flex: s.examMax / total }} title="Term exam">
                        Exam {s.examMax}
                      </span>
                    )}
                  </div>
                  <div className={ui.stats}>
                    <div className={ui.stat}>
                      <span>{s.terms === 2 ? "Term 1 / Term 2" : "Result"}</span>
                      <strong>{s.terms === 2 ? `${s.finalWeights[0]}% / ${s.finalWeights[1]}%` : "Once a year"}</strong>
                    </div>
                    <div className={ui.stat}>
                      <span>Pass mark</span>
                      <strong>{s.passPercentage}%</strong>
                    </div>
                    <div className={ui.stat}>
                      <span>Co-scholastic</span>
                      <strong>{s.coScale}-point</strong>
                    </div>
                  </div>
                </div>

                <div className={ui.section}>
                  <p className={ui.sectionLabel}>Periodic assessment parts</p>
                  {s.paComponents.length ? (
                    <ul className={ui.parts}>
                      {s.paComponents.map((c) => (
                        <li key={c.key}>
                          <span className={ui.partName}>{c.label || "Unnamed part"}</span>
                          <span className={ui.partRule}>
                            {c.source === "TESTS" ? (c.rule === "BEST" ? `best ${c.best ?? 2} tests` : "average of tests") : "teacher enters"}
                          </span>
                          <span className={ui.partMarks}>{c.max}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className={ui.partRule}>None</span>
                  )}
                </div>

                <div className={ui.section}>
                  <p className={ui.sectionLabel}>Grades (minimum %)</p>
                  <div className={ui.grades}>
                    {[...s.gradeScale]
                      .sort((a, b) => b.min - a.min)
                      .map((g) => (
                        <span key={g.grade} className={ui.grade}>
                          <b>{g.grade}</b>
                          <span>{g.min}+</span>
                        </span>
                      ))}
                  </div>
                </div>
              </article>
            );
          })}
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
