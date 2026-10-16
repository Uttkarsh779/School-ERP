import { useMemo, useState } from "react";
import { Select, Input } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import styles from "./ChildPicker.module.css";

interface ChildPickerProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Student ids to hide from the pickable list (e.g. already linked to this parent). */
  excludeIds?: number[];
}

/**
 * Multi-select control for choosing 0, 1, or many students to link to a
 * parent account. Shows selected children as removable chips, with a class
 * filter + name/roll search to narrow down the checkbox list below.
 */
const ChildPicker = ({ selectedIds, onChange, excludeIds = [] }: ChildPickerProps) => {
  const { data: classSections } = useGetClassSectionsQuery();
  const { data: students, isLoading } = useGetStudentsQuery();
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const classLabel = (classSectionId: number) => {
    const cs = classSections?.find((c) => c.id === classSectionId);
    return cs ? `${cs.className} - ${cs.section}` : "";
  };

  const selectedStudents = useMemo(
    () => (students ?? []).filter((s) => selectedIds.includes(s.id)),
    [students, selectedIds]
  );

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (students ?? [])
      .filter((s) => !excludeSet.has(s.id))
      .filter((s) => (classFilter ? String(s.classSectionId) === classFilter : true))
      .filter(
        (s) => !term || s.name.toLowerCase().includes(term) || s.rollNo.toLowerCase().includes(term)
      );
  }, [students, excludeSet, classFilter, search]);

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((existing) => existing !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className={styles.wrapper}>
      {selectedStudents.length > 0 && (
        <div className={styles.chips}>
          {selectedStudents.map((s) => (
            <span key={s.id} className={styles.chip}>
              {s.name} ({s.rollNo})
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => toggle(s.id)}
                aria-label={`Remove ${s.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.filters}>
        <Select
          name="childPickerClassFilter"
          placeholder="All classes"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          options={(classSections ?? []).map((c) => ({
            label: `${c.className} - ${c.section}`,
            value: c.id,
          }))}
        />
        <Input
          name="childPickerSearch"
          placeholder="Search by name or roll no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.list}>
        {isLoading ? (
          <p className={styles.empty}>Loading students…</p>
        ) : visibleStudents.length === 0 ? (
          <p className={styles.empty}>No matching students.</p>
        ) : (
          visibleStudents.map((s) => (
            <label key={s.id} className={styles.row}>
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span className={styles.rowName}>{s.name}</span>
              <span className={styles.rowMeta}>
                Roll {s.rollNo} · {classLabel(s.classSectionId)}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

export default ChildPicker;
