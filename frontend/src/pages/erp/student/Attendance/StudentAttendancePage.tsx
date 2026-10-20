import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { EmptyState, PageHeader, Spinner } from "../../../../components/ui";
import { useGetStudentAttendanceSummaryQuery } from "../../../../store/api/attendance.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import styles from "./StudentAttendancePage.module.css";

const STATUS: Record<AttendanceStatus, { short: string; label: string; cls: string }> = {
  PRESENT: { short: "P", label: "Present", cls: "present" },
  ABSENT: { short: "A", label: "Absent", cls: "absent" },
  LATE: { short: "L", label: "Late", cls: "late" },
  LEAVE: { short: "Lv", label: "Leave", cls: "leave" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Counts = Record<AttendanceStatus, number>;
const emptyCounts = (): Counts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 });
const markedOf = (c: Counts) => c.PRESENT + c.ABSENT + c.LATE + c.LEAVE;
// Same rule as the school's reports: present days out of days marked.
const pct = (c: Counts) => (markedOf(c) ? Math.round((c.PRESENT / markedOf(c)) * 1000) / 10 : null);
const tone = (p: number | null) => (p === null ? "" : p >= 75 ? styles.good : p >= 50 ? styles.warn : styles.bad);
const pad = (n: number) => String(n).padStart(2, "0");

