import styles from "./TimetableGrid.module.css";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface TimetableGridProps {
  slots: ITimetableSlot[];
  periodCount?: number;
  editable?: boolean;
  onCellClick?: (dayOfWeek: number, periodNumber: number, slot?: ITimetableSlot) => void;
  showClassName?: boolean;
}

const TimetableGrid = ({ slots, periodCount = 8, editable = false, onCellClick, showClassName = false }: TimetableGridProps) => {
  const findSlot = (day: number, period: number) =>
    slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);

  const periods = Array.from({ length: periodCount }, (_, i) => i + 1);

  return (
    <div className={styles.wrapper}>
      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.periodHeader}>Period</th>
            {DAYS.map((d) => (
              <th key={d.value} className={styles.dayHeader}>
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period}>
              <td className={styles.periodLabel}>Period {period}</td>
              {DAYS.map((d) => {
                const slot = findSlot(d.value, period);
                const hasContent = Boolean(slot?.subject);

                return (
                  <td key={d.value} className={styles.cellTd}>
                    <div
                      className={[
                        styles.cell,
                        hasContent ? styles.activeSlot : styles.emptySlot,
                        editable ? styles.editable : "",
                      ].join(" ")}
                      onClick={() => onCellClick?.(d.value, period, slot)}
                    >
                      {slot?.subject ? (
                        <>
                          <span className={styles.subjectName}>{slot.subject.name}</span>
                          {slot.staff && <span className={styles.teacherName}>{slot.staff.user.name}</span>}
                          {showClassName && slot.classSection && (
                            <span className={styles.room}>
                              {slot.classSection.className} - {slot.classSection.section}
                            </span>
                          )}
                          {slot.room && <span className={styles.room}>Room {slot.room}</span>}
                        </>
                      ) : (
                        <span className={styles.emptyText}>{editable ? "+ Add Slot" : "—"}</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimetableGrid;
