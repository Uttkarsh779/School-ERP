import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetExamAnalysisQuery, useGetExamAuditQuery } from "../../../../store/api/exams.api";
import type { ExamAnalysisStudent, ExamAuditEntry, ExamResultStatus, ExamSubjectStats } from "../../../../store/api/exams.api";
import styles from "./ExamResultsView.module.css";

const STATUS_META: Record<ExamResultStatus, { label: string; tone: "success" | "danger" | "warning" | "neutral" | "info" }> = {
  PASS: { label: "Pass", tone: "success" },
  FAIL: { label: "Fail", tone: "danger" },
  ABSENT: { label: "Absent", tone: "warning" },
  PENDING: { label: "Marks pending", tone: "info" },
  NOT_ENTERED: { label: "Not entered", tone: "neutral" },
};

const fmtPct = (p: number | null | undefined) => (p === null || p === undefined ? "—" : `${p}%`);
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const fmtMark = (marks: number | null, max: number | null, absent: boolean | null) =>
  marks === null || max === null ? "—" : absent ? `AB / ${fmtNum(max)}` : `${fmtNum(marks)} / ${fmtNum(max)}`;

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Mark change history — loaded only when opened. The server limits it to the subjects the
// viewer may see (all for admins / class teacher, own subjects for a subject teacher).
const ChangeHistory = ({ examId }: { examId: number }) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useGetExamAuditQuery(examId, { skip: !open });

  const columns: TableColumn<ExamAuditEntry>[] = [
    { key: "changedAt", label: "When", render: (e) => fmtWhen(e.changedAt) },
    { key: "student", label: "Student", render: (e) => `${e.studentName}${e.rollNo ? ` (Roll ${e.rollNo})` : ""}` },
    { key: "subjectName", label: "Subject" },
    {
      key: "change",
      label: "Change",
      render: (e) =>
        e.action === "CREATE" ? (
          <span>Entered <strong>{fmtMark(e.newMarks, e.newMaxMarks, e.newIsAbsent)}</strong></span>
        ) : (
          <span>
            {fmtMark(e.oldMarks, e.oldMaxMarks, e.oldIsAbsent)} → <strong>{fmtMark(e.newMarks, e.newMaxMarks, e.newIsAbsent)}</strong>
          </span>
        ),
    },
    { key: "by", label: "By", render: (e) => e.changedByUser.name },
  ];

  return (
    <Card
      title="Change history"
      subtitle="Every mark entered or edited, with the previous value"
      action={
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Show history"}
        </Button>
      }
    >
      {!open ? (
        <p className={styles.muted}>Hidden — open to review corrections made to marks.</p>
      ) : isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className={styles.muted}>Couldn't load the change history.</p>
      ) : (
        <Table columns={columns} data={data ?? []} keyField="id" emptyMessage="No marks have been entered yet." />
      )}
    </Card>
  );
};

