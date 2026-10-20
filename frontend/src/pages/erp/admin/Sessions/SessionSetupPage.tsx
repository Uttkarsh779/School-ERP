import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, PageHeader, Select, Spinner } from "../../../../components/ui";
import {
  useCopySessionSetupMutation,
  useCreateSessionMutation,
  useGetPromotionPlanQuery,
  useGetRolloverOverviewQuery,
  useGetSessionsQuery,
  usePromoteStudentsMutation,
  useSetCurrentSessionMutation,
  type CopySetupResult,
  type PromotionAction,
  type PromotionPlanClass,
} from "../../../../store/api/sessions.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./SessionSetupPage.module.css";

const STEPS = ["Choose sessions", "Copy setup", "Promote students", "Go live"];

const ACTIONS: Array<{ value: PromotionAction; label: string }> = [
  { value: "PROMOTE", label: "Promote" },
  { value: "DETAIN", label: "Detain (same class)" },
  { value: "PASSED_OUT", label: "Passed out" },
  { value: "LEFT", label: "Left school (TC)" },
];

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

// "2026-27" -> "2027-28"; dates moved a year on.
const suggestNext = (s?: IAcademicSession) => {
  if (!s) return { name: "", startDate: "", endDate: "" };
  const m = s.name.match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/);
  const name = m ? `${Number(m[1]) + 1}-${String(Number(m[2]) + 1).slice(-m[2].length)}` : "";
  const shift = (v: string) => {
    const d = new Date(v);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };
  return { name, startDate: shift(s.startDate), endDate: shift(s.endDate) };
};

const classLabel = (c: { className: string; section: string }) => `${c.className} - ${c.section}`;

