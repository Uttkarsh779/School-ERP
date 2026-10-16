import type { ReactNode } from "react";
import { Badge, EmptyState, Spinner } from "../../ui";
import { useGetNoticesQuery } from "../../../store/api/notices.api";
import styles from "./NoticeBoard.module.css";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "For Admins",
  ADMIN: "For Admins",
  TEACHER: "For Teachers",
  STUDENT: "For Students",
  PARENT: "For Parents",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

// A notice's audience badge: a specific class section beats a role (a class-targeted
// notice is for that whole class regardless of role), a role beats nothing, and no
// badge at all means "for everyone" — mirrors the backend's own precedence in
// notices/service.ts (listNoticesForUser).
const audienceLabel = (notice: INotice): string | null => {
  if (notice.targetClassSection) {
    return `${notice.targetClassSection.className} - ${notice.targetClassSection.section}`;
  }
  if (notice.targetRole) {
    return ROLE_LABELS[notice.targetRole] ?? notice.targetRole;
  }
  return null;
};

interface NoticeBoardProps {
  // Rendered after each notice's own content (e.g. an admin's per-notice Delete button).
  // Read-only consumers (teacher/student/parent pages) simply omit this.
  renderActions?: (notice: INotice) => ReactNode;
}

// Reusable, read-only notice list. Renders whatever the backend returns for the calling
// user — role-based visibility filtering already happened server-side (notices/service.ts),
// so this component takes no role-specific props.
const NoticeBoard = ({ renderActions }: NoticeBoardProps) => {
  const { data: notices, isLoading, isError } = useGetNoticesQuery();

  if (isLoading) return <Spinner />;
  if (isError) {
    return <EmptyState title="Couldn't load notices" description="Please try refreshing the page." />;
  }
  if (!notices || notices.length === 0) {
    return <EmptyState title="No notices yet" description="Announcements will appear here once posted." />;
  }

  return (
    <div className={styles.list}>
      {notices.map((notice) => {
        const label = audienceLabel(notice);
        return (
          <div key={notice.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <h3 className={styles.title}>{notice.title}</h3>
              {label && <Badge tone="info">{label}</Badge>}
            </div>
            <p className={styles.body}>{notice.body}</p>
            <div className={styles.footer}>
              <span className={styles.date}>{formatDate(notice.postedAt)}</span>
              {renderActions?.(notice)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default NoticeBoard;
