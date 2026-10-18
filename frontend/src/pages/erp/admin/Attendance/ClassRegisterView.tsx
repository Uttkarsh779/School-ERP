import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Spinner, StatCard, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetAttendanceMonthlyRegisterQuery } from "../../../../store/api/attendance.api";
import type { AttendanceRegisterStudent } from "../../../../store/api/attendance.api";
import StudentMonthModal from "./StudentMonthModal";
import {
  LOW_ATTENDANCE_THRESHOLD,
  STATUS_META,
  WEEKDAY_SHORT,
  dayKey,
  formatPct,
  monthLabel,
  pctTone,
  weekday,
} from "./attendanceFormat";
import styles from "./MonthlyReport.module.css";

interface ClassRegisterViewProps {
  classSectionId: number;
  year: number;
  month: number;
  onBack?: () => void; // omitted when shown on its own (teacher's attendance page)
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const ClassRegisterView = ({ classSectionId, year, month, onBack }: ClassRegisterViewProps) => {
  const { data, isLoading, isFetching, isError, refetch } = useGetAttendanceMonthlyRegisterQuery({ classSectionId, year, month });
  const [viewing, setViewing] = useState<AttendanceRegisterStudent | null>(null);

  useEffect(() => {
    if (isError) toast.error("Failed to load the class register.");
  }, [isError]);

  const days = useMemo(() => Array.from({ length: data?.daysInMonth ?? 0 }, (_, i) => i + 1), [data?.daysInMonth]);
  const workingSet = useMemo(() => new Set(data?.workingDays ?? []), [data?.workingDays]);

  const title = data ? `${data.classSection.className} - ${data.classSection.section}` : "Class register";

  const exportCsv = () => {
    if (!data) return;
    const header = ["Roll No", "Admission No", "Student", ...days.map(String), "Present", "Absent", "Late", "Leave", "Attendance %"];
    const lines = data.students.map((s) =>
      [
        s.rollNo,
        s.admissionNo,
        s.name,
        ...days.map((d) => {
          const status = s.days[dayKey(year, month, d)];
          return status ? STATUS_META[status].short : "";
        }),
        s.counts.PRESENT,
        s.counts.ABSENT,
        s.counts.LATE,
        s.counts.LEAVE,
        s.percentage ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${data.classSection.className}-${data.classSection.section}-${year}-${String(month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: TableColumn<AttendanceRegisterStudent>[] = [
    { key: "rollNo", label: "Roll No" },
    {
      key: "name",
      label: "Student",
      render: (s) => (
        <div>
          <button type="button" className={styles.linkButton} onClick={() => setViewing(s)}>
            {s.name}
          </button>
          <div className={styles.muted}>
            {s.admissionNo}
            {!s.isActive && " · inactive"}
          </div>
        </div>
      ),
    },
    { key: "present", label: "Present", render: (s) => s.counts.PRESENT },
    { key: "absent", label: "Absent", render: (s) => s.counts.ABSENT },
    { key: "late", label: "Late", render: (s) => s.counts.LATE },
    { key: "leave", label: "Leave", render: (s) => s.counts.LEAVE },
    { key: "notMarked", label: "Not Marked", render: (s) => (s.notMarked > 0 ? s.notMarked : "—") },
    {
      key: "percentage",
      label: "Attendance %",
      render: (s) => <Badge tone={pctTone(s.percentage)}>{formatPct(s.percentage)}</Badge>,
    },
    {
      key: "actions",
      label: "",
      render: (s) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setViewing(s)}>
          View
        </Button>
      ),
    },
  ];

  const below = data?.students.filter((s) => s.percentage !== null && s.percentage < LOW_ATTENDANCE_THRESHOLD).length ?? 0;

  return (
    <div className={styles.register}>
      <div className={styles.registerHeader}>
        <div>
          {onBack && (
            <Button type="button" size="sm" variant="ghost" icon={<Icon name="arrowLeft" size={16} />} onClick={onBack}>
              All classes
            </Button>
          )}
          <h2 className={styles.registerTitle}>
            {title} · {monthLabel(year, month)}
          </h2>
          {data && (
            <p className={styles.muted}>
              {data.classSection.sessionName && `Session ${data.classSection.sessionName}`}
              {data.classSection.classTeacherName && ` · Class teacher: ${data.classSection.classTeacherName}`}
            </p>
          )}
        </div>
        <Button type="button" variant="outline" onClick={exportCsv} disabled={!data || data.students.length === 0}>
          Export CSV
        </Button>
      </div>

      {isError ? (
        <EmptyState
          title="Couldn't load this class register"
          description="Check your connection and try again."
          action={<Button type="button" variant="outline" onClick={() => refetch()}>Retry</Button>}
        />
      ) : isLoading || isFetching || !data ? (
        <Spinner />
      ) : data.students.length === 0 ? (
        <EmptyState title="No students in this class" description="There are no active students or attendance records for this class." />
      ) : (
        <>
          <div className={styles.statsGrid}>
            <StatCard label="Class attendance" value={formatPct(data.summary.percentage)} icon={<Icon name="clipboardCheck" />} />
            <StatCard label="Days marked" value={data.workingDays.length} icon={<Icon name="calendar" />} />
            <StatCard label="Students" value={data.summary.studentCount} icon={<Icon name="users" />} />
            <StatCard label={`Below ${LOW_ATTENDANCE_THRESHOLD}%`} value={below} icon={<Icon name="bell" />} />
          </div>

          <Card title="Student summary" subtitle="Click a student to see their full month">
            <Table columns={columns} data={data.students} keyField="studentId" defaultPageSize={50} />
          </Card>

          <Card
            title="Day-wise register"
            subtitle={data.workingDays.length === 0 ? "No attendance has been marked for this month yet" : "Shaded columns are days with no attendance marked"}
            padded={false}
          >
            <div className={styles.gridScroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <th className={styles.stickyCol}>Student</th>
                    {days.map((d) => {
                      const key = dayKey(year, month, d);
                      const wd = weekday(year, month, d);
                      return (
                        <th key={d} className={!workingSet.has(key) ? styles.offDay : undefined}>
                          <div>{d}</div>
                          <div className={wd === 0 ? styles.sunday : styles.weekday}>{WEEKDAY_SHORT[wd]}</div>
                        </th>
                      );
                    })}
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.studentId}>
                      <td className={styles.stickyCol}>
                        <button type="button" className={styles.linkButton} onClick={() => setViewing(s)}>
                          <span className={styles.roll}>{s.rollNo}</span> {s.name}
                        </button>
                      </td>
                      {days.map((d) => {
                        const key = dayKey(year, month, d);
                        const status = s.days[key];
                        if (!workingSet.has(key)) return <td key={d} className={styles.offDay} />;
                        return (
                          <td key={d} title={status ? STATUS_META[status].label : "Not marked"}>
                            {status ? (
                              <span className={`${styles.cell} ${styles[`cell_${status}`]}`}>{STATUS_META[status].short}</span>
                            ) : (
                              <span className={styles.cellEmpty}>–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className={styles.pctCell}>{formatPct(s.percentage)}</td>
                    </tr>
                  ))}
                </tbody>
                {data.workingDays.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className={styles.stickyCol}>Present that day</td>
                      {days.map((d) => {
                        const key = dayKey(year, month, d);
                        const t = data.dayTotals[key];
                        return (
                          <td key={d} className={!t ? styles.offDay : undefined}>
                            {t ? t.PRESENT : ""}
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className={styles.legend}>
              {(Object.keys(STATUS_META) as AttendanceStatus[]).map((status) => (
                <span key={status} className={styles.legendItem}>
                  <span className={`${styles.cell} ${styles[`cell_${status}`]}`}>{STATUS_META[status].short}</span>
                  {STATUS_META[status].label}
                </span>
              ))}
              <span className={styles.legendItem}>
                <span className={styles.cellEmpty}>–</span> Not marked
              </span>
            </div>
          </Card>
        </>
      )}

      {viewing && data && (
        <StudentMonthModal
          student={viewing}
          year={year}
          month={month}
          daysInMonth={data.daysInMonth}
          workingDays={data.workingDays}
          className={title}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
};

export default ClassRegisterView;