// New academic session setup — Super Admin. Copies last year's setup into the new session,
// promotes students class by class, then switches the current session. Nothing in the old
// session is deleted; it stays as history and its unpaid fees remain collectable.
const SessionSetupPage = () => {
  const role = useAppSelector((s) => s.auth.user?.role);
  const { data: sessions, isLoading } = useGetSessionsQuery();
  const [step, setStep] = useState(0);
  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", startDate: "", endDate: "" });
  const [createSession, { isLoading: creating }] = useCreateSessionMutation();

  const sorted = useMemo(() => [...(sessions ?? [])].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate)), [sessions]);
  const from = sorted.find((s) => s.id === fromId);
  const to = sorted.find((s) => s.id === toId);

  // Defaults: from = current session, to = the next session after it.
  useEffect(() => {
    if (!sorted.length || fromId !== "") return;
    const current = sorted.find((s) => s.isCurrent) ?? sorted[sorted.length - 1];
    setFromId(current.id);
    const next = sorted.find((s) => +new Date(s.startDate) > +new Date(current.startDate));
    if (next) setToId(next.id);
  }, [sorted, fromId]);

  const pair = fromId && toId && fromId !== toId ? { from: Number(fromId), to: Number(toId) } : null;

  const openNew = () => {
    setNewForm(suggestNext(sorted[sorted.length - 1]));
    setNewOpen(true);
  };
  const submitNew = async () => {
    if (!newForm.name.trim() || !newForm.startDate || !newForm.endDate) return toast.error("Fill in the name and both dates");
    try {
      const created = await createSession({ ...newForm, name: newForm.name.trim() }).unwrap();
      toast.success(`Session ${created.name} created`);
      setToId(created.id);
      setNewOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the session"));
    }
  };

  if (role !== "SUPER_ADMIN") {
    return (
      <div>
        <PageHeader title="New Session Setup" />
        <EmptyState title="Super Admin only" description="Only the Super Admin can set up a new academic session." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="New Session Setup"
        subtitle="Start the next academic year: copy last year's setup, promote students, then go live"
        actions={
          <Link to="/admin/sessions" className={styles.backLink}>
            ← Academic sessions
          </Link>
        }
      />

      <ol className={styles.stepper}>
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={`${styles.step} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}
              onClick={() => (i === 0 || pair ? setStep(i) : undefined)}
              disabled={i > 0 && !pair}
            >
              <span className={styles.stepNum}>{i < step ? "✓" : i + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {isLoading ? (
        <Spinner />
      ) : step === 0 ? (
        <Card title="Which year are you moving from and to?">
          <div className={styles.pairRow}>
            <Select
              label="Previous session (copy from)"
              value={fromId === "" ? "" : String(fromId)}
              onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : "")}
              options={[{ label: "Select…", value: "" }, ...sorted.map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }))]}
            />
            <span className={styles.arrow} aria-hidden="true">→</span>
            <Select
              label="New session"
              value={toId === "" ? "" : String(toId)}
              onChange={(e) => setToId(e.target.value ? Number(e.target.value) : "")}
              options={[
                { label: "Select…", value: "" },
                ...sorted.filter((s) => s.id !== fromId).map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) })),
              ]}
            />
            <Button variant="outline" onClick={openNew}>
              + Create new session
            </Button>
          </div>
          {fromId !== "" && fromId === toId && <p className={styles.warn}>Pick two different sessions.</p>}
          {pair && <Overview from={pair.from} to={pair.to} />}
          <div className={styles.footer}>
            <Button disabled={!pair} onClick={() => setStep(1)}>
              Next: copy setup →
            </Button>
          </div>
        </Card>
      ) : !pair || !from || !to ? null : step === 1 ? (
        <CopyStep from={from} to={to} onNext={() => setStep(2)} />
      ) : step === 2 ? (
        <PromoteStep from={from} to={to} onNext={() => setStep(3)} />
      ) : (
        <GoLiveStep from={from} to={to} />
      )}

      {newOpen && (
        <Modal title="New academic session" onClose={() => setNewOpen(false)}>
          <div className={styles.modalGrid}>
            <Input label="Session name" value={newForm.name} placeholder="e.g. 2027-28" onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
            <Input label="Start date" type="date" value={newForm.startDate} onChange={(e) => setNewForm({ ...newForm, startDate: e.target.value })} />
            <Input label="End date" type="date" value={newForm.endDate} onChange={(e) => setNewForm({ ...newForm, endDate: e.target.value })} />
          </div>
          <div className={styles.footer}>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={creating} onClick={submitNew}>
              Create session
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// Side-by-side counts of both sessions.
const Overview = ({ from, to }: { from: number; to: number }) => {
  const { data, isFetching } = useGetRolloverOverviewQuery({ from, to }, { refetchOnMountOrArgChange: true });
  if (!data) return isFetching ? <Spinner /> : null;
  const rows: Array<[string, keyof typeof data.fromCounts]> = [
    ["Class sections", "classes"],
    ["Subjects", "subjects"],
    ["Teacher allocations", "allocations"],
    ["Timetable periods", "slots"],
    ["Fee structures", "feeStructures"],
    ["Late-fee rule", "lateFeeRules"],
    ["Active students", "students"],
  ];
  return (
    <div className={styles.tableWrap}>
      <table className={styles.compare}>
        <thead>
          <tr>
            <th />
            <th>{data.from.name}</th>
            <th>{data.to.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key]) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{data.fromCounts[key]}</td>
              <td className={data.toCounts[key] ? undefined : styles.zero}>{data.toCounts[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const COPY_OPTIONS: Array<{ key: "classTeachers" | "subjects" | "teacherAllocations" | "timetable" | "feeStructures" | "lateFeeRule"; label: string; hint: string }> = [
  { key: "classTeachers", label: "Class teachers", hint: "Same class teacher for each class section (change any later)" },
  { key: "subjects", label: "Subjects", hint: "Each class's subject list" },
  { key: "teacherAllocations", label: "Subject teachers", hint: "Who teaches which subject (needs Subjects)" },
  { key: "timetable", label: "Weekly timetable", hint: "Copied only into classes that don't have a timetable yet" },
  { key: "feeStructures", label: "Fee structures", hint: "Class-wise fee heads and amounts, with the change below" },
  { key: "lateFeeRule", label: "Late-fee rule", hint: "Grace period and fine, if the new session has none" },
];

const CopyStep = ({ from, to, onNext }: { from: IAcademicSession; to: IAcademicSession; onNext: () => void }) => {
  const [opts, setOpts] = useState({ classTeachers: true, subjects: true, teacherAllocations: true, timetable: true, feeStructures: true, lateFeeRule: true });
  const [pct, setPct] = useState("0");
  const [roundTo, setRoundTo] = useState("10");
  const [result, setResult] = useState<CopySetupResult | null>(null);
  const [copy, { isLoading }] = useCopySessionSetupMutation();

  const run = async () => {
    const p = Number(pct || 0);
    if (!Number.isFinite(p) || p < -50 || p > 100) return toast.error("Fee change must be between -50% and 100%");
    try {
      const r = await copy({ fromSessionId: from.id, toSessionId: to.id, ...opts, teacherAllocations: opts.teacherAllocations && opts.subjects, feeIncreasePercent: p, roundFeesTo: Number(roundTo) }).unwrap();
      setResult(r);
      toast.success(`Setup copied to ${to.name}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't copy the setup"));
    }
  };

  return (
    <Card title={`Copy ${from.name} setup into ${to.name}`} subtitle="Class sections are always copied. Anything that already exists in the new session is kept, so this is safe to run again.">
      <div className={styles.optionGrid}>
        {COPY_OPTIONS.map((o) => (
          <label key={o.key} className={`${styles.option} ${opts[o.key] ? styles.optionOn : ""}`}>
            <input type="checkbox" checked={opts[o.key]} disabled={o.key === "teacherAllocations" && !opts.subjects} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.checked })} />
            <span>
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
          </label>
        ))}
      </div>

      {opts.feeStructures && (
        <div className={styles.feeRow}>
          <Input label="Fee change for the new year (%)" type="number" step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} />
          <Select
            label="Round new amounts to"
            value={roundTo}
            onChange={(e) => setRoundTo(e.target.value)}
            options={[
              { label: "Nearest ₹1", value: "1" },
              { label: "Nearest ₹10", value: "10" },
              { label: "Nearest ₹50", value: "50" },
              { label: "Nearest ₹100", value: "100" },
            ]}
          />
          <p className={styles.hint}>Example: ₹1,000 becomes ₹{(Math.round((1000 * (1 + Number(pct || 0) / 100)) / Number(roundTo)) * Number(roundTo)).toLocaleString("en-IN")}. You can edit any structure afterwards under Fees → Fee Structures.</p>
        </div>
      )}

      {isLoading && <p className={styles.hint}>Copying… this can take a minute for a large school.</p>}

      {result && (
        <div className={styles.result}>
          <strong>Copied into {to.name}</strong>
          <ul>
            <li>{result.classesCreated} class sections created{result.classesExisting ? ` (${result.classesExisting} already existed)` : ""}</li>
            {opts.classTeachers && <li>{result.classTeachers} class teachers assigned</li>}
            {opts.subjects && <li>{result.subjects} subjects added</li>}
            {opts.teacherAllocations && <li>{result.allocations} subject-teacher allocations</li>}
            {opts.timetable && <li>{result.timetableSlots} timetable periods{result.timetableSkipped ? ` (${result.timetableSkipped} classes already had a timetable)` : ""}</li>}
            {opts.feeStructures && <li>{result.feeStructures} fee structures{result.feeStructuresSkipped ? ` (${result.feeStructuresSkipped} already existed)` : ""}</li>}
            {opts.lateFeeRule && <li>{result.lateFeeRule ? "Late-fee rule copied" : "Late-fee rule not copied (already set or none last year)"}</li>}
          </ul>
        </div>
      )}

      <Overview from={from.id} to={to.id} />

      <div className={styles.footer}>
        <Button variant={result ? "outline" : "primary"} isLoading={isLoading} onClick={run}>
          {result ? "Copy again" : `Copy setup to ${to.name}`}
        </Button>
        <Button variant={result ? "primary" : "outline"} onClick={onNext}>
          Next: promote students →
        </Button>
      </div>
    </Card>
  );
};

