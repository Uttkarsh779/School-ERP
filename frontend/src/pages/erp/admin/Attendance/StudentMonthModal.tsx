import { useNavigate } from "react-router-dom";
import { Badge, Button, Modal } from "../../../../components/ui";
import { useAppSelector } from "../../../../store/store";
import type { AttendanceRegisterStudent } from "../../../../store/api/attendance.api";
import { STATUS_META, dayKey, formatDayKey, formatPct, monthLabel, pctTone, weekday } from "./attendanceFormat";
import styles from "./MonthlyReport.module.css";

interface StudentMonthModalProps {
  student: AttendanceRegisterStudent;
  year: number;
  month: number;
  daysInMonth: number;
  workingDays: string[];
  className: string;
  onClose: () => void;
  hideProfileLink?: boolean; // already on the student's profile page
}

const CALENDAR_HEAD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// One student's month as a calendar, plus the exact dates they were absent / on leave / late.
const StudentMonthModal = ({ student, year, month, daysInMonth, workingDays, className, onClose, hideProfileLink }: StudentMonthModalProps) => {
  const navigate = useNavigate();
  // The student profile page lives under /admin — only link to it for admins.
  const role = useAppSelector((state) => state.auth.user?.role);
  const canOpenProfile = !hideProfileLink && (role === "SUPER_ADMIN" || role === "ADMIN");
  const working = new Set(workingDays);
  // Monday-first calendar: leading blanks before the 1st.
  const leading = (weekday(year, month, 1) + 6) % 7;
  const cells: Array<number | null> = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const datesWith = (status: AttendanceStatus) =>
    Object.entries(student.days)
      .filter(([, s]) => s === status)
      .map(([key]) => key)
      .sort();

  return (
    <Modal title={`${student.name} · ${monthLabel(year, month)}`} size="lg" onClose={onClose}>
      <div className={styles.studentHeader}>
        <div className={styles.muted}>
          {className} · Roll No {student.rollNo} · Adm. No {student.admissionNo}
        </div>
        <Badge tone={pctTone(student.percentage)}>{formatPct(student.percentage)} attendance</Badge>
      </div>

      <div className={styles.countRow}>
        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((status) => (
          <div key={status} className={styles.countBox}>
            <div className={styles.countValue}>{student.counts[status]}</div>
            <div className={styles.muted}>{STATUS_META[status].label}</div>
          </div>
        ))}
        <div className={styles.countBox}>
          <div className={styles.countValue}>{student.notMarked}</div>
          <div className={styles.muted}>Not marked</div>
        </div>
      </div>

      <div className={styles.calendar}>
        {CALENDAR_HEAD.map((d) => (
          <div key={d} className={styles.calendarHead}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const key = dayKey(year, month, day);
          const status = student.days[key];
          const cls = status ? styles[`cal_${status}`] : working.has(key) ? styles.calUnmarked : styles.calOff;
          return (
            <div key={key} className={`${styles.calendarDay} ${cls}`} title={status ? STATUS_META[status].label : working.has(key) ? "Not marked" : "No attendance taken"}>
              <span>{day}</span>
              {status && <span className={styles.calStatus}>{STATUS_META[status].short}</span>}
            </div>
          );
        })}
      </div>

      <dl className={styles.dateLists}>
        {(["ABSENT", "LEAVE", "LATE"] as AttendanceStatus[]).map((status) => {
          const dates = datesWith(status);
          return (
            <div key={status}>
              <dt>{STATUS_META[status].label} on</dt>
              <dd>{dates.length ? dates.map(formatDayKey).join(", ") : "—"}</dd>
            </div>
          );
        })}
      </dl>

      <div className={styles.modalActions}>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {canOpenProfile && (
          <Button type="button" onClick={() => navigate(`/admin/students/${student.studentId}`)}>
            Open student profile →
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default StudentMonthModal;
