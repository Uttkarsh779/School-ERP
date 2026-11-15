import { useState } from "react";
import { Badge, Button, Icon } from "../../../../components/ui";
import { EXAM_TYPE_LABEL, type PlanGroup } from "../../../../store/api/examPlan.api";
import { classLabelOf, STATUS_LABEL, statusOf } from "./examStatus";
import styles from "./AdminExamsPage.module.css";
import ui from "./ExamGroupCard.module.css";

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
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const classTests = group.type === "CLASS_TEST";
  const count = group.exams.length;
  const locked = group.exams.filter((e) => e.isLocked).length;
  const published = group.exams.filter((e) => e.resultsPublished).length;
  const ready = group.exams.filter((e) => e.readyAt && !e.isLocked).length;
  const toLock = group.exams.filter((e) => !e.isLocked);
  const toPublish = group.exams.filter((e) => !e.resultsPublished && (e._count?.results ?? 0) > 0);
  const lockedOnly = Math.max(0, locked - published);
  const entering = Math.max(0, count - locked - ready);
  const overdue = !!group.marksDeadline && new Date(group.marksDeadline) < new Date() && locked < count;

  return (
    <section className={styles.group}>
      <div className={ui.head}>
        <button type="button" className={ui.toggle} aria-expanded={open} onClick={onToggle}>
          <Icon name="chevronRight" size={18} className={open ? ui.chevOpen : ui.chev} />
          <span className={ui.titleBlock}>
            <strong>{classTests ? "Class tests" : group.name}</strong>
            <span className={ui.badges}>
              {classTests ? (
                <span className={ui.classTestNote}>Set by subject teachers · not counted in results</span>
              ) : (
                <>
                  <Badge tone={group.type === "TERM_EXAM" ? "primary" : "info"}>{EXAM_TYPE_LABEL[group.type]}</Badge>
                  <Badge tone="neutral">Term {group.term}</Badge>
                  {group.marksDeadline && (
                    <span className={overdue ? ui.deadlineLate : ui.deadline}>
                      <Icon name="calendar" size={13} />
                      {overdue ? "Marks overdue since" : "Marks by"} {shortDate(group.marksDeadline)}
                    </span>
                  )}
                </>
              )}
            </span>
          </span>
        </button>

        {classTests ? (
          <div className={ui.progress}>
            <div className={ui.progressTop}>
              <span>
                <b>{count}</b> test{count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : (
          <div className={ui.progress} aria-label={`${published} of ${count} classes published, ${lockedOnly} locked, ${ready} marked ready`}>
            <div className={ui.progressTop}>
              <span>
                <b>{published}</b> of {count} {count === 1 ? "class" : "classes"} published
              </span>
            </div>
            <div className={ui.bar}>
              <span className={ui.barPublished} style={{ width: `${(published / count) * 100}%` }} />
              <span className={ui.barLocked} style={{ width: `${((lockedOnly) / count) * 100}%` }} />
              <span className={ui.barReady} style={{ width: `${(ready / count) * 100}%` }} />
            </div>
            <div className={ui.legend}>
              {lockedOnly > 0 && (
                <span>
                  <i className={ui.dot} style={{ background: "var(--erp-warning)" }} />
                  {lockedOnly} locked
                </span>
              )}
              {ready > 0 && (
                <span>
                  <i className={ui.dot} style={{ background: "var(--erp-info)" }} />
                  {ready} ready to lock
                </span>
              )}
              {entering > 0 && (
                <span>
                  <i className={ui.dot} style={{ background: "var(--erp-border)" }} />
                  {entering} entering marks
                </span>
              )}
            </div>
          </div>
        )}

        {!classTests ? (
          <div className={ui.actions}>
            {coordinator && group.plan && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(group.plan!)}>
                Edit
              </Button>
            )}
            {coordinator && toLock.length > 0 && count > 1 && (
              <Button size="sm" variant="outline" onClick={() => onLockAll(toLock)}>
                Lock all
              </Button>
            )}
            {publisher && toPublish.length > 0 && count > 1 && (
              <Button size="sm" onClick={() => onPublishAll(toPublish)}>
                Publish all
              </Button>
            )}
          </div>
        ) : (
          <span />
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
                <div className={ui.rowActions}>
                  <>
                    <button type="button" className={ui.rowBtn} onClick={() => row.onProgress(exam)}>
                      Progress
                    </button>
                    <button type="button" className={ui.rowBtn} onClick={() => row.onResults(exam)}>
                      Results
                    </button>
                    {(() => {
                      // Less frequent actions live in a small menu so each row stays calm.
                      const more = [
                        coordinator && !isClassTest && { label: "Max marks", run: () => row.onMaxMarks(exam) },
                        coordinator && !isClassTest && { label: exam.admitCard ? "Date sheet & admit cards" : "Date sheet", run: () => row.onDateSheet(exam) },
                        coordinator && !isClassTest && status !== "published" && { label: exam.isLocked ? "Unlock marks" : "Lock marks", run: () => row.onLock(exam), disabled: lockingId === exam.id },
                        coordinator && marks === 0 && status !== "published" && { label: "Delete", run: () => row.onDelete(exam), danger: true },
                      ].filter(Boolean) as { label: string; run: () => void; disabled?: boolean; danger?: boolean }[];
                      if (!more.length) return null;
                      const isOpen = menuFor === exam.id;
                      return (
                        <span className={ui.menuWrap}>
                          <button
                            type="button"
                            className={ui.rowBtn}
                            aria-haspopup="menu"
                            aria-expanded={isOpen}
                            onClick={() => setMenuFor(isOpen ? null : exam.id)}
                            onBlur={() => setTimeout(() => setMenuFor((m) => (m === exam.id ? null : m)), 150)}
                          >
                            More <Icon name="chevronDown" size={14} />
                          </button>
                          {isOpen && (
                            <span className={ui.menu} role="menu">
                              {more.map((m) => (
                                <button
                                  key={m.label}
                                  type="button"
                                  role="menuitem"
                                  className={m.danger ? ui.menuItemDanger : ui.menuItem}
                                  disabled={m.disabled}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setMenuFor(null);
                                    m.run();
                                  }}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </>
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
