import { useEffect } from "react";
import { toast } from "react-toastify";
import { PageHeader, StatCard, Card, Badge, Spinner, Icon } from "../../../../components/ui";
import { useGetAdminDashboardQuery } from "../../../../store/api/dashboard.api";
import styles from "./DashboardPage.module.css";

const DashboardPage = () => {
  const { data, isLoading, isError } = useGetAdminDashboardQuery();

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load dashboard data.");
    }
  }, [isError]);

  return (
    <div className={styles.container}>
      <PageHeader title="Dashboard" subtitle="Overview for RRS Intl School" />

      {isLoading ? (
        <Spinner />
      ) : !data ? (
        <Card>
          <p style={{ color: "var(--erp-text-muted)", margin: 0 }}>Dashboard data is currently unavailable.</p>
        </Card>
      ) : (
        <>
          {/* STATS OVERVIEW CARDS */}
          <div className={styles.statsGrid}>
            <StatCard label="Enrolled Students" value={data.studentCount} icon={<Icon name="graduationCap" />} />
            <StatCard label="Teaching & Staff" value={data.staffCount} icon={<Icon name="users" />} />
            <StatCard label="Class Sections" value={data.classSectionCount} icon={<Icon name="layers" />} />
            <StatCard label="Parents Registered" value={data.parentCount} icon={<Icon name="familyCheck" />} />
          </div>

          {/* RECENT ANNOUNCEMENTS */}
          {data.recentNotices && data.recentNotices.length > 0 && (
            <Card title="Recent School Announcements" subtitle="Latest notices published for staff, students, and parents">
              <div className={styles.noticeList}>
                {data.recentNotices.map((n) => (
                  <div key={n.id} className={styles.noticeItem}>
                    <div>
                      <div className={styles.noticeTitle}>{n.title}</div>
                      <div className={styles.noticeBody}>{n.content}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <Badge tone="neutral">{n.targetAudience}</Badge>
                      <span className={styles.noticeMeta}>
                        {new Date(n.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardPage;
