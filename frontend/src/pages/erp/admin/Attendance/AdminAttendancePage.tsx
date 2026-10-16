import { useState } from "react";
import { PageHeader } from "../../../../components/ui";
import DefaultersSection from "./DefaultersSection";
import MonthlyReportSection from "./MonthlyReportSection";
import styles from "./AdminAttendancePage.module.css";

type Tab = "defaulters" | "monthly";

/**
 * Admin attendance INSIGHTS view — read-only reporting (defaulters + monthly
 * summary). Marking daily attendance is a teacher-facing flow built elsewhere.
 */
const AdminAttendancePage = () => {
  const [tab, setTab] = useState<Tab>("defaulters");

  return (
    <div className={styles.page}>
      <PageHeader
        title="Attendance insights"
        subtitle="Review attendance defaulters and monthly class-wise reports"
      />

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "defaulters"}
          className={[styles.tab, tab === "defaulters" ? styles.tabActive : ""].join(" ")}
          onClick={() => setTab("defaulters")}
        >
          Defaulters
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "monthly"}
          className={[styles.tab, tab === "monthly" ? styles.tabActive : ""].join(" ")}
          onClick={() => setTab("monthly")}
        >
          Monthly report
        </button>
      </div>

      {tab === "defaulters" ? <DefaultersSection /> : <MonthlyReportSection />}
    </div>
  );
};

export default AdminAttendancePage;
