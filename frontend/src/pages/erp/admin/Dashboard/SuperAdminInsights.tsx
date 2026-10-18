import { useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "../../../../components/ui";
import BreakdownList from "../../../../components/shared/BreakdownList/BreakdownList";
import { useGetAdmissionOverviewQuery } from "../../../../store/api/admissionReport.api";
import { useGetConstructionSummaryQuery } from "../../../../store/api/construction.api";
import { CATEGORY_LABEL, formatDay, formatINR } from "../Construction/constructionFormat";
import styles from "./DashboardPage.module.css";

const ENQUIRY_LABEL: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ADMITTED: "Admitted",
  REJECTED: "Rejected",
};

const MiniStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className={styles.miniStat}>
    <div className={styles.miniStatValue}>{value}</div>
    <div className={styles.miniStatLabel}>{label}</div>
  </div>
);

const Unavailable = () => <p className={styles.widgetMuted}>This summary couldn't be loaded right now.</p>;

// SUPER_ADMIN-only dashboard section. DashboardPage only mounts this for SUPER_ADMIN, so
// these queries are never fired for ADMIN — and the APIs themselves return 403 to anyone
// else regardless.
const SuperAdminInsights = () => {
  const navigate = useNavigate();
  const admissions = useGetAdmissionOverviewQuery();
  const construction = useGetConstructionSummaryQuery();

  const a = admissions.data;
  const c = construction.data;

  return (
    <div className={styles.insightsGrid}>
      <Card
        title="Admissions Overview"
        subtitle={a?.currentSession ? `Academic session ${a.currentSession.name}` : "No current session set"}
        action={
          <Button type="button" size="sm" variant="ghost" onClick={() => navigate("/admin/admission-report")}>
            View report →
          </Button>
        }
        className={styles.insightCard}
      >
        {admissions.isLoading ? (
          <Spinner />
        ) : admissions.isError || !a ? (
          <Unavailable />
        ) : (
          <div className={styles.widgetBody}>
            <div className={styles.miniStatRow}>
              <MiniStat label="This Session" value={a.currentSessionAdmissions} />
              <MiniStat label="This Month" value={a.currentMonthAdmissions} />
              <MiniStat label="Active Students" value={a.activeStudents} />
            </div>
            <div>
              <div className={styles.widgetSectionTitle}>Session admissions by gender</div>
              <BreakdownList
                items={[
                  { label: "Boys", value: a.currentSessionByGender.MALE ?? 0 },
                  { label: "Girls", value: a.currentSessionByGender.FEMALE ?? 0 },
                  ...(a.currentSessionByGender.OTHER ? [{ label: "Other", value: a.currentSessionByGender.OTHER }] : []),
                  ...(a.currentSessionByGender.UNSPECIFIED
                    ? [{ label: "Not recorded", value: a.currentSessionByGender.UNSPECIFIED }]
                    : []),
                ]}
                emptyMessage="No admissions recorded this session yet"
              />
            </div>
            {a.enquiries && (
              <div>
                <div className={styles.widgetSectionTitle}>Website admission enquiries</div>
                <BreakdownList
                  items={Object.entries(a.enquiries).map(([status, count]) => ({
                    label: ENQUIRY_LABEL[status] ?? status,
                    value: count,
                  }))}
                  emptyMessage="No enquiries received yet"
                />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Construction Expenditure"
        subtitle="Building & construction projects"
        action={
          <Button type="button" size="sm" variant="ghost" onClick={() => navigate("/admin/construction")}>
            View expenses →
          </Button>
        }
        className={styles.insightCard}
      >
        {construction.isLoading ? (
          <Spinner />
        ) : construction.isError || !c ? (
          <Unavailable />
        ) : (
          <div className={styles.widgetBody}>
            <div className={styles.miniStatRow}>
              <MiniStat label="Total Spent" value={formatINR(c.totalAmount)} />
              <MiniStat label="This Month" value={formatINR(c.currentMonthAmount)} />
              <MiniStat label="Entries" value={c.entryCount} />
            </div>
            <div>
              <div className={styles.widgetSectionTitle}>Top categories</div>
              <BreakdownList
                items={c.byCategory.slice(0, 4).map((cat) => ({
                  label: CATEGORY_LABEL[cat.category],
                  value: Number(cat.amount),
                  display: formatINR(cat.amount),
                }))}
                emptyMessage="No construction expenses recorded yet"
              />
            </div>
            {c.recent.length > 0 && (
              <div>
                <div className={styles.widgetSectionTitle}>Recent expenses</div>
                <ul className={styles.recentList}>
                  {c.recent.slice(0, 3).map((r) => (
                    <li key={r.id} className={styles.recentItem}>
                      <div>
                        <div className={styles.noticeTitle}>{r.title}</div>
                        <div className={styles.noticeMeta}>
                          {r.project.name} · {formatDay(r.expenseDate)}
                        </div>
                      </div>
                      <span className={styles.recentAmount}>{formatINR(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SuperAdminInsights;
