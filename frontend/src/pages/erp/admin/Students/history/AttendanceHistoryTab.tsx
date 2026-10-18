import { useState } from "react";
import { Badge, Button, Card, EmptyState, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import type { StudentHistory } from "../../../../../store/api/students.api";
import StudentMonthModal from "../../Attendance/StudentMonthModal";
import { STATUS_META, formatPct, monthLabel, pctTone } from "../../Attendance/attendanceFormat";
import styles from "./StudentHistory.module.css";

type Session = StudentHistory["attendance"]["sessions"][number];
type Month = Session["months"][number];

// Attendance for every academic session the student has records in, month by month.
// Clicking a month opens the same calendar used by the monthly class register.
const AttendanceHistoryTab = ({ student, history }: { student: IStudent; history: StudentHistory }) => {
  const [viewing, setViewing] = useState<{ month: Month; session: Session } | null>(null);
  const { overall, sessions } = history.attendance;

  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState title="No attendance recorded yet" description="Attendance will appear here once the class teacher marks it." />
      </Card>
    );
  }

  const columns = (session: Session): TableColumn<Month>[] => [
    { key: "month", label: "Month", render: (m) => <strong>{monthLabel(m.year, m.month)}</strong> },
    { key: "present", label: "Present", render: (m) => m.counts.PRESENT },
    { key: "absent", label: "Absent", render: (m) => m.counts.ABSENT },
    { key: "late", label: "Late", render: (m) => m.counts.LATE },
    { key: "leave", label: "Leave", render: (m) => m.counts.LEAVE },
    { key: "marked", label: "Days Marked" },
    { key: "percentage", label: "Attendance %", render: (m) => <Badge tone={pctTone(m.percentage)}>{formatPct(m.percentage)}</Badge> },
    {
      key: "actions",
      label: "",
      render: (m) => (
        <Button type="button" size="sm" variant="outline" onClick={() => setViewing({ month: m, session })}>
          Calendar
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.tab}>
      <div className={styles.miniStats}>
        <div className={styles.miniStat}>
          <div className={styles.miniValue}>{formatPct(overall.percentage)}</div>
          <div className={styles.muted}>Overall attendance</div>
        </div>
        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((s) => (
          <div key={s} className={styles.miniStat}>
            <div className={styles.miniValue}>{overall.counts[s]}</div>
            <div className={styles.muted}>Total {STATUS_META[s].label.toLowerCase()}</div>
          </div>
        ))}
      </div>

      {sessions.map((session) => (
        <Card
          key={session.sessionId}
          title={`Session ${session.sessionName}`}
          subtitle={`${session.classes.join(", ")} · ${session.totals.marked} days marked`}
          action={<Badge tone={pctTone(session.totals.percentage)}>{formatPct(session.totals.percentage)}</Badge>}
        >
          <Table columns={columns(session)} data={session.months} keyField="month" showPagination={session.months.length > 12} defaultPageSize={12} />
        </Card>
      ))}

      {viewing && (
        <StudentMonthModal
          student={{
            studentId: student.id,
            name: student.name,
            rollNo: student.rollNo,
            admissionNo: student.admissionNo,
            isActive: student.isActive,
            counts: viewing.month.counts,
            days: viewing.month.days,
            marked: viewing.month.marked,
            notMarked: 0,
            percentage: viewing.month.percentage,
          }}
          year={viewing.month.year}
          month={viewing.month.month}
          daysInMonth={new Date(Date.UTC(viewing.month.year, viewing.month.month, 0)).getUTCDate()}
          workingDays={Object.keys(viewing.month.days)}
          className={viewing.session.classes.join(", ")}
          hideProfileLink
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
};

export default AttendanceHistoryTab;
