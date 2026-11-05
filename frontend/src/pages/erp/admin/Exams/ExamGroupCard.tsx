import { useState } from "react";
import { Badge, Button, Icon } from "../../../../components/ui";
import { EXAM_TYPE_LABEL, type PlanGroup } from "../../../../store/api/examPlan.api";
import { classLabelOf, STATUS_LABEL, statusOf } from "./examStatus";
import styles from "./AdminExamsPage.module.css";

// One planned exam on the coordinator's page: a header with where every class stands and the
// actions for all of them, opening onto one row per class.


const shortDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
const hasDateSheet = (e: IExam) => !!e.dateSheet?.entries?.length;
const PAGE = 30;

export interface ExamGroup {
  key: string;
  name: string;
  type: NonNullable<IExam["type"]>;
  term: number;
  marksDeadline: string | null;
  exams: IExam[];
  plan?: PlanGroup;
}

export interface ExamRowActions {
  onProgress: (e: IExam) => void;
  onResults: (e: IExam) => void;
  onMaxMarks: (e: IExam) => void;
  onDateSheet: (e: IExam) => void;
  onLock: (e: IExam) => void;
  onPublish: (e: IExam) => void;
  onDelete: (e: IExam) => void;
}

interface Props extends ExamRowActions {
  group: ExamGroup;
  open: boolean;
  onToggle: () => void;
  coordinator: boolean;
  publisher: boolean;
  lockingId: number | null;
  onEdit: (plan: PlanGroup) => void;
  onLockAll: (exams: IExam[]) => void;
  onPublishAll: (exams: IExam[]) => void;
}

const ExamGroupCard = ({ group, open, onToggle, coordinator, publisher, lockingId, onEdit, onLockAll, onPublishAll, ...row }: Props) => {
  const [shown, setShown] = useState(PAGE);
  const classTests = group.type === "CLASS_TEST";
  const count = group.exams.length;
  const locked = group.exams.filter((e) => e.isLocked).length;
  const published = group.exams.filter((e) => e.resultsPublished).length;
  const ready = group.exams.filter((e) => e.readyAt && !e.isLocked).length;
  const toLock = group.exams.filter((e) => !e.isLocked);
  const toPublish = group.exams.filter((e) => !e.resultsPublished && (e._count?.results ?? 0) > 0);
  const overdue = !!group.marksDeadline && new Date(group.marksDeadline) < new Date() && locked < count;

  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <button type="button" className={styles.groupToggle} aria-expanded={open} onClick={onToggle}>
          <Icon name="chevronRight" size={18} className={open ? styles.groupChevOpen : styles.groupChev} />
          <span className={styles.groupMain}>
            <strong>{classTests ? "Class tests" : group.name}</strong>
            <span className={styles.examMeta}>
              {classTests ? (
                <span>Set by subject teachers · progress only</span>
              ) : (
                <>
                  <span>{EXAM_TYPE_LABEL[group.type]}</span>
                  <span>Term {group.term}</span>
                  {group.marksDeadline && <span className={overdue ? styles.overdue : undefined}>Marks by {shortDate(group.marksDeadline)}</span>}
                </>
              )}
            </span>
          </span>
        </button>
        <div className={styles.groupStats}>
          <span>
            {count} {classTests ? "test" : "class"}
            {count === 1 ? "" : classTests ? "s" : "es"}
          </span>
          {!classTests && ready > 0 && <span className={styles.readyPill}>✓ {ready} ready</span>}
          {!classTests && locked > 0 && <span>{locked} locked</span>}
          {!classTests && published > 0 && <span>{published} published</span>}
        </div>
        {!classTests && (
          <div className={styles.groupActions}>
            {coordinator && group.plan && (
              <button type="button" className={styles.quietBtn} onClick={() => onEdit(group.plan!)}>
                Edit
              </button>
            )}
            {coordinator && toLock.length > 0 && count > 1 && (
              <button type="button" className={styles.quietBtn} onClick={() => onLockAll(toLock)}>
                Lock all
              </button>
            )}
            {publisher && toPublish.length > 0 && count > 1 && (
              <button type="button" className={styles.quietBtn} onClick={() => onPublishAll(toPublish)}>
                Publish all
              </button>
            )}
          </div>
        )}
      </div>

      {open && (
        <ul className={styles.groupRows}>
          {group.exams.slice(0, shown).map((exam) => {
            const status = statusOf(exam);
            const isClassTest = exam.type === "CLASS_TEST";
            const marks = exam._count?.results ?? 0;
            const noPapers = !exam.subjects?.length;
            return (
              <li key={exam.id} className={styles.examRow}>
                <div className={styles.examInfo}>
                  <div className={styles.examTitle}>
                    <strong>{isClassTest ? exam.name : classLabelOf(exam)}</strong>
                    <Badge tone={status === "published" ? "success" : status === "locked" ? "warning" : "info"}>{STATUS_LABEL[status]}</Badge>
                  </div>
                  <div className={styles.examMeta}>
                    {isClassTest && <span className={styles.classPill}>{classLabelOf(exam)}</span>}
                    {exam.testDate && <span>{shortDate(exam.testDate)}</span>}
                    {exam.readyAt && !exam.isLocked && <span className={styles.readyPill}>✓ Class teacher: ready</span>}
                    {!isClassTest && noPapers && <span className={styles.overdue}>No papers set</span>}
                    {!isClassTest && !noPapers && !hasDateSheet(exam) && <span>No date sheet yet</span>}
                  </div>
                </div>
                <div className={styles.examActions}>
                  <div className={styles.quiet}>
                    <button type="button" className={styles.quietBtn} onClick={() => row.onProgress(exam)}>
                      Progress
                    </button>
                    <button type="button" className={styles.quietBtn} onClick={() => row.onResults(exam)}>
                      Results
                    </button>
                    {coordinator && !isClassTest && (
                      <button type="button" className={styles.quietBtn} onClick={() => row.onMaxMarks(exam)}>
                        Max marks
                      </button>
                    )}
                    {coordinator && !isClassTest && (
                      <button type="button" className={styles.quietBtn} onClick={() => row.onDateSheet(exam)}>
                        {exam.admitCard ? "Date sheet & cards" : "Date sheet"}
                      </button>
                    )}
                    {coordinator && !isClassTest && status !== "published" && (
                      <button type="button" className={styles.quietBtn} disabled={lockingId === exam.id} onClick={() => row.onLock(exam)}>
                        {exam.isLocked ? "Unlock" : "Lock"}
                      </button>
                    )}
                    {coordinator && marks === 0 && status !== "published" && (
                      <button type="button" className={styles.quietBtn} onClick={() => row.onDelete(exam)}>
                        Delete
                      </button>
                    )}
                  </div>
                  {publisher && !isClassTest && (
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "published" ? "outline" : "primary"}
                      disabled={status !== "published" && marks === 0}
                      title={status !== "published" && marks === 0 ? "No marks entered yet" : undefined}
                      onClick={() => row.onPublish(exam)}
                    >
                      {status === "published" ? "Unpublish" : "Publish marks"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {group.exams.length > shown && (
            <li className={styles.groupMore}>
              <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({group.exams.length - shown})
              </Button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
};

export default ExamGroupCard;
