import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner, StatCard } from "../../../../components/ui";
import { useGetStudentDashboardQuery } from "../../../../store/api/dashboard.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import { useGetNoticesQuery } from "../../../../store/api/notices.api";
import { STATUS_META, formatPct } from "../../admin/Attendance/attendanceFormat";
import styles from "./StudentDashboardPage.module.css";

const RESULT_META: Record<string, { label: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }> = {
  PASS: { label: "Pass", tone: "success" },
  FAIL: { label: "Needs improvement", tone: "danger" },
  ABSENT: { label: "Absent", tone: "warning" },
  PENDING: { label: "Marks pending", tone: "info" },
  NOT_ENTERED: { label: "Not entered", tone: "neutral" },
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const shortDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longToday = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// Student home: today's classes, attendance, fees, homework, latest result and notices.
// Data: GET /dashboard/student (always the logged-in student's own data) + /students/me + notices.
const StudentDashboardPage = () => {
  const navigate = useNavigate();
  const { data: profile } = useGetMyStudentProfileQuery();
  const { data, isLoading, isError, refetch } = useGetStudentDashboardQuery();
  const { data: notices, isLoading: noticesLoading } = useGetNoticesQuery();

  const firstName = profile?.name?.split(" ")[0];
  const header = (
    <PageHeader
      title={`Hello${firstName ? `, ${firstName}` : ""}`}
      subtitle={`${longToday()}${profile?.classSection ? ` · ${profile.classSection.className} - ${profile.classSection.section}` : ""}`}
    />
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        {header}
        <Spinner />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className={styles.container}>
        {header}
        <Card>
          <EmptyState
            title="Couldn't load your dashboard"
            description="Check your connection and try again."
            action={<Button type="button" variant="outline" onClick={() => refetch()}>Retry</Button>}
          />
        </Card>
      </div>
    );
  }
  if (!data.hasStudentProfile || !data.attendance) {
    return (
      <div className={styles.container}>
        {header}
        <Card>
          <EmptyState title="Your student record isn't linked yet" description="Please contact the school office." />
        </Card>
      </div>
    );
  }

  const { attendance, fees, latestResult } = data;
  const extras = data.profileExtras;

  return (
    <div className={styles.container}>
      {header}

      {/* Identity strip */}
      {profile && (
        <Card>
          <div className={styles.identity}>
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt="" className={styles.photo} />
            ) : (
              <div className={styles.avatar}>{profile.name.charAt(0).toUpperCase()}</div>
            )}
            <div className={styles.identityMain}>
              <div className={styles.name}>{profile.name}</div>
              <div className={styles.muted}>
                Adm. No {profile.admissionNo} · Roll No {profile.rollNo}
                {extras?.sessionName && ` · Session ${extras.sessionName}`}
                {extras?.classTeacherName && ` · Class teacher: ${extras.classTeacherName}`}
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate("/student/profile")}>
              View profile
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.statsGrid}>
        <StatCard label="Attendance this month" value={formatPct(attendance.month.percentage)} icon={<Icon name="clipboardCheck" />} />
        <StatCard label="Overall attendance" value={formatPct(attendance.overall.percentage)} icon={<Icon name="calendar" />} />
        <StatCard label="Fees due" value={fees ? inr(fees.totalOutstanding) : "—"} icon={<Icon name="building" />} />
        <StatCard label="Homework open" value={(data.homework ?? []).length} icon={<Icon name="fileText" />} />
      </div>

      <div className={styles.twoCol}>
        <Card
          title="Today's classes"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/timetable")}>Timetable →</Button>}
        >
          {(data.todaySchedule ?? []).length === 0 ? (
            <p className={styles.muted}>No classes scheduled today.</p>
          ) : (
            <ul className={styles.list}>
              {data.todaySchedule!.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <span className={styles.periodBadge}>P{p.periodNumber}</span>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>{p.subjectName ?? "Period"}</div>
                    <div className={styles.muted}>
                      {p.teacherName ?? "Teacher not set"}
                      {p.room && ` · Room ${p.room}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="My attendance"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/attendance")}>Details →</Button>}
        >
          {attendance.overall.marked === 0 ? (
            <p className={styles.muted}>No attendance recorded yet.</p>
          ) : (
            <>
              <div className={styles.countRow}>
                {(Object.keys(STATUS_META) as AttendanceStatus[]).map((s) => (
                  <div key={s} className={styles.countBox}>
                    <div className={styles.countValue}>{attendance.month[s]}</div>
                    <div className={styles.muted}>{STATUS_META[s].label}</div>
                  </div>
                ))}
              </div>
              <div className={styles.sectionLabel}>Recent days</div>
              <div className={styles.recentStrip}>
                {attendance.recent.map((r) => (
                  <span key={r.date} className={`${styles.dayChip} ${styles[`day_${r.status}`]}`} title={`${shortDay(r.date)} · ${STATUS_META[r.status].label}`}>
                    <span className={styles.dayDate}>{shortDay(r.date).split(",")[0]}</span>
                    {STATUS_META[r.status].short}
                  </span>
                ))}
              </div>
              {attendance.month.percentage !== null && attendance.month.percentage < 75 && (
                <p className={styles.warnNote}>Your attendance this month is below 75%. Please speak to your class teacher.</p>
              )}
            </>
          )}
        </Card>
      </div>

      <div className={styles.twoCol}>
        <Card
          title="Latest result"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/report-card")}>Report card →</Button>}
        >
          {!latestResult ? (
            <p className={styles.muted}>No exam results yet.</p>
          ) : (
            <div className={styles.result}>
              <div className={styles.resultTop}>
                <div>
                  <div className={styles.itemTitle}>{latestResult.examName}</div>
                  <div className={styles.muted}>{latestResult.isFinal ? "Final result" : "Provisional — marks may still change"}</div>
                </div>
                <Badge tone={RESULT_META[latestResult.status]?.tone ?? "neutral"}>{RESULT_META[latestResult.status]?.label ?? latestResult.status}</Badge>
              </div>
              <div className={styles.resultStats}>
                <div>
                  <div className={styles.bigValue}>{formatPct(latestResult.percentage)}</div>
                  <div className={styles.muted}>
                    {latestResult.total} / {latestResult.maxTotal} marks
                  </div>
                </div>
                {latestResult.rank && (
                  <div>
                    <div className={styles.bigValue}>#{latestResult.rank}</div>
                    <div className={styles.muted}>Class rank of {latestResult.rankedCount}</div>
                  </div>
                )}
              </div>
              {latestResult.failedSubjects.length > 0 && (
                <p className={styles.warnNote}>Needs attention in: {latestResult.failedSubjects.join(", ")}</p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Fees"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/fees")}>Pay / details →</Button>}
        >
          {!fees ? (
            <p className={styles.muted}>Fee details are unavailable right now — open the Fees page.</p>
          ) : fees.totalOutstanding <= 0 ? (
            <div className={styles.listItem}>
              <div className={styles.listMain}>
                <div className={styles.itemTitle}>All fees are paid</div>
                {fees.totalAdvanceAvailable > 0 && <div className={styles.muted}>Advance balance: {inr(fees.totalAdvanceAvailable)}</div>}
              </div>
              <Badge tone="success">Paid up</Badge>
            </div>
          ) : (
            <ul className={styles.list}>
              <li className={styles.listItem}>
                <div className={styles.listMain}>
                  <div className={styles.itemTitle}>{inr(fees.totalOutstanding)} outstanding</div>
                  <div className={styles.muted}>
                    {fees.overdueCount > 0 ? `${fees.overdueCount} item${fees.overdueCount === 1 ? "" : "s"} overdue` : "Nothing overdue"}
                  </div>
                </div>
                {fees.overdueCount > 0 ? <Badge tone="danger">Overdue</Badge> : <Badge tone="warning">Due</Badge>}
              </li>
              {fees.nextDue && (
                <li className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>Next: {fees.nextDue.label}</div>
                    <div className={styles.muted}>Due {day(fees.nextDue.dueDate)}</div>
                  </div>
                  <span className={styles.amount}>{inr(fees.nextDue.amount)}</span>
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <div className={styles.twoCol}>
        <Card
          title="Homework"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/assignments")}>All homework →</Button>}
        >
          {(data.homework ?? []).length === 0 ? (
            <p className={styles.muted}>No open homework. 🎉</p>
          ) : (
            <ul className={styles.list}>
              {data.homework!.map((h) => {
                const overdue = new Date(h.dueDate) < new Date(new Date().toDateString());
                return (
                  <li key={h.id} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <div className={styles.itemTitle}>{h.title}</div>
                      <div className={styles.muted}>{h.subjectName ?? "—"}</div>
                    </div>
                    <span className={overdue ? styles.dueLate : styles.due}>Due {day(h.dueDate)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Notices"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/student/notices")}>All notices →</Button>}
        >
          {noticesLoading ? (
            <Spinner />
          ) : !notices || notices.length === 0 ? (
            <p className={styles.muted}>No notices right now.</p>
          ) : (
            <ul className={styles.list}>
              {notices.slice(0, 4).map((n) => (
                <li key={n.id} className={styles.noticeItem}>
                  <div className={styles.itemTitle}>{n.title}</div>
                  <div className={styles.noticeBody}>{n.body}</div>
                  <div className={styles.muted}>{day(n.postedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default StudentDashboardPage;