// Student attendance: overall figures, a month calendar (one coloured cell per school day)
// and a month-by-month summary — how school ERPs show attendance to families.
const StudentAttendancePage = () => {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useGetMyStudentProfileQuery();
  const { data: summary, isLoading, isError } = useGetStudentAttendanceSummaryQuery({ studentId: profile?.id ?? 0 }, { skip: !profile });
  const [month, setMonth] = useState<string | null>(null); // "YYYY-MM"

  useEffect(() => {
    if (profileError) toast.error("Failed to load your profile.");
    if (isError) toast.error("Failed to load your attendance.");
  }, [profileError, isError]);

  // date (YYYY-MM-DD) -> status, plus per-month counts.
  const { byDate, months, overall } = useMemo(() => {
    const byDate = new Map<string, AttendanceStatus>();
    const months = new Map<string, Counts>();
    const overall = emptyCounts();
    for (const r of summary?.records ?? []) {
      const d = r.date.slice(0, 10);
      byDate.set(d, r.status);
      const k = d.slice(0, 7);
      const c = months.get(k) ?? emptyCounts();
      c[r.status]++;
      months.set(k, c);
      overall[r.status]++;
    }
    return { byDate, months, overall };
  }, [summary]);

  const monthKeys = useMemo(() => [...months.keys()].sort(), [months]);
  const active = month && months.has(month) ? month : monthKeys[monthKeys.length - 1];

  if (profileLoading || (profile && isLoading)) {
    return (
      <div>
        <PageHeader title="Attendance" />
        <Spinner />
      </div>
    );
  }

  const subtitle = profile?.classSection ? `${profile.classSection.className} - ${profile.classSection.section}` : undefined;

  if (isError || !summary || summary.total === 0 || !active) {
    return (
      <div>
        <PageHeader title="Attendance" subtitle={subtitle} />
        {isError ? (
          <EmptyState title="Couldn't load attendance" description="Please try refreshing the page." />
        ) : (
          <EmptyState title="No attendance recorded yet" description="Your attendance will appear here once your class teacher marks it." />
        )}
      </div>
    );
  }

  const [y, m] = active.split("-").map(Number);
  const year = y;
  const mon = m - 1;
  const idx = monthKeys.indexOf(active);
  const monthCounts = months.get(active) ?? emptyCounts();
  const monthPct = pct(monthCounts);
  const overallPct = summary.percentage;

  // Calendar cells, weeks starting Monday.
  const first = new Date(year, mon, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, mon + 1, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const cells: Array<{ day: number; key: string; status?: AttendanceStatus; weekday: number } | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => {
      const key = `${year}-${pad(mon + 1)}-${pad(i + 1)}`;
      return { day: i + 1, key, status: byDate.get(key), weekday: (lead + i) % 7 };
    }),
  ];

  return (
    <div className={styles.page}>
      <PageHeader title="Attendance" subtitle={subtitle} />

      {/* Overall */}
      <section className={styles.overview}>
        <div className={styles.ringWrap}>
          <div className={`${styles.ring} ${tone(overallPct)}`} style={{ ["--p" as string]: `${overallPct}` }}>
            <span>{overallPct.toFixed(1)}%</span>
          </div>
          <div>
            <div className={styles.overviewTitle}>Overall attendance</div>
            <div className={styles.muted}>
              {summary.present} of {summary.total} days present
            </div>
            {overallPct < 75 && <div className={styles.warnText}>Below the 75% required — please attend regularly.</div>}
          </div>
        </div>
        <div className={styles.counts}>
          {(Object.keys(STATUS) as AttendanceStatus[]).map((s) => (
            <div key={s} className={`${styles.count} ${styles[STATUS[s].cls]}`}>
              <strong>{overall[s]}</strong>
              <span>{STATUS[s].label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Month calendar */}
      <section className={styles.panel}>
        <header className={styles.calHead}>
          <button type="button" className={styles.navBtn} onClick={() => setMonth(monthKeys[idx - 1])} disabled={idx <= 0} aria-label="Previous month">
            ‹
          </button>
          <div className={styles.calTitle}>
            <strong>
              {MONTHS[mon]} {year}
            </strong>
            <span className={`${styles.monthPct} ${tone(monthPct)}`}>{monthPct === null ? "—" : `${monthPct}%`}</span>
          </div>
          <button type="button" className={styles.navBtn} onClick={() => setMonth(monthKeys[idx + 1])} disabled={idx >= monthKeys.length - 1} aria-label="Next month">
            ›
          </button>
        </header>

        <div className={styles.calendar} role="grid" aria-label={`Attendance for ${MONTHS[mon]} ${year}`}>
          {WEEKDAYS.map((d) => (
            <div key={d} className={`${styles.weekday} ${d === "Sun" ? styles.sunday : ""}`}>
              {d.slice(0, 1)}
              <span className={styles.weekdayRest}>{d.slice(1)}</span>
            </div>
          ))}
          {cells.map((c, i) =>
            c ? (
              <div
                key={c.key}
                role="gridcell"
                className={`${styles.day} ${c.status ? styles[STATUS[c.status].cls] : c.weekday === 6 ? styles.holiday : ""} ${c.key === todayKey ? styles.today : ""}`}
                title={c.status ? `${c.day} ${MONTHS[mon]}: ${STATUS[c.status].label}` : undefined}
              >
                <span className={styles.dayNum}>{c.day}</span>
                {c.status && <span className={styles.dayMark}>{STATUS[c.status].short}</span>}
              </div>
            ) : (
              <div key={`b${i}`} />
            )
          )}
        </div>

        <div className={styles.legend}>
          {(Object.keys(STATUS) as AttendanceStatus[]).map((s) => (
            <span key={s}>
              <i className={styles[STATUS[s].cls]} /> {STATUS[s].label} <b>{monthCounts[s]}</b>
            </span>
          ))}
          <span>
            <i className={styles.blank} /> Not marked / holiday
          </span>
        </div>
      </section>

      {/* Month-wise summary */}
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Month-wise summary</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th>Present</th>
                <th>Absent</th>
                <th className={styles.hideSm}>Late</th>
                <th className={styles.hideSm}>Leave</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {[...monthKeys].reverse().map((k) => {
                const c = months.get(k)!;
                const p = pct(c);
                const [ky, km] = k.split("-").map(Number);
                return (
                  <tr key={k} className={k === active ? styles.rowActive : undefined} onClick={() => setMonth(k)}>
                    <td>
                      <button type="button" className={styles.monthLink}>
                        {MONTHS[km - 1].slice(0, 3)} {ky}
                      </button>
                    </td>
                    <td>{c.PRESENT}</td>
                    <td className={c.ABSENT ? styles.absentText : undefined}>{c.ABSENT}</td>
                    <td className={styles.hideSm}>{c.LATE}</td>
                    <td className={styles.hideSm}>{c.LEAVE}</td>
                    <td>
                      <span className={`${styles.pctPill} ${tone(p)}`}>{p === null ? "—" : `${p}%`}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default StudentAttendancePage;
