import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Icon, Spinner } from "../../../../components/ui";
import { useGetAssessmentSheetQuery, useSaveAdjustmentsMutation, useSaveAssessmentMarksMutation } from "../../../../store/api/examPlan.api";
import styles from "./TeacherExams.module.css";

// Subject teacher: the term's periodic assessment (e.g. out of 20) for one subject. Parts
// from periodic tests are worked out from the test marks; the others (notebook, subject
// enrichment...) are entered here. The suggested total can be adjusted for each student
// until the result is published.

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10));

const AssessmentEntry = ({ classSectionId, subject, terms, onBack }: { classSectionId: number; subject: { id: number; name: string }; terms: number; onBack: () => void }) => {
  const [term, setTerm] = useState(1);
  const { data, isLoading, isError, refetch } = useGetAssessmentSheetQuery({ classSectionId, term, subjectId: subject.id }, { refetchOnMountOrArgChange: true });
  const [saveMarks, { isLoading: savingMarks }] = useSaveAssessmentMarksMutation();
  const [saveAdj, { isLoading: savingAdj }] = useSaveAdjustmentsMutation();
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [adj, setAdj] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);

  const entered = (data?.scheme.paComponents ?? []).filter((c) => c.source === "MARKS");
  useEffect(() => {
    if (!data) return;
    const m: Record<string, string> = {};
    const a: Record<number, string> = {};
    for (const s of data.students) {
      for (const c of s.components) if (entered.some((e) => e.key === c.key)) m[`${s.student.id}:${c.key}`] = c.score === null ? "" : String(c.score);
      a[s.student.id] = s.paAdjusted === null ? "" : String(s.paAdjusted);
    }
    setMarks(m);
    setAdj(a);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = async () => {
    if (!data) return;
    const markRows = data.students.flatMap((s) =>
      entered
        .filter((c) => (marks[`${s.student.id}:${c.key}`] ?? "") !== (s.components.find((x) => x.key === c.key)?.score?.toString() ?? ""))
        .map((c) => ({ studentId: s.student.id, component: c.key, marks: marks[`${s.student.id}:${c.key}`] === "" ? null : Number(marks[`${s.student.id}:${c.key}`]) }))
    );
    const adjRows = data.students
      .filter((s) => (adj[s.student.id] ?? "") !== (s.paAdjusted === null ? "" : String(s.paAdjusted)))
      .map((s) => ({ studentId: s.student.id, marks: adj[s.student.id] === "" ? null : Number(adj[s.student.id]) }));
    try {
      if (markRows.length) await saveMarks({ classSectionId, term, subjectId: subject.id, rows: markRows }).unwrap();
      if (adjRows.length) await saveAdj({ classSectionId, term, subjectId: subject.id, rows: adjRows }).unwrap();
      toast.success("Saved");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save");
    }
  };

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backBtn}
        onClick={() => {
          if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
          onBack();
        }}
      >
        <Icon name="arrowLeft" size={16} /> Exams
      </button>
      <div>
        <h1 className={styles.detailTitle}>{subject.name} · periodic assessment</h1>
        {terms === 2 && (
          <div className={styles.pills} role="tablist" aria-label="Term" style={{ marginTop: "0.6rem" }}>
            {[1, 2].map((t) => (
              <button key={t} type="button" role="tab" aria-selected={term === t} className={`${styles.pill} ${term === t ? styles.pillOn : ""}`} onClick={() => setTerm(t)}>
                Term {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the marks" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <>
          <div className={styles.notice}>
            Out of <b>{data.scheme.paMax}</b>:{" "}
            {data.scheme.paComponents.map((c) => `${c.label} ${c.max}${c.source === "TESTS" ? (c.rule === "BEST" ? ` (best ${c.best ?? 2} tests)` : " (average of tests)") : ""}`).join(" + ")}.
            {" "}Periodic tests counted: {data.exams.tests.join(", ") || "none yet"}. Type a final mark to adjust a student&apos;s total; leave it empty to use the suggested one.
            {data.published && <b> The result is published, so these marks can&apos;t change now.</b>}
          </div>
          <section className={styles.panel} style={{ overflowX: "auto" }}>
            <table className={styles.paTable}>
              <thead>
                <tr>
                  <th>Roll</th>
                  <th className={styles.paName}>Student</th>
                  {data.scheme.paComponents.map((c) => (
                    <th key={c.key}>
                      {c.label}
                      <small> /{c.max}</small>
                    </th>
                  ))}
                  <th>Suggested</th>
                  <th>Final /{data.scheme.paMax}</th>
                  <th>Exam /{data.scheme.examMax}</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.student.id}>
                    <td>{s.student.rollNo}</td>
                    <td className={styles.paName}>{s.student.name}</td>
                    {s.components.map((c) =>
                      entered.some((e) => e.key === c.key) ? (
                        <td key={c.key}>
                          <input
                            className={styles.paInput}
                            inputMode="decimal"
                            value={marks[`${s.student.id}:${c.key}`] ?? ""}
                            disabled={!data.canEdit}
                            onChange={(e) => {
                              setMarks((m) => ({ ...m, [`${s.student.id}:${c.key}`]: e.target.value.replace(/[^0-9.]/g, "") }));
                              setDirty(true);
                            }}
                            aria-label={`${s.student.name} ${c.label}`}
                          />
                        </td>
                      ) : (
                        <td key={c.key}>{n(c.score)}</td>
                      )
                    )}
                    <td>{n(s.paSuggested)}</td>
                    <td>
                      <input
                        className={styles.paInput}
                        inputMode="decimal"
                        placeholder={n(s.paSuggested)}
                        value={adj[s.student.id] ?? ""}
                        disabled={!data.canEdit}
                        onChange={(e) => {
                          setAdj((a) => ({ ...a, [s.student.id]: e.target.value.replace(/[^0-9.]/g, "") }));
                          setDirty(true);
                        }}
                        aria-label={`${s.student.name} final periodic assessment`}
                      />
                    </td>
                    <td>{n(s.exam)}</td>
                    <td>
                      <b>{n(s.total)}</b> {s.grade && <small>{s.grade}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {data.canEdit && (
            <div className={styles.saveBar}>
              <span>{dirty ? "Unsaved changes" : "All saved"}</span>
              <Button onClick={save} isLoading={savingMarks || savingAdj} disabled={!dirty}>
                Save
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AssessmentEntry;
