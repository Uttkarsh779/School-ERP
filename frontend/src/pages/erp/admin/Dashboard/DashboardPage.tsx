import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Spinner, StatCard } from "../../../../components/ui";
import BreakdownList from "../../../../components/shared/BreakdownList/BreakdownList";
import { useGetAdminDashboardQuery } from "../../../../store/api/dashboard.api";
import { useAppSelector } from "../../../../store/store";
import { formatPct, pctTone } from "../Attendance/attendanceFormat";
import { MODE_LABEL, fmtDate, inr } from "../Fees/feeUtils";
import SuperAdminInsights from "./SuperAdminInsights";
import styles from "./DashboardPage.module.css";

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const longToday = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// Admin home (ADMIN + SUPER_ADMIN): today at a glance, what needs attention, this month's
// academics and admissions, and notices. Every number comes from GET /dashboard/admin.
const DashboardPage = () => {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const { data, isLoading, isError, refetch } = useGetAdminDashboardQuery();

  const header = (
    <PageHeader
      title={`${greeting()}${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
      subtitle={`${longToday()}${data?.currentSession ? ` · Session ${data.currentSession.name}` : ""}`}
      actions={
        <div className={styles.headerActions}>
          <Button variant="outline" icon={<Icon name="plus" size={16} />} onClick={() => navigate("/admin/students")}>
            Add student
          </Button>
          <Button variant="outline" icon={<Icon name="bell" size={16} />} onClick={() => navigate("/admin/notices")}>
            Post notice
          </Button>
          <Button icon={<Icon name="building" size={16} />} onClick={() => navigate("/admin/fees?tab=collect")}>
            Collect fee
          </Button>
        </div>
      }
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
            title="Couldn't load the dashboard"
            description="Check your connection and try again."
            action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>}
          />
        </Card>
      </div>
    );
  }

  const { attendanceToday: att, attendanceMonth: month, fees, attention } = data;

  // Things that need someone to act, most important first.
  const actions: Array<{ tone: "danger" | "warning" | "info"; title: string; detail?: string; cta: string; to: string }> = [];
  if (attention.noCurrentSession)
    actions.push({ tone: "danger", title: "No current academic session", detail: "Most reports and billing depend on it.", cta: "Set session", to: "/admin/sessions" });
  if (attention.classesWithoutFeeStructure.length)
    actions.push({
      tone: "danger",
      title: `${attention.classesWithoutFeeStructure.length} class(es) have no fee structure`,
      detail: `Fees can't be billed or collected: ${attention.classesWithoutFeeStructure.slice(0, 4).join(", ")}${attention.classesWithoutFeeStructure.length > 4 ? "…" : ""}`,
      cta: "Set up fees",
      to: "/admin/fees?tab=structures",
    });
  if (att.notMarked.length && att.classesTotal)
    actions.push({
      tone: "warning",
      title: `Attendance not marked today in ${att.notMarked.length} of ${att.classesTotal} classes`,
      cta: "View",
      to: "/admin/attendance",
    });
  if (attention.subjectsWithoutTeacher.length)
    actions.push({
      tone: "warning",
      title: `${attention.subjectsWithoutTeacher.length} subject(s) have no allocated teacher`,
      detail: `Nobody can enter their marks: ${attention.subjectsWithoutTeacher.slice(0, 3).join(", ")}${attention.subjectsWithoutTeacher.length > 3 ? "…" : ""}`,
      cta: "Allocate",
      to: "/admin/timetable",
    });
  if (attention.classesWithoutTeacher.length)
    actions.push({
      tone: "warning",
      title: `${attention.classesWithoutTeacher.length} class(es) have no class teacher`,
      detail: "Nobody can mark their attendance.",
      cta: "Assign",
      to: "/admin/class-sections",
    });
  if (attention.pendingRefunds)
    actions.push({ tone: "info", title: `${attention.pendingRefunds} refund request(s) waiting`, cta: "Review", to: "/admin/fees?tab=refunds" });
  if (attention.lateFeeRuleMissing)
    actions.push({ tone: "info", title: "No late-fee rule for this session", detail: "Overdue fees won't attract a late fee.", cta: "Configure", to: "/admin/fees?tab=settings" });

  return (
    <div className={styles.container}>
      {header}

      <div className={styles.statsGrid}>
        <StatCard label="Active students" value={data.studentCount} icon={<Icon name="graduationCap" />} />
        <StatCard label="Staff" value={data.staffCount} icon={<Icon name="users" />} />
        <StatCard label="Class sections" value={data.classSectionCount} icon={<Icon name="layers" />} />
        <StatCard label="Families" value={data.parentCount} icon={<Icon name="familyCheck" />} />
      </div>

      {/* TODAY */}
      <div className={styles.sectionTitle}>Today</div>
      <div className={styles.twoCol}>
        <Card
          title="Attendance today"
          action={<Button size="sm" variant="ghost" onClick={() => navigate("/admin/attendance")}>Reports →</Button>}
        >
          <div className={styles.widgetBody}>
            <div className={styles.miniStatRow}>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>
                  {att.classesMarked}/{att.classesTotal}
                </div>
                <div className={styles.miniStatLabel}>Classes marked</div>
              </div>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>{formatPct(att.presentPercentage)}</div>
                <div className={styles.miniStatLabel}>Present</div>
              </div>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>{att.counts.ABSENT}</div>
                <div className={styles.miniStatLabel}>Absent</div>
              </div>
            </div>
            {att.classesTotal > 0 && (
              <div className={styles.track} aria-label="Classes marked today">
                <div className={styles.bar} style={{ width: `${(att.classesMarked / att.classesTotal) * 100}%` }} />
              </div>
            )}
            {att.notMarked.length > 0 ? (
              <div>
                <div className={styles.widgetSectionTitle}>Not marked yet</div>
                <ul className={styles.chipList}>
                  {att.notMarked.slice(0, 10).map((c) => (
                    <li key={c.classSectionId} className={styles.chip} title={c.classTeacher ? `Class teacher: ${c.classTeacher}` : "No class teacher"}>
                      {c.classSection}
                      <span className={styles.widgetMuted}> · {c.classTeacher ?? "no teacher"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : att.classesTotal > 0 ? (
              <p className={styles.widgetMuted}>Every class has marked attendance today.</p>
            ) : (
              <p className={styles.widgetMuted}>No classes with students in the current session.</p>
            )}
          </div>
        </Card>

        <Card title="Fees" action={<Button size="sm" variant="ghost" onClick={() => navigate("/admin/fees")}>Fee management →</Button>}>
          <div className={styles.widgetBody}>
            <div className={styles.miniStatRow}>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>{inr(fees.collectedToday)}</div>
                <div className={styles.miniStatLabel}>Today ({fees.paymentsToday})</div>
              </div>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>{inr(fees.collectedThisMonth)}</div>
                <div className={styles.miniStatLabel}>This month</div>
              </div>
              <div className={styles.miniStat}>
                <div className={styles.miniStatValue}>{fees.collectionRate === null ? "—" : `${fees.collectionRate}%`}</div>
                <div className={styles.miniStatLabel}>Collection rate</div>
              </div>
            </div>
            <div className={styles.feeLine}>
              <span>
                Outstanding <strong>{inr(fees.outstanding)}</strong>
              </span>
              <span>
                Overdue <strong className={fees.overdue ? styles.danger : undefined}>{inr(fees.overdue)}</strong>
                {fees.defaulterCount > 0 && (
                  <button type="button" className={styles.linkButton} onClick={() => navigate("/admin/fees?tab=dues")}>
                    {fees.defaulterCount} student(s) →
                  </button>
                )}
              </span>
            </div>
            {fees.recentPayments.length > 0 ? (
              <ul className={styles.recentList}>
                {fees.recentPayments.map((p) => (
                  <li key={p.id} className={styles.recentItem}>
                    <div>
                      <div className={styles.noticeTitle}>{p.student.name}</div>
                      <div className={styles.noticeMeta}>
                        {p.student.classSection ?? "—"} · {MODE_LABEL[p.mode] ?? p.mode} · {fmtDate(p.paidAt)}
                      </div>
                    </div>
                    <span className={styles.recentAmount}>{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.widgetMuted}>No payments recorded yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* NEEDS ATTENTION */}
      {actions.length > 0 && (
        <Card title="Needs attention" subtitle="Setup gaps and pending work, most important first">
          <ul className={styles.actionList}>
            {actions.map((a, i) => (
              <li key={i} className={`${styles.actionItem} ${styles[`action_${a.tone}`]}`}>
                <div className={styles.actionText}>
                  <div className={styles.noticeTitle}>{a.title}</div>
                  {a.detail && <div className={styles.noticeMeta}>{a.detail}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(a.to)}>
                  {a.cta}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* THIS MONTH */}
      <div className={styles.sectionTitle}>This month</div>
      <div className={styles.threeCol}>
        <Card title="Attendance" subtitle={`School-wide · classes below ${month.lowThreshold}%`}>
          <div className={styles.widgetBody}>
            <div className={styles.bigNumber}>
              <Badge tone={pctTone(month.percentage)}>{formatPct(month.percentage)}</Badge>
              <span className={styles.widgetMuted}>present this month</span>
            </div>
            {month.lowClasses.length > 0 ? (
              <BreakdownList
                items={month.lowClasses.map((c) => ({ label: c.classSection, value: c.percentage ?? 0, display: formatPct(c.percentage) }))}
              />
            ) : (
              <p className={styles.widgetMuted}>{month.percentage === null ? "No attendance marked this month yet." : "No class is below the threshold."}</p>
            )}
          </div>
        </Card>

        <Card title="Exams & marks" action={<Button size="sm" variant="ghost" onClick={() => navigate("/admin/exams")}>Exams →</Button>}>
          {data.exams.length === 0 ? (
            <p className={styles.widgetMuted}>No exams created in this session yet.</p>
          ) : (
            <ul className={styles.recentList}>
              {data.exams.map((e) => {
                const pct = e.expected > 0 ? Math.round((e.entered / e.expected) * 100) : 0;
                return (
                  <li key={e.examId} className={styles.examItem}>
                    <div className={styles.examTop}>
                      <div>
                        <div className={styles.noticeTitle}>{e.name}</div>
                        <div className={styles.noticeMeta}>{e.classSection}</div>
                      </div>
                      {e.isLocked ? <Badge tone="neutral">Locked</Badge> : pct >= 100 ? <Badge tone="success">Complete</Badge> : <Badge tone="warning">{pct}%</Badge>}
                    </div>
                    {e.expected > 0 && (
                      <div className={styles.track}>
                        <div className={styles.bar} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Admissions" action={<Button size="sm" variant="ghost" onClick={() => navigate("/admin/students")}>Students →</Button>}>
          <div className={styles.widgetBody}>
            <div className={styles.bigNumber}>
              <strong>{data.admissions.newThisMonth}</strong>
              <span className={styles.widgetMuted}>new this month</span>
            </div>
            {data.admissions.recent.length > 0 && (
              <ul className={styles.recentList}>
                {data.admissions.recent.map((s) => (
                  <li key={s.id} className={styles.recentItem}>
                    <div>
                      <button type="button" className={styles.linkButton} onClick={() => navigate(`/admin/students/${s.id}`)}>
                        {s.name}
                      </button>
                      <div className={styles.noticeMeta}>
                        {s.classSection ?? "—"} · {s.admissionNo}
                      </div>
                    </div>
                    <span className={styles.noticeMeta}>{fmtDate(s.date)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.birthdays.length > 0 && (
              <div>
                <div className={styles.widgetSectionTitle}>🎂 Birthdays today</div>
                <ul className={styles.chipList}>
                  {data.birthdays.map((b) => (
                    <li key={b.id} className={styles.chip}>
                      {b.name}
                      {b.classSection && <span className={styles.widgetMuted}> · {b.classSection}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* SUPER ADMIN ONLY */}
      {isSuperAdmin && (
        <>
          <div className={styles.sectionTitle}>Management</div>
          <SuperAdminInsights />
        </>
      )}

      {/* NOTICES */}
      <Card
        title="Recent announcements"
        action={<Button size="sm" variant="ghost" onClick={() => navigate("/admin/notices")}>All notices →</Button>}
      >
        {!data.recentNotices || data.recentNotices.length === 0 ? (
          <p className={styles.widgetMuted}>No notices posted yet.</p>
        ) : (
          <div className={styles.noticeList}>
            {data.recentNotices.map((n) => (
              <div key={n.id} className={styles.noticeItem}>
                <div>
                  <div className={styles.noticeTitle}>{n.title}</div>
                  <div className={styles.noticeBody}>{n.content}</div>
                </div>
                <div className={styles.noticeSide}>
                  <Badge tone="neutral">{n.targetAudience === "ALL" ? "Everyone" : n.targetAudience}</Badge>
                  <span className={styles.noticeMeta}>{fmtDate(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;