// Staff-only results view for one exam: summary, toppers, subject-wise stats and the full
// merit list with ranks. Ranking/pass rules live on the backend (exams/analysisService.ts).
const ExamResultsView = ({ examId, onBack }: { examId: number; onBack: () => void }) => {
  const { data, isLoading, isFetching, isError, refetch } = useGetExamAnalysisQuery(examId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [viewing, setViewing] = useState<ExamAnalysisStudent | null>(null);

  const subjectName = useMemo(() => new Map((data?.subjects ?? []).map((s) => [s.id, s.name])), [data?.subjects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.students ?? []).filter(
      (s) =>
        (!statusFilter || s.status === statusFilter) &&
        (!q || s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q))
    );
  }, [data?.students, search, statusFilter]);

  const header = (
    <div className={styles.header}>
      <div>
        <Button type="button" size="sm" variant="ghost" icon={<Icon name="arrowLeft" size={16} />} onClick={onBack}>
          Back to exams
        </Button>
        <h2 className={styles.title}>
          {data ? `${data.exam.name} — ${data.scope === "SUBJECT" ? "My Subject Results" : "Results & Merit List"}` : "Results & Merit List"}
          {data?.exam.isLocked && (
            <span className={styles.lockBadge}>
              <Badge tone="warning">Locked</Badge>
            </span>
          )}
        </h2>
        {data && (
          <p className={styles.muted}>
            {data.exam.classSection.className} - {data.exam.classSection.section}
            {data.exam.sessionName && ` · Session ${data.exam.sessionName}`} · Pass mark {data.passPercentage}% per subject
          </p>
        )}
      </div>
    </div>
  );

  if (isError) {
    return (
      <div className={styles.page}>
        {header}
        <EmptyState
          title="Couldn't load the results"
          description="Check your connection and try again."
          action={<Button type="button" variant="outline" onClick={() => refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  if (isLoading || isFetching || !data) {
    return (
      <div className={styles.page}>
        {header}
        <Spinner />
      </div>
    );
  }

  if (data.subjects.length === 0) {
    return (
      <div className={styles.page}>
        {header}
        <EmptyState title="No marks entered yet" description="Results, ranks and toppers will appear once teachers enter marks for this exam." />
      </div>
    );
  }

  const { summary } = data;
  const isSubjectScope = data.scope === "SUBJECT";

  const markCell = (s: ExamAnalysisStudent, subjectId: number) => {
    const m = s.marks.find((x) => x.subjectId === subjectId);
    if (!m || !m.entered) return <span className={styles.muted}>—</span>;
    if (m.isAbsent) return <span className={styles.absent}>AB</span>;
    return (
      <span className={m.passed ? undefined : styles.failMark} title={m.passed ? undefined : "Below pass mark"}>
        {fmtNum(m.marksObtained)}
        <span className={styles.outOf}>/{fmtNum(m.maxMarks)}</span>
      </span>
    );
  };

  const meritColumns: TableColumn<ExamAnalysisStudent>[] = [
    // A subject teacher's view has no class ranks (they'd be computed from one subject).
    ...(isSubjectScope
      ? []
      : [
          {
            key: "rank",
            label: "Rank",
            render: (s: ExamAnalysisStudent) =>
              s.rank ? <span className={s.rank <= 3 ? styles.rankTop : styles.rank}>{s.rank}</span> : <span className={styles.muted}>—</span>,
          },
        ]),
    { key: "rollNo", label: "Roll" },
    {
      key: "name",
      label: "Student",
      render: (s) => (
        <button type="button" className={styles.linkButton} onClick={() => setViewing(s)}>
          {s.name}
        </button>
      ),
    },
    ...data.subjects.map((subject) => ({
      key: `subject-${subject.id}`,
      label: subject.name,
      render: (s: ExamAnalysisStudent) => markCell(s, subject.id),
    })),
    {
      key: "total",
      label: "Total",
      render: (s) => (s.maxTotal > 0 ? <strong>{fmtNum(s.total)}<span className={styles.outOf}>/{fmtNum(s.maxTotal)}</span></strong> : "—"),
    },
    { key: "percentage", label: "%", render: (s) => fmtPct(s.percentage) },
    {
      key: "status",
      label: "Result",
      render: (s) => (
        <span title={s.failedSubjects.length ? `Failed / absent: ${s.failedSubjects.join(", ")}` : undefined}>
          <Badge tone={STATUS_META[s.status].tone}>{STATUS_META[s.status].label}</Badge>
        </span>
      ),
    },
  ];

  const subjectColumns: TableColumn<ExamSubjectStats>[] = [
    { key: "subjectName", label: "Subject", render: (s) => <strong>{s.subjectName}</strong> },
    { key: "appeared", label: "Appeared" },
    { key: "absent", label: "Absent", render: (s) => (s.absent ? <span className={styles.absent}>{s.absent}</span> : 0) },
    { key: "passed", label: "Passed / Failed", render: (s) => `${s.passed} / ${s.failed}` },
    { key: "passRate", label: "Pass %", render: (s) => fmtPct(s.passRate) },
    { key: "highest", label: "Highest", render: (s) => fmtPct(s.highestPercentage) },
    { key: "average", label: "Average", render: (s) => fmtPct(s.averagePercentage) },
    { key: "lowest", label: "Lowest", render: (s) => fmtPct(s.lowestPercentage) },
    {
      key: "toppers",
      label: "Subject Topper",
      render: (s) =>
        s.toppers.length === 0
          ? "—"
          : s.toppers.map((t) => `${t.name} (${fmtNum(t.marksObtained)}/${fmtNum(t.maxMarks)})`).join(", "),
    },
  ];

  return (
    <div className={styles.page}>
      {header}

      <div className={styles.statsGrid}>
        <StatCard label="Appeared" value={`${summary.appeared} / ${summary.totalStudents}`} icon={<Icon name="users" />} />
        <StatCard label="Pass rate" value={fmtPct(summary.passRate)} icon={<Icon name="check" />} />
        <StatCard label="Class average" value={fmtPct(summary.averagePercentage)} icon={<Icon name="graduationCap" />} />
        <StatCard label="Highest score" value={fmtPct(summary.highestPercentage)} icon={<Icon name="star" />} />
      </div>

      <div className={styles.statusRow}>
        {(Object.keys(STATUS_META) as ExamResultStatus[]).map((status) => {
          const count = { PASS: summary.passed, FAIL: summary.failed, ABSENT: summary.absent, PENDING: summary.pending, NOT_ENTERED: summary.notEntered }[status];
          return (
            <button
              key={status}
              type="button"
              className={`${styles.statusChip} ${statusFilter === status ? styles.statusChipActive : ""}`}
              onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
            >
              <Badge tone={STATUS_META[status].tone}>{count}</Badge>
              {STATUS_META[status].label}
            </button>
          );
        })}
      </div>

      {isSubjectScope && (
        <div className={styles.scopeNote}>
          You're seeing the subject(s) allocated to you. The full merit list, ranks and toppers across all subjects are
          available to the class teacher and administrators.
        </div>
      )}

      <div className={styles.twoCol}>
        {!isSubjectScope && (
        <Card title="Toppers" subtitle="Top 3 ranks — tied students share a rank">
          {data.toppers.length === 0 ? (
            <p className={styles.muted}>No ranked students yet. A student is ranked once marks or AB are entered for every subject.</p>
          ) : (
            <ol className={styles.topperList}>
              {data.toppers.map((t) => (
                <li key={t.studentId} className={styles.topperItem}>
                  <span className={`${styles.medal} ${styles[`medal${t.rank}`]}`}>{t.rank}</span>
                  <div className={styles.topperName}>
                    <button type="button" className={styles.linkButton} onClick={() => setViewing(t)}>
                      {t.name}
                    </button>
                    <div className={styles.muted}>Roll {t.rollNo}</div>
                  </div>
                  <div className={styles.topperScore}>
                    <strong>{fmtPct(t.percentage)}</strong>
                    <div className={styles.muted}>
                      {fmtNum(t.total)}/{fmtNum(t.maxTotal)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        )}

        <Card title="How results are worked out">
          <ul className={styles.rules}>
            <li>A subject is passed at <strong>{data.passPercentage}%</strong> or more of its max marks.</li>
            <li><strong>AB</strong> (absent) counts as 0 and as not passed for that subject.</li>
            <li><strong>Fail</strong>: below the pass mark, or absent, in any subject.</li>
            <li><strong>Rank</strong> is by total marks among students with every subject entered; ties share a rank (1, 2, 2, 4).</li>
            <li>Students absent in every subject, or with marks still pending, are not ranked.</li>
          </ul>
        </Card>
      </div>

      <Card title="Subject-wise analysis" subtitle="Percentages are of each subject's max marks; absentees are excluded from averages">
        <Table columns={subjectColumns} data={data.subjectStats} keyField="subjectId" showPagination={false} />
      </Card>

      <Card
        title={isSubjectScope ? "Student results" : "Merit list"}
        subtitle="Marks in red are below the pass mark · AB = absent · — = not entered"
      >
        <div className={styles.filters}>
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, roll or admission no…" />
          <Select
            label="Result"
            options={[{ label: "All results", value: "" }, ...(Object.keys(STATUS_META) as ExamResultStatus[]).map((s) => ({ label: STATUS_META[s].label, value: s }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <Table columns={meritColumns} data={filtered} keyField="studentId" defaultPageSize={50} emptyMessage="No students match these filters." />
      </Card>

      <ChangeHistory examId={examId} />

      {viewing && (
        <Modal title={`${viewing.name} · ${data.exam.name}`} size="md" onClose={() => setViewing(null)}>
          <div className={styles.modalHeader}>
            <span className={styles.muted}>
              Roll {viewing.rollNo} · Adm. No {viewing.admissionNo}
            </span>
            <span className={styles.modalBadges}>
              {viewing.rank && <Badge tone="primary">Rank {viewing.rank}</Badge>}
              <Badge tone={STATUS_META[viewing.status].tone}>{STATUS_META[viewing.status].label}</Badge>
            </span>
          </div>
          <table className={styles.cardTable}>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Marks</th>
                <th>%</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {viewing.marks.map((m) => (
                <tr key={m.subjectId}>
                  <td>{subjectName.get(m.subjectId)}</td>
                  {!m.entered ? (
                    <td colSpan={3} className={styles.muted}>Not entered</td>
                  ) : m.isAbsent ? (
                    <>
                      <td className={styles.absent}>AB / {fmtNum(m.maxMarks)}</td>
                      <td>—</td>
                      <td><Badge tone="warning">Absent</Badge></td>
                    </>
                  ) : (
                    <>
                      <td>
                        {fmtNum(m.marksObtained)} / {fmtNum(m.maxMarks)}
                      </td>
                      <td>{m.percentage}%</td>
                      <td><Badge tone={m.passed ? "success" : "danger"}>{m.passed ? "Pass" : "Fail"}</Badge></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{viewing.maxTotal > 0 ? `${fmtNum(viewing.total)} / ${fmtNum(viewing.maxTotal)}` : "—"}</td>
                <td>{fmtPct(viewing.percentage)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          {viewing.failedSubjects.length > 0 && (
            <p className={styles.failNote}>Failed / absent in: {viewing.failedSubjects.join(", ")}</p>
          )}
          <div className={styles.modalActions}>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ExamResultsView;