const PromoteStep = ({ from, to, onNext }: { from: IAcademicSession; to: IAcademicSession; onNext: () => void }) => {
  const { data: plan, isFetching, refetch } = useGetPromotionPlanQuery({ from: from.id, to: to.id }, { refetchOnMountOrArgChange: true });
  const [promote] = usePromoteStudentsMutation();
  const [actions, setActions] = useState<Record<number, PromotionAction>>({});
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [promoteTo, setPromoteTo] = useState<Record<number, string>>({});
  const [detainTo, setDetainTo] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number[]>([]);
  const [rollMode, setRollMode] = useState<"ALPHABETICAL" | "KEEP">("ALPHABETICAL");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const pending = useMemo(() => (plan?.classes ?? []).filter((c) => c.students.length > 0), [plan]);
  const studentCount = pending.reduce((s, c) => s + c.students.length, 0);
  const toOptions = [{ label: "Choose class…", value: "" }, ...(plan?.toClasses ?? []).map((c) => ({ label: classLabel(c), value: String(c.id) }))];

  // Defaults from the plan (kept when the plan refreshes).
  useEffect(() => {
    if (!plan) return;
    setActions((prev) => {
      const next = { ...prev };
      for (const c of plan.classes) for (const s of c.students) if (!next[s.id]) next[s.id] = c.defaultAction;
      return next;
    });
    setPromoteTo((prev) => {
      const next = { ...prev };
      for (const c of plan.classes) if (next[c.id] === undefined) next[c.id] = c.suggestedPromoteToId ? String(c.suggestedPromoteToId) : "";
      return next;
    });
    setDetainTo((prev) => {
      const next = { ...prev };
      for (const c of plan.classes) if (next[c.id] === undefined) next[c.id] = c.suggestedDetainToId ? String(c.suggestedDetainToId) : "";
      return next;
    });
  }, [plan]);

  const tally = (c: PromotionPlanClass) => {
    const t: Record<PromotionAction, number> = { PROMOTE: 0, DETAIN: 0, PASSED_OUT: 0, LEFT: 0 };
    for (const s of c.students) t[actions[s.id] ?? c.defaultAction]++;
    return t;
  };
  const problemOf = (c: PromotionPlanClass) => {
    const t = tally(c);
    if (t.PROMOTE && !promoteTo[c.id]) return `Choose the ${to.name} class to promote into`;
    if (t.DETAIN && !detainTo[c.id]) return `Choose the ${to.name} class for detained students`;
    return null;
  };
  const setAll = (c: PromotionPlanClass, action: PromotionAction) => setActions((prev) => ({ ...prev, ...Object.fromEntries(c.students.map((s) => [s.id, action])) }));

  const run = async () => {
    setConfirm(false);
    const bad = pending.find((c) => problemOf(c));
    if (bad) return toast.error(`${classLabel(bad)}: ${problemOf(bad)}`);
    const totals = { promoted: 0, detained: 0, passedOut: 0, left: 0, skipped: 0 };
    try {
      for (let i = 0; i < pending.length; i++) {
        const c = pending[i];
        setProgress({ done: i, total: pending.length, label: classLabel(c) });
        const r = await promote({
          fromSessionId: from.id,
          toSessionId: to.id,
          rollNumbering: rollMode,
          decisions: c.students.map((s) => {
            const action = actions[s.id] ?? c.defaultAction;
            return {
              studentId: s.id,
              action,
              toClassSectionId: action === "PROMOTE" ? Number(promoteTo[c.id]) : action === "DETAIN" ? Number(detainTo[c.id]) : null,
              remarks: remarks[s.id]?.trim() || undefined,
            };
          }),
        }).unwrap();
        for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += r[k];
      }
      toast.success(`Done: ${totals.promoted} promoted, ${totals.detained} detained, ${totals.passedOut} passed out, ${totals.left} left`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Promotion stopped — fix the problem and run it again (finished classes are kept)"));
    } finally {
      setProgress(null);
      refetch();
    }
  };

  if (!plan) return isFetching ? <Spinner /> : null;
  if (plan.toClasses.length === 0) {
    return (
      <Card>
        <EmptyState title={`${to.name} has no classes yet`} description="Copy the setup first (previous step) so students have classes to move into." />
      </Card>
    );
  }

  const processed = plan.processed;
  const processedTotal = Object.values(processed).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <Card
      title={`Promote students from ${from.name} to ${to.name}`}
      subtitle="Everyone is promoted to the next class by default. Change a student to Detain, Passed out or Left where needed. Leavers are marked inactive and taken off transport; their records stay."
    >
      <div className={styles.promoteBar}>
        <Select
          label="Roll numbers in the new class"
          value={rollMode}
          onChange={(e) => setRollMode(e.target.value as "ALPHABETICAL" | "KEEP")}
          options={[
            { label: "Renumber alphabetically (1, 2, 3…)", value: "ALPHABETICAL" },
            { label: "Keep old roll numbers where free", value: "KEEP" },
          ]}
        />
        <div className={styles.promoteStats}>
          <span>
            <strong>{studentCount}</strong> students to process in {pending.length} classes
          </span>
          {processedTotal > 0 && (
            <span className={styles.muted}>
              Already done: {processed.PROMOTED ?? 0} promoted · {processed.DETAINED ?? 0} detained · {processed.PASSED_OUT ?? 0} passed out · {processed.LEFT ?? 0} left
            </span>
          )}
        </div>
      </div>

      {pending.length === 0 ? (
        <div className={styles.result}>
          <strong>All students of {from.name} have been processed.</strong>
          <p className={styles.hint}>New admissions for {to.name} can be added from the Students page as usual.</p>
        </div>
      ) : (
        <div className={styles.classList}>
          {pending.map((c) => {
            const t = tally(c);
            const problem = problemOf(c);
            const isOpen = open.includes(c.id);
            return (
              <section key={c.id} className={`${styles.classCard} ${problem ? styles.classCardWarn : ""}`}>
                <div className={styles.classHead}>
                  <div className={styles.classTitle}>
                    <strong>{classLabel(c)}</strong>
                    <span className={styles.muted}>{c.students.length} students</span>
                    {c.isFinalClass && <Badge tone="info">Final class</Badge>}
                  </div>
                  <div className={styles.classTargets}>
                    {t.PROMOTE > 0 && (
                      <Select label={`Promote ${t.PROMOTE} to`} value={promoteTo[c.id] ?? ""} onChange={(e) => setPromoteTo({ ...promoteTo, [c.id]: e.target.value })} options={toOptions} />
                    )}
                    {t.DETAIN > 0 && (
                      <Select label={`Detain ${t.DETAIN} in`} value={detainTo[c.id] ?? ""} onChange={(e) => setDetainTo({ ...detainTo, [c.id]: e.target.value })} options={toOptions} />
                    )}
                  </div>
                </div>
                <div className={styles.classSummary}>
                  {t.PROMOTE > 0 && <Badge tone="success">{t.PROMOTE} promote</Badge>}
                  {t.DETAIN > 0 && <Badge tone="warning">{t.DETAIN} detain</Badge>}
                  {t.PASSED_OUT > 0 && <Badge tone="info">{t.PASSED_OUT} passed out</Badge>}
                  {t.LEFT > 0 && <Badge tone="danger">{t.LEFT} left</Badge>}
                  {problem && <span className={styles.problem}>{problem}</span>}
                  <span className={styles.spacer} />
                  <Select
                    aria-label="Set all students"
                    value=""
                    onChange={(e) => e.target.value && setAll(c, e.target.value as PromotionAction)}
                    options={[{ label: "Set all to…", value: "" }, ...ACTIONS]}
                  />
                  <Button size="sm" variant="outline" onClick={() => setOpen(isOpen ? open.filter((x) => x !== c.id) : [...open, c.id])}>
                    {isOpen ? "Hide students" : "Review students"}
                  </Button>
                </div>
                {isOpen && (
                  <div className={styles.tableWrap}>
                    <table className={styles.students}>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th className={styles.hideSm}>Adm. No</th>
                          <th className={styles.hideSm}>Roll</th>
                          <th>Result</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.students.map((s) => {
                          const action = actions[s.id] ?? c.defaultAction;
                          return (
                            <tr key={s.id}>
                              <td>
                                <strong>{s.name}</strong>
                              </td>
                              <td className={styles.hideSm}>{s.admissionNo}</td>
                              <td className={styles.hideSm}>{s.rollNo}</td>
                              <td>
                                <select className={`${styles.actionSelect} ${styles[`act_${action}`]}`} value={action} onChange={(e) => setActions({ ...actions, [s.id]: e.target.value as PromotionAction })}>
                                  {ACTIONS.map((a) => (
                                    <option key={a.value} value={a.value}>
                                      {a.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                {action !== "PROMOTE" && (
                                  <input
                                    className={styles.remarkInput}
                                    placeholder={action === "LEFT" ? "Reason / TC no." : "Optional note"}
                                    value={remarks[s.id] ?? ""}
                                    maxLength={300}
                                    onChange={(e) => setRemarks({ ...remarks, [s.id]: e.target.value })}
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {progress && (
        <div className={styles.progressBox}>
          <span>
            Processing {progress.label} ({progress.done + 1} of {progress.total})…
          </span>
          <div className={styles.progressTrack}>
            <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className={styles.footer}>
        {pending.length > 0 && (
          <Button isLoading={!!progress} onClick={() => setConfirm(true)}>
            Process {studentCount} students
          </Button>
        )}
        <Button variant={pending.length ? "outline" : "primary"} onClick={onNext} disabled={!!progress}>
          Next: go live →
        </Button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Promote students?"
          message={`${studentCount} students will move into their ${to.name} classes (or be marked passed out / left). Their ${from.name} attendance, marks and fees stay as history. Students can still be moved individually afterwards from their profile.`}
          confirmLabel="Promote"
          tone="primary"
          onConfirm={run}
          onCancel={() => setConfirm(false)}
        />
      )}
    </Card>
  );
};

const GoLiveStep = ({ from, to }: { from: IAcademicSession; to: IAcademicSession }) => {
  const { data, isFetching } = useGetRolloverOverviewQuery({ from: from.id, to: to.id }, { refetchOnMountOrArgChange: true });
  const { data: sessions } = useGetSessionsQuery();
  const [setCurrent, { isLoading }] = useSetCurrentSessionMutation();
  const [confirm, setConfirm] = useState(false);
  const isLive = sessions?.find((s) => s.id === to.id)?.isCurrent;

  // Wait for fresh counts: the checklist must reflect the promotion just done.
  if (!data || isFetching) return isFetching ? <Spinner /> : null;
  const t = data.toCounts;
  const checks: Array<{ ok: boolean; label: string; hint: string; link?: string; optional?: boolean }> = [
    { ok: t.classes > 0, label: `${t.classes} class sections`, hint: "Copy the setup or add classes", link: "/admin/class-sections" },
    { ok: t.subjects > 0, label: `${t.subjects} subjects, ${t.allocations} teacher allocations`, hint: "Needed for marks entry and the timetable", link: "/admin/class-sections" },
    { ok: t.slots > 0, label: `${t.slots} timetable periods`, hint: "Can be filled in after going live", link: "/admin/timetable", optional: true },
    { ok: t.feeStructures > 0, label: `${t.feeStructures} fee structures`, hint: "Without one, the new session's fees can't be billed", link: "/admin/fees" },
    { ok: t.lateFeeRules > 0, label: t.lateFeeRules ? "Late-fee rule set" : "No late-fee rule", hint: "Optional: no fine is charged without one", link: "/admin/fees", optional: true },
    {
      ok: data.fromCounts.students === 0,
      label: data.fromCounts.students === 0 ? `All ${from.name} students processed` : `${data.fromCounts.students} students still in ${from.name} classes`,
      hint: "Promote them first, or they won't appear in the new year's classes",
    },
  ];
  const blocking = checks.filter((c) => !c.ok && !c.optional).length;

  const goLive = async () => {
    setConfirm(false);
    try {
      await setCurrent(to.id).unwrap();
      toast.success(`${to.name} is now the current session`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't switch the session"));
    }
  };

  return (
    <Card title={`Make ${to.name} the current session`} subtitle="Attendance, timetable, teacher classes, fee collection and dashboards follow the current session.">
      <ul className={styles.checklist}>
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? styles.checkOk : c.optional ? styles.checkOptional : styles.checkBad}>
            <span className={styles.checkIcon} aria-hidden="true">
              {c.ok ? "✓" : c.optional ? "–" : "!"}
            </span>
            <span>
              <strong>{c.label}</strong>
              {!c.ok && (
                <small>
                  {c.hint}
                  {c.link && (
                    <>
                      {" · "}
                      <Link to={c.link}>Open</Link>
                    </>
                  )}
                </small>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.result}>
        <strong>What stays the same</strong>
        <p className={styles.hint}>
          {from.name} attendance, exam results and report cards, fee charges, payments and receipts are kept unchanged. Unpaid {from.name} fees show as
          previous-session dues on the fee desk and the student's fee page, and can be collected as usual.
        </p>
      </div>

      <div className={styles.footer}>
        {isLive ? (
          <Badge tone="success">{to.name} is the current session</Badge>
        ) : (
          <Button isLoading={isLoading} onClick={() => setConfirm(true)}>
            Make {to.name} current
          </Button>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={`Switch to ${to.name}?`}
          message={
            blocking
              ? `${blocking} item(s) above still need attention. You can switch anyway and finish them later — ${from.name} data is not affected either way.`
              : `${to.name} becomes the current session for everyone. You can switch back at any time from Academic Sessions.`
          }
          confirmLabel={`Make ${to.name} current`}
          tone={blocking ? "danger" : "primary"}
          onConfirm={goLive}
          onCancel={() => setConfirm(false)}
        />
      )}
    </Card>
  );
};

export default SessionSetupPage;
