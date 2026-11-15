import { Button, Card, Icon } from "../../ui";
import { useGetDateSheetsQuery, type DateSheetItem } from "../../../store/api/examPlan.api";
import { useGetPublicWebsiteDataQuery } from "../../../store/api/cms.api";
import { printDateSheets } from "../Print/dateSheetPrint";
import styles from "./DateSheet.module.css";

// Exam date sheets: when each subject's paper is. DateSheetTable shows one exam's papers
// (today's paper highlighted, finished ones faded); UpcomingExams is the dashboard card with
// the exams that haven't finished yet.

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
const time = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const DateSheetTable = ({ exam }: { exam: DateSheetItem }) => {
  const now = today();
  return (
    <>
      <ul className={styles.papers}>
        {exam.entries.map((e) => (
          <li key={e.subjectId} className={e.date === now ? styles.today : e.date < now ? styles.done : undefined}>
            <span className={styles.date}>
              {day(e.date)}
              {e.date === now && <small>Today</small>}
            </span>
            <span className={styles.subject}>{e.subjectName}</span>
            <span className={styles.time}>
              {time(e.start)} – {time(e.end)}
            </span>
          </li>
        ))}
      </ul>
      {exam.instructions && <p className={styles.note}>{exam.instructions.split("\n").filter(Boolean).join(" · ")}</p>}
    </>
  );
};

// Print / Save as PDF for one class's date sheet.
export const PrintDateSheetButton = ({ exam, label = "Print / PDF" }: { exam: DateSheetItem; label?: string }) => {
  const { data: site } = useGetPublicWebsiteDataQuery();
  return (
    <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} onClick={() => printDateSheets([exam], { school: site?.settings })}>
      {label}
    </Button>
  );
};

const UpcomingExams = () => {
  const { data } = useGetDateSheetsQuery();
  const upcoming = (data ?? []).filter((e) => !e.finished).slice(0, 2);
  if (!upcoming.length) return null;
  return (
    <>
      {upcoming.map((e) => (
        <Card
          key={e.examId}
          title={`Date sheet · ${e.name}`}
          subtitle={e.firstDate && e.firstDate > today() ? `Starts ${day(e.firstDate)}` : "In progress"}
          action={<PrintDateSheetButton exam={e} label="Print" />}
        >
          <DateSheetTable exam={e} />
        </Card>
      ))}
    </>
  );
};

export default UpcomingExams;
