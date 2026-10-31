import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Icon, Input, Spinner } from "../../../../components/ui";
import { printTermReportCards } from "../../../../components/shared/Print/termReportCardPrint";
import { usePrintSchool } from "../../../../components/shared/Print/usePrintSchool";
import { usePublishResultMutation, useGetClassResultQuery, useUnpublishResultMutation } from "../../../../store/api/examPlan.api";
import TermRemarksEditor from "./TermRemarksEditor";
import styles from "./AdminExamsPage.module.css";

// One class's term or final result: every student's subjects (periodic assessment + exam =
// total, grade), percentage, overall grade and result. The Super Admin / Principal publish it
// (it is then frozen); the final result's term weightage is chosen here before publishing.

const RESULT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  PASS: { label: "Pass", tone: "success" },
  NEEDS_IMPROVEMENT: { label: "Needs improvement", tone: "danger" },
  INCOMPLETE: { label: "Incomplete", tone: "warning" },
  PENDING: { label: "Pending", tone: "neutral" },
};
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 10) / 10));

const ClassResultView = ({ classSectionId, onBack }: { classSectionId: number; onBack?: () => void }) => {
  const [term, setTerm] = useState(1);
  const [w1, setW1] = useState<number | null>(null);
  const weights = term === 0 && w1 !== null ? [w1, 100 - w1] : undefined;
  const { data, isLoading, isFetching, isError, error, refetch } = useGetClassResultQuery({ classSectionId, term, weights });
  const [publish, { isLoading: publishing }] = usePublishResultMutation();
  const [unpublish, { isLoading: unpublishing }] = useUnpublishResultMutation();
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const schoolFor = usePrintSchool();

  // Weightage starts from the published one, else the scheme's default.
  useEffect(() => {
    if (term === 0 && data && w1 === null) setW1((data.published?.weights?.length === 2 ? data.published.weights : data.defaultWeights)[0] ?? 50);
  }, [data, term, w1]);

  const terms = data?.termsInScheme ?? 2;
  const tabs = terms === 1 ? [{ key: 1, label: "Result for the year" }] : [{ key: 1, label: "Term 1" }, { key: 2, label: "Term 2" }, { key: 0, label: "Final result" }];
  const incomplete = (data?.students ?? []).filter((s) => !s.complete).length;
  const what = term === 0 ? "final result" : terms === 1 ? "result" : `Term ${term} result`;

  const doPublish = async () => {
    try {
      await publish({ classSectionIds: [classSectionId], term, weights: term === 0 && w1 !== null ? [w1, 100 - w1] : undefined }).unwrap();
      toast.success(`The ${what} is published. Students have been notified.`);
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't publish");
    }
    setConfirm(null);
  };
  const doUnpublish = async () => {
    try {
      await unpublish({ classSectionId, term }).unwrap();
      toast.success(`The ${what} is unpublished`);
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't unpublish");
    }
    setConfirm(null);
  };

  return (
    <div className={styles.listPage}>
      {onBack && (
        <button type="button" className={styles.backLink} onClick={onBack}>
          <Icon name="arrowLeft" size={16} /> All classes
        </button>
      )}
      <div className={styles.chips} role="tablist" aria-label="Term">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={term === t.key} className={`${styles.chip} ${term === t.key ? styles.chipOn : ""}`} onClick={() => setTerm(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the result" description={(error as any)?.data?.message} action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <Card
          title={`${data.classSection.className} - ${data.classSection.section} · ${tabs.find((t) => t.key === term)?.label}`}
          subtitle={
            data.kind === "TERM" && data.exams
              ? `${data.scheme.name}. Exam: ${data.exams.termExams.join(", ") || "not set up yet"} · Periodic tests: ${data.exams.tests.join(", ") || "none yet"}`
              : `${data.scheme.name}. Final = Term 1 × ${data.weights?.[0]}% + Term 2 × ${data.weights?.[1]}%`
          }
          action={
            <div className={styles.resultActions}>
              {data.published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Not published</Badge>}
              {term !== 0 && (
                <Button size="sm" variant="outline" onClick={() => setRemarksOpen(true)}>
                  Remarks &amp; co-scholastic
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => printTermReportCards(data, schoolFor("reportCard"))} disabled={!data.students.length}>
                Print report cards
              </Button>
              {data.canPublish &&
                (data.published ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirm("unpublish")}>
                    Unpublish
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setConfirm("publish")}>
                    Publish
                  </Button>
                ))}
            </div>
          }
        >
          {term === 0 && terms === 2 && !data.published && (
            <div className={styles.weights}>
              <Input label="Term 1 weightage (%)" type="number" min={0} max={100} value={w1 ?? ""} onChange={(e) => setW1(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
              <Input label="Term 2 weightage (%)" type="number" value={w1 === null ? "" : 100 - w1} disabled />
              <span className={styles.admitHint}>The school decides this. It's saved with the final result when you publish.</span>
            </div>
          )}
          {incomplete > 0 && !data.published && (
            <p className={styles.resultWarn}>
              {incomplete} student{incomplete === 1 ? "" : "s"} still have missing marks (exam, periodic tests, or notebook/enrichment marks). Their result shows as incomplete.
            </p>
          )}
          {data.students.length === 0 ? (
            <EmptyState title="No students in this class" />
          ) : (
            <div className={styles.gridWrapper} style={{ opacity: isFetching ? 0.6 : 1 }}>
              <table className={styles.resultTable}>
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th className={styles.l}>Student</th>
                    {data.subjects.map((s) => (
                      <th key={s.id}>{s.name}</th>
                    ))}
                    <th>%</th>
                    <th>Grade</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.student.id}>
                      <td>{s.student.rollNo}</td>
                      <td className={styles.l}>{s.student.name}</td>
                      {data.subjects.map((sub) => {
                        const x = s.subjects.find((y) => y.subjectId === sub.id);
                        if (!x) return <td key={sub.id}>—</td>;
                        const tip = data.kind === "TERM" ? `Periodic ${n(x.pa)}${x.paAdjusted !== null ? " (adjusted)" : ""} + Exam ${x.examAbsent ? "AB" : n(x.exam)}` : `Term 1 ${n(x.term1?.percentage)}% · Term 2 ${n(x.term2?.percentage)}%`;
                        const value = data.kind === "TERM" ? x.total : x.percentage;
                        return (
                          <td key={sub.id} title={tip} className={x.passed === false ? styles.failCell : undefined}>
                            {data.kind === "TERM" && !x.hasPaper ? <span className={styles.admitHint}>no paper</span> : (
                              <>
                                {n(value)} <small>{x.grade ?? ""}</small>
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <strong>{n(s.percentage)}</strong>
                      </td>
                      <td>
                        <strong>{s.grade ?? "—"}</strong>
                      </td>
                      <td>
                        <Badge tone={RESULT[s.result]?.tone ?? "neutral"}>{RESULT[s.result]?.label ?? s.result}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {remarksOpen && <TermRemarksEditor classSectionId={classSectionId} term={term} onClose={() => setRemarksOpen(false)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm === "publish" ? `Publish the ${what}?` : `Unpublish the ${what}?`}
          message={
            confirm === "publish"
              ? `Students will see their report card and get a notification. The result is frozen as it is now${incomplete ? `; ${incomplete} student(s) still have missing marks` : ""}. Marks, periodic assessment and remarks for this ${term === 0 ? "year" : "term"} can't change until it's unpublished.`
              : "Students will no longer see this report card. Teachers can correct marks and remarks again."
          }
          confirmLabel={confirm === "publish" ? "Publish" : "Unpublish"}
          tone={confirm === "publish" ? "primary" : "danger"}
          isLoading={publishing || unpublishing}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm === "publish" ? doPublish : doUnpublish}
        />
      )}
    </div>
  );
};

export default ClassResultView;
