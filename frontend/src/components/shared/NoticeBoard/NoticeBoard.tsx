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

const POSTER_ROLE: Record<string, string> = {
  SUPER_ADMIN: "School office",
  ADMIN: "School office",
  TEACHER: "Teacher",
};

interface NoticeBoardProps {
  // Rendered after each notice's own content (e.g. an admin's per-notice Delete button).
  // Read-only consumers (teacher/student/parent pages) simply omit this.
  renderActions?: (notice: INotice) => ReactNode;
  // Show this list instead of the caller's inbox (e.g. a teacher's "Sent" notices).
  notices?: INotice[];
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

// Reusable, read-only notice list. Renders whatever the backend returns for the calling
// user — role-based visibility filtering already happened server-side (notices/service.ts),
// so this component takes no role-specific props.
const NoticeBoard = ({ renderActions, notices: given, isLoading: givenLoading, emptyTitle, emptyDescription }: NoticeBoardProps) => {
  const inbox = useGetNoticesQuery(undefined, { skip: given !== undefined });
  const notices = given ?? inbox.data;
  const isLoading = given !== undefined ? givenLoading : inbox.isLoading;

  if (isLoading) return <Spinner />;
  if (given === undefined && inbox.isError) {
    return <EmptyState title="Couldn't load notices" description="Please try refreshing the page." />;
  }
  if (!notices || notices.length === 0) {
    return <EmptyState title={emptyTitle ?? "No notices yet"} description={emptyDescription ?? "Announcements will appear here once posted."} />;
  }

  return (
    <div className={styles.list}>
      {notices.map((notice) => {
        const label = audienceLabel(notice);
        return (
          <div key={notice.id} className={`${styles.item} ${notice.isImportant ? styles.important : ""}`}>
            <div className={styles.itemHeader}>
              <h3 className={styles.title}>{notice.title}</h3>
              <div className={styles.badges}>
                {notice.isImportant && <Badge tone="danger">Important</Badge>}
                {label && <Badge tone="info">{label}</Badge>}
              </div>
            </div>
            <p className={styles.body}>{notice.body}</p>
            {notice.attachmentUrl && (
              <a className={styles.attachment} href={notice.attachmentUrl} target="_blank" rel="noopener noreferrer">
                📎 View attachment
              </a>
            )}
            <div className={styles.footer}>
              <span className={styles.date}>
                {formatDate(notice.postedAt)}
                {notice.postedBy && (
                  <>
                    {" · "}
                    {notice.postedBy.name}
                    {POSTER_ROLE[notice.postedBy.role] ? ` (${POSTER_ROLE[notice.postedBy.role]})` : ""}
                  </>
                )}
              </span>
              {renderActions?.(notice)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default NoticeBoard;
