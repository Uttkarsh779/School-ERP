import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  StatCard,
} from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetNoticesQuery } from "../../../../store/api/notices.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./TeacherDashboardPage.module.css";

const formatDate = (isoString?: string) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
};

const TeacherDashboardPage = () => {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  const { data: classSections, isLoading: isLoadingClasses, isError: isClassesError } = useGetMyClassSectionsQuery();
  const { data: notices, isLoading: isLoadingNotices } = useGetNoticesQuery();

  useEffect(() => {
    if (isClassesError) {
      toast.error("Failed to load your assigned class sections.");
    }
  }, [isClassesError]);

  const totalStudents = (classSections ?? []).reduce(
    (sum, sec) => sum + (sec._count?.students || 0),
    0
  );

  const goToAttendance = (classSectionId: number) => {
    navigate(`/teacher/attendance?classSectionId=${classSectionId}`);
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title={`Welcome, ${user?.name ?? "Teacher"}`}
        subtitle="RRS International School — Teacher Portal Overview & Daily Actions"
      />

      {/* Top Stats Overview Grid */}
      <div className={styles.statsGrid}>
        <StatCard
          title="Assigned Classes"
          value={classSections?.length || 0}
          icon={<Icon name="building" />}
        />
        <StatCard
          title="Total Students"
          value={totalStudents}
          icon={<Icon name="users" />}
        />
        <StatCard
          title="Today's Attendance"
          value="Ready"
          icon={<Icon name="clipboardCheck" />}
        />
        <StatCard
          title="Active Bulletins"
          value={notices?.length || 0}
          icon={<Icon name="bell" />}
        />
      </div>

      {/* Main Dashboard Layout */}
      <div className={styles.mainGrid}>
        {/* Left Column: Assigned Class Sections */}
        <div>
          <Card title="My Assigned Class Sections">
            {isLoadingClasses ? (
              <Spinner />
            ) : isClassesError ? (
              <EmptyState title="Couldn't load your classes" description="Please try refreshing the page." />
            ) : !classSections || classSections.length === 0 ? (
              <EmptyState
                title="No class assigned yet"
                description="You haven't been assigned as a class teacher for any section. Please contact the school administrator if you believe this is a mistake."
              />
            ) : (
              <div className={styles.classesGrid}>
                {classSections.map((section) => {
                  const studentCount = section._count?.students ?? 0;
                  return (
                    <Card
                      key={section.id}
                      title={`${section.className} - ${section.section}`}
                      subtitle={`${studentCount} student${studentCount === 1 ? "" : "s"} enrolled`}
                    >
                      <p className={styles.cardHint}>
                        Mark or review daily attendance and student records for this section.
                      </p>

                      <div className={styles.actionsGroup}>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Icon name="clipboardCheck" size={16} />}
                          onClick={() => goToAttendance(section.id)}
                          fullWidth
                        >
                          Mark Attendance
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Quick Actions & Announcements */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Quick Shortcuts */}
          <Card title="Quick Actions">
            <div className={styles.quickLinkList}>
              <button
                type="button"
                className={styles.quickLinkBtn}
                onClick={() => navigate("/teacher/attendance")}
              >
                <Icon name="clipboardCheck" size={18} />
                <span>Mark Attendance</span>
              </button>

              <button
                type="button"
                className={styles.quickLinkBtn}
                onClick={() => navigate("/teacher/timetable")}
              >
                <Icon name="calendar" size={18} />
                <span>View Class Timetable</span>
              </button>

              <button
                type="button"
                className={styles.quickLinkBtn}
                onClick={() => navigate("/teacher/notices")}
              >
                <Icon name="bell" size={18} />
                <span>School Announcements</span>
              </button>

              <button
                type="button"
                className={styles.quickLinkBtn}
                onClick={() => navigate("/teacher/exams")}
              >
                <Icon name="layers" size={18} />
                <span>Exams &amp; Grading</span>
              </button>
            </div>
          </Card>

          {/* Announcements & Bulletins */}
          <Card title="Recent Announcements">
            {isLoadingNotices ? (
              <Spinner />
            ) : !notices || notices.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)", padding: "0.5rem 0" }}>
                No active announcements at this time.
              </div>
            ) : (
              <div className={styles.noticeList}>
                {notices.slice(0, 4).map((notice) => (
                  <div key={notice.id} className={styles.noticeItem}>
                    <div className={styles.noticeTitle}>{notice.title}</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--erp-text)", margin: "0.2rem 0 0.4rem" }}>
                      {notice.body}
                    </div>
                    <div className={styles.noticeMeta}>
                      <span>Target: {notice.targetRole || "All"}</span>
                      {notice.createdAt && <span>{formatDate(notice.createdAt)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboardPage;
