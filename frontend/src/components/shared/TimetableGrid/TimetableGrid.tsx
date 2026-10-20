import { useState } from "react";
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

  // Phones show one day at a time; start on today (Sunday falls back to Monday).
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 6 ? today : 1;
  });

  const slotBody = (slot?: ITimetableSlot) =>
    slot?.subject ? (
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
      <span className={styles.emptyText}>{editable ? "+ Add Slot" : "Free period"}</span>
    );

  return (
    <>
    <div className={styles.dayView}>
      <div className={styles.dayTabs} role="tablist" aria-label="Day">
        {DAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="tab"
            aria-selected={activeDay === d.value}
            className={`${styles.dayTab} ${activeDay === d.value ? styles.dayTabActive : ""}`}
            onClick={() => setActiveDay(d.value)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <ol className={styles.dayList}>
        {periods.map((period) => {
          const slot = findSlot(activeDay, period);
          return (
            <li key={period} className={styles.dayRow}>
              <span className={styles.dayPeriod}>
                <small>Period</small>
                {period}
              </span>
              <div
                className={[styles.cell, slot?.subject ? styles.activeSlot : styles.emptySlot, editable ? styles.editable : ""].join(" ")}
                onClick={() => onCellClick?.(activeDay, period, slot)}
              >
                {slotBody(slot)}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
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
                      {slot?.subject ? slotBody(slot) : <span className={styles.emptyText}>{editable ? "+ Add Slot" : "—"}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
};

export default TimetableGrid;
