import { Link } from "react-router-dom";
import { Card } from "../../ui";
import { useGetCalendarQuery, type CalendarAudience } from "../../../store/api/calendar.api";
import { daysIn, fmtRange, localToday } from "./calendarUtils";
import styles from "./SchoolCalendar.module.css";

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Dashboard card: the next few holidays for this person (students or staff).
const UpcomingHolidays = ({ who, calendarPath }: { who: CalendarAudience; calendarPath: string }) => {
  const today = localToday();
  const { data } = useGetCalendarQuery({ from: today, to: addDays(today, 90) });
  const holidays = (data?.events ?? []).filter((e) => e.kind === "HOLIDAY" && (e.audience === "ALL" || e.audience === who)).slice(0, 4);

  return (
    <Card
      title="Upcoming holidays"
      action={
        <Link to={calendarPath} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Calendar
        </Link>
      }
    >
      {holidays.length === 0 ? (
        <p className={styles.muted}>No holidays in the next three months.</p>
      ) : (
        <ul className={styles.list}>
          {holidays.map((e) => (
            <li key={e.id} className={styles.item}>
              <span className={`${styles.dot} ${styles.dotHoliday}`} />
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>{e.title}</div>
                <div className={styles.muted}>
                  {fmtRange(e)}
                  {daysIn(e) > 1 ? ` · ${daysIn(e)} days` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default UpcomingHolidays;
