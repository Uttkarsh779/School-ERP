import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Card, EmptyState, PageHeader, Select, Spinner, StatCard, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetExamsQuery, useGetReportCardQuery } from "../../../../store/api/exams.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import styles from "./StudentReportCardPage.module.css";

const percentageTone = (percentage: number) => {
  if (percentage >= 75) return "good";
  if (percentage >= 50) return "warn";
  return "bad";
};

const StudentReportCardPage = () => {
  const [examId, setExamId] = useState<string>("");

  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetMyStudentProfileQuery();
  const { data: exams, isLoading: examsLoading } = useGetExamsQuery(
    { classSectionId: profile?.classSectionId ?? 0 },
    { skip: !profile }
  );

  const {
    data: reportCard,
    isLoading: cardLoading,
    isFetching: cardFetching,
    isError: cardError,
  } = useGetReportCardQuery(
    { examId: Number(examId), studentId: profile?.id ?? 0 },
    { skip: !examId || !profile }
  );

  useEffect(() => {
    if (profileError) toast.error("Failed to load your profile.");
    if (cardError) toast.error("Failed to load this report card.");
  }, [profileError, cardError]);

  const examOptions: SelectOption[] = (exams ?? []).map((e) => ({ label: e.name, value: e.id }));

  const columns: TableColumn<IReportCardSubject>[] = [
    { key: "subjectName", label: "Subject" },
    { key: "marksObtained", label: "Marks Obtained" },
    { key: "maxMarks", label: "Max Marks" },
  ];

  return (
    <div>
      <PageHeader title="Report Card" subtitle="Ram Raj Singh International School" />

      <Card className={styles.filterRow}>
        <Select
          label="Exam"
          options={examOptions}
          placeholder={profileLoading || examsLoading ? "Loading…" : "Select an exam"}
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
        />
      </Card>

      {!examId ? (
        <EmptyState title="Pick an exam" description="Select an exam above to view your report card." />
      ) : cardLoading || cardFetching ? (
        <Spinner />
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
          </div>
          <Card padded={false} className={styles.tableCard}>
            <Table columns={columns} data={reportCard.subjects} keyField="subjectId" />
          </Card>
        </>
      )}
    </div>
  );
};

export default StudentReportCardPage;
