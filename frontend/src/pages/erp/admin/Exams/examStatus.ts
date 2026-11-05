// Where an exam stands, and how to name its class, on the coordinator's list.

export type ExamStatus = "open" | "locked" | "published";
export const statusOf = (e: IExam): ExamStatus => (e.resultsPublished ? "published" : e.isLocked ? "locked" : "open");
export const STATUS_LABEL: Record<ExamStatus, string> = { open: "Marks entry open", locked: "Marks locked", published: "Published" };

// Class names are stored either as "10" or "Class 10"; show "Class 10 - A" either way
// (and "Nursery - A", not "Class Nursery - A").
export const classLabelOf = (e: IExam) => {
  if (!e.classSection) return "Class not set";
  const name = e.classSection.className.replace(/^class\s*/i, "");
  return `${/^\d/.test(name) ? `Class ${name}` : name} - ${e.classSection.section}`;
};
