import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import { useCreatePlannedExamMutation, useGetExamClassesQuery, useUpdatePlannedExamMutation, type ExamType, type PlanGroup } from "../../../../store/api/examPlan.api";
import styles from "./AdminExamsPage.module.css";

// Exam coordinator: set up a term exam or periodic test once for many classes, or change a
// planned one (name, term, admit cards, marks deadline, add classes). Max marks per subject
// are set afterwards from the exam list.

const PRE = ["nursery", "lkg", "ukg"];
const rank = (c: { className: string; section: string }) => {
  const n = c.className.toLowerCase().replace(/^class\s*/, "");
  const pre = PRE.indexOf(n);
  return (pre >= 0 ? pre - 10 : parseInt(n, 10) || 100) * 100 + c.section.charCodeAt(0);
};
const istDay = (d: string | null) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : "");

const PlanExamModal = ({ group, onClose }: { group?: PlanGroup; onClose: () => void }) => {
  const editing = !!group;
  const { data: classSections } = useGetExamClassesQuery();
  const [create, { isLoading: creating }] = useCreatePlannedExamMutation();
  const [update, { isLoading: updating }] = useUpdatePlannedExamMutation();
  const [name, setName] = useState(group?.name ?? "");
  const [type, setType] = useState<ExamType>(group?.type ?? "TERM_EXAM");
  const [term, setTerm] = useState(String(group?.term ?? 1));
  const [admitCard, setAdmitCard] = useState(group?.admitCard ?? true);
  const kind = group?.type ?? type;
  const [deadline, setDeadline] = useState(istDay(group?.marksDeadline ?? null));
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const already = new Set(group?.exams.map((e) => e.classSectionId) ?? []);
  const classes = useMemo(() => [...(classSections ?? [])].filter((c) => !already.has(c.id)).sort((a, b) => rank(a) - rank(b)), [classSections, group]);
  const toggle = (id: number) => setPicked((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const save = async () => {
    try {
      if (editing) {
        await update({ groupKey: group!.groupKey, name, term: Number(term), admitCard, marksDeadline: deadline || null, addClassSectionIds: [...picked] }).unwrap();
        toast.success("Exam updated");
      } else {
        if (!picked.size) return void toast.error("Pick at least one class");
        const r = await create({ name, type, term: Number(term), admitCard: type === "TERM_EXAM" && admitCard, marksDeadline: deadline || null, classSectionIds: [...picked] }).unwrap();
        toast.success(`${name} set up for ${r.created} class${r.created === 1 ? "" : "es"}. Check the max marks for each subject.`);
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the exam");
    }
  };

  return (
    <Modal title={editing ? `Edit ${group!.name}` : "Plan an exam"} onClose={onClose} size="lg">
      <div className={styles.admitForm}>
        <Input label="Exam name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Half Yearly Examination, Periodic Test 1" />
        <div className={styles.planRow}>
          {!editing && (
            <Select
              label="Type"
              value={type}
              onChange={(e) => {
                const t = e.target.value as ExamType;
                setType(t);
                setAdmitCard(t === "TERM_EXAM");
              }}
              options={[
                { label: "Term exam (Half Yearly / Annual)", value: "TERM_EXAM" },
                { label: "Periodic test", value: "PERIODIC_TEST" },
              ]}
            />
          )}
          <Select label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={[{ label: "Term 1", value: "1" }, { label: "Term 2", value: "2" }]} />
          <Input label="Marks entry deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <p className={styles.admitHint}>
          {kind === "TERM_EXAM"
            ? "The term's written exam; each class can have one per term. In a one-result class (Class 10), the last term exam is the exam and earlier ones count as periodic tests."
            : "Counts towards the term's periodic assessment. Each subject teacher can set their own max marks."}
        </p>
        {kind === "TERM_EXAM" && (
          <label className={styles.checkRow}>
            <input type="checkbox" checked={admitCard} onChange={(e) => setAdmitCard(e.target.checked)} />
            Issue admit cards for this exam
          </label>
        )}

        <div>
          {editing && (
            <p className={styles.admitHint}>
              Set up for {group!.exams.map((e) => `${e.className} - ${e.section}`).join(", ")}.
            </p>
          )}
          <div className={styles.planClassesHead}>
            <span>{editing ? "Add more classes" : "Classes"}</span>
            {classes.length > 0 && (
              <button type="button" className={styles.linkBtn} onClick={() => setPicked(picked.size === classes.length ? new Set() : new Set(classes.map((c) => c.id)))}>
                {picked.size === classes.length ? "Clear" : "Select all"}
              </button>
            )}
          </div>
          {classes.length === 0 ? (
            <p className={styles.admitHint}>{editing ? "Every class already has this exam." : "No classes found."}</p>
          ) : (
            <div className={styles.planClasses}>
              {classes.map((c) => (
                <label key={c.id} className={`${styles.planClass} ${picked.has(c.id) ? styles.planClassOn : ""}`}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  {c.className} - {c.section}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={styles.admitActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} isLoading={creating || updating} disabled={name.trim().length < 2}>
            {editing ? "Save" : picked.size ? `Set up for ${picked.size} class${picked.size === 1 ? "" : "es"}` : "Set up"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PlanExamModal;
