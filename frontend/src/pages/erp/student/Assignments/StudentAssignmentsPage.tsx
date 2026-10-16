import { useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from "../../../../components/ui";
import { useGetAssignmentsQuery } from "../../../../store/api/assignments.api";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import styles from "./StudentAssignmentsPage.module.css";

const formatDate = (isoStr: string) => {
  return new Date(isoStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const StudentAssignmentsPage = () => {
  const [filterSubjectId, setFilterSubjectId] = useState<string>("");
  const { data: profile } = useGetMyStudentProfileQuery();

  const { data: assignments, isLoading } = useGetAssignmentsQuery(
    profile ? { classSectionId: profile.classSectionId } : undefined,
    { skip: !profile }
  );

  const filteredAssignments = (assignments ?? []).filter((item) => {
    if (!filterSubjectId) return true;
    return item.subjectId === Number(filterSubjectId);
  });

  const uniqueSubjectsMap = new Map<number, string>();
  (assignments ?? []).forEach((a) => {
    if (a.subject) {
      uniqueSubjectsMap.set(a.subject.id, a.subject.name);
    }
  });

  const subjectOptions = [
    { label: "All Subjects", value: "" },
    ...Array.from(uniqueSubjectsMap.entries()).map(([id, name]) => ({
      label: name,
      value: id.toString(),
    })),
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title="Homework & Assignments Board"
        subtitle={profile ? `Class ${profile.classSection?.className} - ${profile.classSection?.section} · Active Class Tasks` : "Daily Class Tasks"}
      />

      <div className={styles.filtersRow}>
        <div style={{ minWidth: "220px" }}>
          <Select
            label="Filter by Subject"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
            options={subjectOptions}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !filteredAssignments || filteredAssignments.length === 0 ? (
        <EmptyState
          title="No assignments posted"
          description="Your teachers haven't posted any homework tasks for this filter."
        />
      ) : (
        <div className={styles.assignmentGrid}>
          {filteredAssignments.map((a) => {
            const dueDateObj = new Date(a.dueDate);
            const isOverdue = dueDateObj < new Date();
            const teacherName = a.assignedBy?.user?.name || "Subject Teacher";

            const endDateObj = a.endDate ? new Date(a.endDate) : dueDateObj;

            return (
              <div key={a.id} className={styles.assignmentCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.subjectBadge}>{a.subject?.name || "Subject"}</span>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <span className={`${styles.dueBadge} ${isOverdue ? styles.dueOverdue : styles.dueActive}`}>
                      {isOverdue ? "Past Due" : `Due: ${formatDate(a.dueDate)}`}
                    </span>
                    {a.endDate && (
                      <span style={{ fontSize: "0.74rem", background: "var(--erp-surface-muted, #f1f5f9)", color: "var(--erp-text-muted)", padding: "0.2rem 0.5rem", borderRadius: "999px", border: "1px solid var(--erp-border)" }}>
                        Visible till: {formatDate(a.endDate)}
                      </span>
                    )}
                  </div>
                </div>

                <h3 className={styles.title}>{a.title}</h3>
                <p className={styles.description}>{a.description}</p>

                {a.attachmentUrl && (
                  <div>
                    <a
                      href={a.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.attachmentLink}
                    >
                      📎 Attachment / Reference Material
                    </a>
                  </div>
                )}

                <div className={styles.footer}>
                  <span>Assigned Teacher: <strong>{teacherName}</strong></span>
                  <span>Posted: {formatDate(a.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentAssignmentsPage;
