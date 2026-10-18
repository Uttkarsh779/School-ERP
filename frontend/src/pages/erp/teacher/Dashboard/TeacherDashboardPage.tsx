import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  StatCard,
  Table,
} from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetTeacherDashboardQuery, type TeacherDashboard } from "../../../../store/api/dashboard.api";
import { useGetNoticesQuery } from "../../../../store/api/notices.api";
import { useAppSelector } from "../../../../store/store";
import { formatPct, pctTone } from "../../admin/Attendance/attendanceFormat";
import styles from "./TeacherDashboardPage.module.css";

type ClassRow = NonNullable<TeacherDashboard["classes"]>[number];

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const longToday = () =>
  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// Teacher home: today's schedule and attendance to-dos, class overview, marks-entry
// progress, students needing attention, homework and notices — all from
// GET /dashboard/teacher (scoped to the logged-in teacher) plus the notices feed.
const TeacherDashboardPage = () => {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGetTeacherDashboardQuery();
  const { data: notices, isLoading: isLoadingNotices } = useGetNoticesQuery();

  const header = <PageHeader title={`Welcome, ${user?.name ?? "Teacher"}`} subtitle={`${longToday()} · Here's your day at a glance`} />;

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

  if (!data.hasStaffProfile || !data.summary) {
    return (
      <div className={styles.container}>
        {header}
        <Card>
          <EmptyState
            title="Your staff profile isn't set up yet"
            description="Ask the school administrator to link your login to a staff record."
          />
        </Card>
      </div>
    );
  }

  const { summary } = data;
  const classes = data.classes ?? [];
  const classTeacherClasses = classes.filter((c) => c.isClassTeacher);
  const threshold = data.lowAttendanceThreshold ?? 75;

  const classColumns: TableColumn<ClassRow>[] = [
    { key: "class", label: "Class", render: (c) => <strong>{c.className} - {c.section}</strong> },
    {
      key: "role",
      label: "My Role",
      render: (c) => (c.isClassTeacher ? <Badge tone="primary">Class teacher</Badge> : <Badge tone="neutral">Subject teacher</Badge>),
    },
    { key: "studentCount", label: "Students" },
    {
      key: "month",
      label: "Attendance (this month)",
      render: (c) =>
        !c.isClassTeacher ? (
          <span className={styles.muted}>—</span>
        ) : c.monthAttendancePercentage === null ? (
          <span className={styles.muted}>Not marked yet</span>
        ) : (
          <Badge tone={pctTone(c.monthAttendancePercentage)}>{formatPct(c.monthAttendancePercentage)}</Badge>
        ),
    },
    {
      key: "actions",
      label: "",
      render: (c) => (
        <div className={styles.rowActions}>
          {c.isClassTeacher && (
            <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/teacher/attendance?classSectionId=${c.classSectionId}`)}>
              Attendance
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/teacher/exams?classSectionId=${c.classSectionId}`)}>
            Exams
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {header}

      <div className={styles.statsGrid}>
        <StatCard label="My Classes" value={summary.classCount} icon={<Icon name="layers" />} />
        <StatCard label="Students" value={summary.studentCount} icon={<Icon name="users" />} />
        <StatCard
          label="Attendance marked today"
          value={summary.classTeacherCount > 0 ? `${summary.attendanceMarkedToday} / ${summary.classTeacherCount}` : "—"}
          icon={<Icon name="clipboardCheck" />}
        />
        <StatCard label="Periods today" value={summary.periodsToday} icon={<Icon name="calendar" />} />
      </div>

      <div className={styles.twoCol}>
        <Card
          title="Today's schedule"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/teacher/timetable")}>Full timetable →</Button>}
        >
          {(data.todaySchedule ?? []).length === 0 ? (
            <p className={styles.muted}>No periods scheduled for you today.</p>
          ) : (
            <ul className={styles.list}>
              {data.todaySchedule!.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <span className={styles.periodBadge}>P{p.periodNumber}</span>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>{p.subjectName ?? "Period"}</div>
                    <div className={styles.muted}>
                      {p.className ?? "—"}
                      {p.room && ` · Room ${p.room}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Attendance today" subtitle="Classes where you're the class teacher">
          {classTeacherClasses.length === 0 ? (
            <p className={styles.muted}>You're not the class teacher of any section, so there's no attendance for you to mark.</p>
          ) : (
            <ul className={styles.list}>
              {classTeacherClasses.map((c) => (
                <li key={c.classSectionId} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>
                      {c.className} - {c.section}
                    </div>
                    <div className={styles.muted}>
                      {c.attendanceMarkedToday ? `${c.markedTodayCount} of ${c.studentCount} marked` : `${c.studentCount} students`}
                    </div>
                  </div>
                  {c.attendanceMarkedToday ? <Badge tone="success">Marked</Badge> : <Badge tone="warning">Pending</Badge>}
                  <Button
                    type="button"
                    size="sm"
                    variant={c.attendanceMarkedToday ? "outline" : "primary"}
                    onClick={() => navigate(`/teacher/attendance?classSectionId=${c.classSectionId}`)}
                  >
                    {c.attendanceMarkedToday ? "Review" : "Mark now"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="My classes" subtitle="Classes you teach — as class teacher or subject teacher">
        {classes.length === 0 ? (
          <EmptyState
            title="No classes assigned yet"
            description="You'll see classes here once you're made a class teacher or assigned a subject or timetable period."
          />
        ) : (
          <Table columns={classColumns} data={classes} keyField="classSectionId" showPagination={classes.length > 10} />
        )}
      </Card>

      <div className={styles.twoCol}>
        <Card
          title="Marks entry"
          subtitle="Recent exams · progress for the subjects you can enter"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/teacher/exams")}>All exams →</Button>}
        >
          {(data.exams ?? []).length === 0 ? (
            <p className={styles.muted}>No exams created for your classes yet.</p>
          ) : (
            <ul className={styles.list}>
              {data.exams!.map((e) => {
                const pct = e.expected > 0 ? Math.round((e.entered / e.expected) * 100) : 0;
                const done = e.expected > 0 && e.entered >= e.expected;
                return (
                  <li key={e.examId} className={styles.examItem}>
                    <div className={styles.examTop}>
                      <div className={styles.listMain}>
                        <div className={styles.itemTitle}>{e.name}</div>
                        <div className={styles.muted}>
                          {e.className}
                          {e.sessionName && ` · ${e.sessionName}`}
                        </div>
                      </div>
                      {e.expected === 0 ? (
                        <Badge tone="neutral">No subjects</Badge>
                      ) : done ? (
                        <Badge tone="success">Complete</Badge>
                      ) : (
                        <Badge tone="warning">{e.expected - e.entered} pending</Badge>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/teacher/exams?classSectionId=${e.classSectionId}`)}
                      >
                        Open
                      </Button>
                    </div>
                    {e.expected > 0 && (
                      <div className={styles.progressRow}>
                        <div className={styles.track}>
                          <div className={done ? styles.barDone : styles.bar} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.muted}>
                          {e.entered}/{e.expected}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Students needing attention" subtitle={`Below ${threshold}% attendance this month`}>
          {(data.lowAttendance ?? []).length === 0 ? (
            <p className={styles.muted}>
              {classTeacherClasses.length === 0
                ? "Shown for classes where you're the class teacher."
                : "No students below the threshold this month."}
            </p>
          ) : (
            <ul className={styles.list}>
              {data.lowAttendance!.map((s) => (
                <li key={s.studentId} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>{s.name}</div>
                    <div className={styles.muted}>
                      {s.className} · Roll {s.rollNo} · present {s.present} of {s.marked} days
                    </div>
                  </div>
                  <Badge tone={pctTone(s.percentage)}>{formatPct(s.percentage)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {(data.lowAttendance ?? []).length > 0 && (
            <div className={styles.cardFooter}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => navigate(`/teacher/attendance?classSectionId=${data.lowAttendance![0].classSectionId}&tab=register`)}
              >
                Open monthly register →
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className={styles.twoCol}>
        <Card
          title="Open homework"
          subtitle="Homework you've set that's still visible to students"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/teacher/assignments")}>Manage →</Button>}
        >
          {(data.homework ?? []).length === 0 ? (
            <p className={styles.muted}>No open homework.</p>
          ) : (
            <ul className={styles.list}>
              {data.homework!.map((h) => (
                <li key={h.id} className={styles.listItem}>
                  <div className={styles.listMain}>
                    <div className={styles.itemTitle}>{h.title}</div>
                    <div className={styles.muted}>
                      {[h.className, h.subjectName].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className={styles.due}>Due {formatDay(h.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent announcements"
          action={<Button type="button" size="sm" variant="ghost" onClick={() => navigate("/teacher/notices")}>All notices →</Button>}
        >
          {isLoadingNotices ? (
            <Spinner />
          ) : !notices || notices.length === 0 ? (
            <p className={styles.muted}>No announcements at this time.</p>
          ) : (
            <ul className={styles.list}>
              {notices.slice(0, 4).map((n) => (
                <li key={n.id} className={styles.noticeItem}>
                  <div className={styles.itemTitle}>{n.title}</div>
                  <div className={styles.noticeBody}>{n.body}</div>
                  <div className={styles.muted}>
                    {n.targetClassSection
                      ? `For ${n.targetClassSection.className} - ${n.targetClassSection.section}`
                      : n.targetRole
                      ? `For ${n.targetRole.toLowerCase()}s`
                      : "For everyone"}{" "}
                    · {formatDay(n.postedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
