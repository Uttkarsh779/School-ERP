import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, EmptyState, Icon, Input, Spinner } from "../../../../components/ui";
import { useEnterExamResultsMutation, useGetExamResultsQuery, type EnterExamResultInput } from "../../../../store/api/exams.api";
import { isAbsentText } from "../../admin/Exams/marksCell";
import { useGetExamSubjectsQuery, useSaveExamSubjectsMutation } from "../../../../store/api/examPlan.api";
import styles from "./TeacherExams.module.css";

type Student = { id: number; name: string; rollNo: string };

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err && typeof err === "object" && "data" in err ? (err as { data?: { message?: string } }).data?.message : undefined) || fallback;

// Marks for ONE subject, one row per student — built for a phone: a big number box per
// student, an AB (absent) toggle, Enter moves to the next student, and a sticky save bar.
// Max marks are set for the exam: the coordinator's for a term exam; in a periodic test or
// class test the subject teacher decides them here. Only the subject's own teacher reaches this.
const MarksEntry = ({
  exam,
  subject,
  students,
  onDone,
}: {
  exam: IExam;
  subject: { id: number; name: string };
  students: Student[];
  onDone: () => void;
}) => {
  const { data: results, isLoading } = useGetExamResultsQuery(exam.id);
  const { data: examSubjects, isLoading: subjectsLoading } = useGetExamSubjectsQuery(exam.id, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useEnterExamResultsMutation();
  const [saveMax, { isLoading: savingMax }] = useSaveExamSubjectsMutation();
  const subjectRow = examSubjects?.find((s) => s.subjectId === subject.id);
  const canEditMax = !!subjectRow?.canEdit && !exam.isLocked;
  const [max, setMax] = useState("");
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const locked = !!exam.isLocked;

  // Seed from saved marks; the max comes from the exam's subject settings.
  useEffect(() => {
    if (!results) return;
    const seeded: Record<number, string> = {};
    for (const r of results.filter((x) => x.subjectId === subject.id)) seeded[r.studentId] = r.isAbsent ? "AB" : String(r.marksObtained);
    setMarks(seeded);
    setDirty(false);
  }, [results, subject.id]);
  useEffect(() => {
    if (subjectRow) setMax(subjectRow.maxMarks === null ? "" : String(subjectRow.maxMarks));
  }, [subjectRow]);

  const sorted = useMemo(
    () => [...students].sort((a, b) => (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || a.name.localeCompare(b.name)),
    [students]
  );
  const maxNum = Number(max);
  const maxOk = Number.isFinite(maxNum) && maxNum > 0;
  const errorOf = (v: string | undefined) => {
    if (!v || v.trim() === "" || isAbsentText(v)) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return "Enter a number or AB";
    if (n < 0 || (maxOk && n > maxNum)) return `Must be 0–${maxOk ? maxNum : "max"}`;
    return null;
  };
  const filled = sorted.filter((s) => (marks[s.id] ?? "").trim() !== "").length;
  const errors = sorted.filter((s) => errorOf(marks[s.id])).length;

  const setMark = (id: number, v: string) => {
    setMarks((m) => ({ ...m, [id]: v }));
    setDirty(true);
  };
  const focusNext = (index: number) => {
    const next = sorted[index + 1];
    if (next) inputs.current[next.id]?.focus();
    else inputs.current[sorted[index].id]?.blur();
  };

  const submit = async () => {
    if (!maxOk) return toast.error("Enter the maximum marks for this subject first");
    if (errors) return toast.error(`Fix the ${errors} highlighted mark${errors === 1 ? "" : "s"} first`);
    const rows: EnterExamResultInput[] = sorted
      .filter((s) => (marks[s.id] ?? "").trim() !== "")
      .map((s) => {
        const absent = isAbsentText(marks[s.id]);
        return { studentId: s.id, subjectId: subject.id, marksObtained: absent ? 0 : Number(marks[s.id]), maxMarks: maxNum, isAbsent: absent };
      });
    if (!rows.length) return toast.error("Enter at least one student's marks");
    try {
      if (canEditMax && subjectRow && maxNum !== subjectRow.maxMarks) await saveMax({ examId: exam.id, subjects: [{ subjectId: subject.id, maxMarks: maxNum }] }).unwrap();
      const outcomes = await save({ examId: exam.id, results: rows }).unwrap();
      const failed = outcomes.filter((o) => !o.success);
      if (failed.length) toast.error(`${failed.length} mark(s) couldn't be saved: ${failed[0].message}`);
      else {
        toast.success(`${subject.name}: ${rows.length} mark${rows.length === 1 ? "" : "s"} saved`);
        setDirty(false);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the marks"));
    }
  };

  const back = () => {
    if (dirty && !window.confirm("You have unsaved marks. Leave without saving?")) return;
    onDone();
  };

  if (isLoading || subjectsLoading) return <Spinner />;
  if (subjectRow && subjectRow.maxMarks === null) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backBtn} onClick={onDone}>
          <Icon name="arrowLeft" size={16} /> {exam.name}
        </button>
        <EmptyState title={`${subject.name} has no paper in ${exam.name}`} description="The exam coordinator left this subject out of the exam." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={back}>
        <Icon name="arrowLeft" size={16} /> {exam.name}
      </button>
      <div>
        <h1 className={styles.detailTitle}>{subject.name} marks</h1>
        <p className={styles.muted}>
          {exam.name} · {students.length} students
        </p>
      </div>

      {locked && <div className={styles.notice}>Marks are locked{exam.lockedByUser ? ` by ${exam.lockedByUser.name}` : ""}. Ask the exam coordinator to unlock them for a correction.</div>}

      {sorted.length === 0 ? (
        <EmptyState title="No students in this class" description="Students added to the class will appear here." />
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.maxRow}>
              <Input
                label="Maximum marks"
                type="number"
                inputMode="numeric"
                min={1}
                value={max}
                disabled={locked || !canEditMax}
                onChange={(e) => {
                  setMax(e.target.value);
                  setDirty(true);
                }}
              />
              <p className={styles.muted} style={{ margin: 0, flex: 1, minWidth: "12rem" }}>
                {canEditMax ? "You decide this for your subject in this test." : "Set by the exam coordinator."} Tap <b>AB</b> for an absent student; leave a box empty if marks aren&apos;t ready.
              </p>
            </div>
          </section>

          <section className={styles.panel}>
            <ul className={styles.studentList}>
              {sorted.map((s, i) => {
                const v = marks[s.id] ?? "";
                const absent = isAbsentText(v);
                const err = errorOf(v);
                return (
                  <li key={s.id} className={styles.studentRow}>
                    <span className={styles.roll}>{s.rollNo || "—"}</span>
                    <span className={styles.who}>
                      {s.name}
                      {err && <small>{err}</small>}
                    </span>
                    <input
                      ref={(el) => {
                        inputs.current[s.id] = el;
                      }}
                      className={`${styles.markInput} ${err ? styles.markBad : ""}`}
                      inputMode="decimal"
                      enterKeyHint={i === sorted.length - 1 ? "done" : "next"}
                      placeholder="—"
                      aria-label={`${s.name} marks`}
                      value={absent ? "AB" : v}
                      disabled={locked || absent}
                      onChange={(e) => setMark(s.id, e.target.value.replace(/[^0-9.]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusNext(i);
                        }
                      }}
                    />
                    <span className={styles.outOf}>/ {maxOk ? maxNum : "—"}</span>
                    <button
                      type="button"
                      className={`${styles.abBtn} ${absent ? styles.abOn : ""}`}
                      onClick={() => setMark(s.id, absent ? "" : "AB")}
                      disabled={locked}
                      aria-pressed={absent}
                      title="Mark absent"
                    >
                      AB
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {!locked && (
            <div className={styles.saveBar}>
              <span>
                {filled} of {sorted.length} entered{errors ? ` · ${errors} to fix` : ""}
              </span>
              <Button isLoading={saving || savingMax} onClick={submit} disabled={!dirty && filled > 0}>
                {dirty || filled === 0 ? "Save marks" : "Saved"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MarksEntry;
