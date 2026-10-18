import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Card, EmptyState, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetExamsQuery, useGetReportCardQuery } from "../../../../store/api/exams.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import styles from "./StudentReportCardPage.module.css";

const RESULT_LABEL: Record<string, string> = {
  PASS: "Pass",
  FAIL: "Needs improvement",
  ABSENT: "Absent",
  PENDING: "Marks pending",
  NOT_ENTERED: "Not entered",
};

const CO_SCHOLASTIC: Array<{ key: "workEducation" | "artEducation" | "healthPhysical" | "discipline"; label: string }> = [
  { key: "workEducation", label: "Work Education" },
  { key: "artEducation", label: "Art Education" },
  { key: "healthPhysical", label: "Health & Physical Education" },
  { key: "discipline", label: "Discipline" },
];
const GRADE_MEANING: Record<string, string> = { A: "Outstanding", B: "Very good", C: "Fair" };

const percentageTone = (percentage: number) => {
  if (percentage >= 75) return "good";
  if (percentage >= 50) return "warn";
  return "bad";
};

// Student report card: available once the school publishes an exam's results. Shows marks,
// result, rank, the class teacher's remark and co-scholastic grades.
const StudentReportCardPage = () => {
  const [examId, setExamId] = useState<string>("");

  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetMyStudentProfileQuery();
  const { data: exams, isLoading: examsLoading } = useGetExamsQuery({ classSectionId: profile?.classSectionId ?? 0 }, { skip: !profile });

  const published = useMemo(() => (exams ?? []).filter((e) => e.resultsPublished), [exams]);
  const unpublishedCount = (exams ?? []).length - published.length;

  // Open the most recent published exam by default.
  useEffect(() => {
    if (!examId && published.length) setExamId(String(published[0].id));
  }, [published, examId]);

  const { data: reportCard, isLoading: cardLoading, isFetching: cardFetching, isError: cardError } = useGetReportCardQuery(
    { examId: Number(examId), studentId: profile?.id ?? 0 },
    { skip: !examId || !profile }
  );

  useEffect(() => {
    if (profileError) toast.error("Failed to load your profile.");
  }, [profileError]);

  const examOptions: SelectOption[] = published.map((e) => ({ label: e.name, value: e.id }));

  const columns: TableColumn<IReportCardSubject>[] = [
    { key: "subjectName", label: "Subject" },
    { key: "marksObtained", label: "Marks Obtained", render: (s) => (s.isAbsent ? "AB (Absent)" : s.marksObtained) },
    { key: "maxMarks", label: "Max Marks" },
    {
      key: "result",
      label: "Result",
      render: (s) => (s.passed === undefined ? "—" : s.passed ? "Pass" : s.isAbsent ? "Absent" : "Below pass mark"),
    },
  ];

  return (
    <div>
      <PageHeader title="Report Card" subtitle={profile?.classSection ? `${profile.classSection.className} - ${profile.classSection.section}` : undefined} />

      <Card className={styles.filterRow}>
        <Select
          label="Exam"
          options={examOptions}
          placeholder={profileLoading || examsLoading ? "Loading…" : published.length ? "Select an exam" : "No results published yet"}
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
        {unpublishedCount > 0 && (
          <p className={styles.finalNote} style={{ margin: "0.6rem 0 0" }}>
            {unpublishedCount} more exam{unpublishedCount === 1 ? "" : "s"} will appear here once the school publishes the results.
          </p>
        )}
      </Card>

      {!examId ? (
        <EmptyState title="No report cards yet" description="Your report card appears here once the school publishes exam results." />
      ) : cardLoading || cardFetching ? (
        <Spinner />
      ) : cardError ? (
        <EmptyState title="Report card not available" description="Results for this exam haven't been published yet." />
      ) : !reportCard || reportCard.subjects.length === 0 ? (
        <EmptyState title="No results yet" description="Marks for this exam haven't been entered yet." />
      ) : (
        <>
          <div className={styles.statsRow}>
            <div className={[styles.percentageCard, styles[percentageTone(reportCard.percentage)]].join(" ")}>
              <div className={styles.percentageValue}>{reportCard.percentage.toFixed(1)}%</div>
              <div className={styles.percentageLabel}>Overall</div>
            </div>
            <StatCard label="Total Marks" value={`${reportCard.total} / ${reportCard.maxTotal}`} />
            {reportCard.status && <StatCard label="Result" value={RESULT_LABEL[reportCard.status] ?? reportCard.status} />}
            {reportCard.rank ? <StatCard label={`Class rank (of ${reportCard.rankedCount})`} value={`#${reportCard.rank}`} /> : null}
          </div>
          {reportCard.failedSubjects && reportCard.failedSubjects.length > 0 && (
            <p className={styles.finalNote}>Needs attention in: {reportCard.failedSubjects.join(", ")}.</p>
          )}
          <Card title="Scholastic areas" padded={false} className={styles.tableCard}>
            <Table columns={columns} data={reportCard.subjects} keyField="subjectId" showPagination={false} />
          </Card>

          <div className={styles.remarksGrid}>
            <Card title="Co-scholastic areas" subtitle="Graded A (Outstanding), B (Very good), C (Fair)">
              {reportCard.remarks && CO_SCHOLASTIC.some((a) => reportCard.remarks?.coScholastic[a.key]) ? (
                <ul className={styles.coList}>
                  {CO_SCHOLASTIC.map((a) => {
                    const g = reportCard.remarks?.coScholastic[a.key];
                    return (
                      <li key={a.key}>
                        <span>{a.label}</span>
                        <span className={styles.grade}>
                          {g ?? "—"}
                          {g && <small> {GRADE_MEANING[g]}</small>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.finalNote}>Not graded for this exam.</p>
              )}
            </Card>
            <Card title="Class teacher's remark">
              {reportCard.remarks?.remark ? (
                <blockquote className={styles.remark}>
                  “{reportCard.remarks.remark}”
                  {reportCard.remarks.classTeacher && <footer>— {reportCard.remarks.classTeacher}</footer>}
                </blockquote>
              ) : (
                <p className={styles.finalNote}>No remark for this exam.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default StudentReportCardPage;
