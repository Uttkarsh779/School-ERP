import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Select, Spinner } from "../../../../components/ui";
import { useGetExamMetaQuery, useGetResultsOverviewQuery, usePublishResultMutation } from "../../../../store/api/examPlan.api";
import ClassResultView from "./ClassResultView";
import styles from "./AdminExamsPage.module.css";

// Term and final results for every class: what's published, and open a class to check,
// print and publish. The Super Admin / Principal can publish one term for many classes at
// once (the final result uses each scheme's default weightage when published from here).
const ResultsTab = () => {
  const { data, isLoading, isError, refetch } = useGetResultsOverviewQuery();
  const { data: meta } = useGetExamMetaQuery();
  const [open, setOpen] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [term, setTerm] = useState("1");
  const [confirm, setConfirm] = useState(false);
  const [publish, { isLoading: publishing }] = usePublishResultMutation();
  const publisher = !!meta?.permissions.publisher;

  if (open !== null) return <ClassResultView classSectionId={open} onBack={() => setOpen(null)} />;

  const status = (pubs: { term: number }[], t: number) => (pubs.some((p) => p.term === t) ? <Badge tone="success">Published</Badge> : <span className={styles.admitHint}>—</span>);
  const toggle = (id: number) => setPicked((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const doPublish = async () => {
    try {
      const r = await publish({ classSectionIds: [...picked], term: Number(term) }).unwrap();
      toast.success(`Published for ${r.published} class${r.published === 1 ? "" : "es"}`);
      setPicked(new Set());
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't publish");
    }
    setConfirm(false);
  };

  return (
    <div className={styles.listPage}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't load the results" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : (
        <Card
          title="Results by class"
          subtitle="Open a class to check every student's result, print report cards and publish."
          padded={false}
          action={
            publisher && picked.size > 0 ? (
              <div className={styles.resultActions}>
                <Select
                  label=""
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  options={[
                    { label: "Term 1", value: "1" },
                    { label: "Term 2", value: "2" },
                    { label: "Final result", value: "0" },
                  ]}
                />
                <Button size="sm" onClick={() => setConfirm(true)}>
                  Publish for {picked.size}
                </Button>
              </div>
            ) : undefined
          }
        >
          <div className={styles.gridWrapper}>
            <table className={styles.resultTable}>
              <thead>
                <tr>
                  {publisher && <th />}
                  <th className={styles.l}>Class</th>
                  <th className={styles.l}>Scheme</th>
                  <th>Term 1</th>
                  <th>Term 2</th>
                  <th>Final</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    {publisher && (
                      <td>
                        <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.className} ${c.section}`} />
                      </td>
                    )}
                    <td className={styles.l}>
                      <strong>
                        {c.className} - {c.section}
                      </strong>
                    </td>
                    <td className={styles.l}>{c.scheme}</td>
                    {c.terms === 1 ? (
                      <>
                        <td>{status(c.published, 1)}</td>
                        <td colSpan={2}>
                          <span className={styles.admitHint}>One result for the year</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{status(c.published, 1)}</td>
                        <td>{status(c.published, 2)}</td>
                        <td>{status(c.published, 0)}</td>
                      </>
                    )}
                    <td>
                      <Button size="sm" variant="outline" onClick={() => setOpen(c.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Publish for ${picked.size} class${picked.size === 1 ? "" : "es"}?`}
          message={`Students of these classes will see their ${term === "0" ? "final" : `Term ${term}`} report card and get a notification. Each result is frozen as it is now, even if some marks are missing. ${term === "0" ? "Each class's default term weightage is used; open a class to choose a different one." : ""}`}
          confirmLabel="Publish"
          isLoading={publishing}
          onCancel={() => setConfirm(false)}
          onConfirm={doPublish}
        />
      )}
    </div>
  );
};

export default ResultsTab;
