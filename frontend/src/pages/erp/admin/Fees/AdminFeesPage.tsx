import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../../../components/ui";
import { useAppSelector } from "../../../../store/store";
import { useGetFeeOverviewQuery } from "../../../../store/api/fees.api";
import MultiMonthPaymentDesk from "./MultiMonthPaymentDesk";
import FeeOverviewTab from "./tabs/FeeOverviewTab";
import BillsTab from "./tabs/BillsTab";
import DefaultersTab from "./tabs/DefaultersTab";
import StructuresTab from "./tabs/StructuresTab";
import RefundsTab from "./tabs/RefundsTab";
import FeeSettingsTab from "./tabs/FeeSettingsTab";
import FeeAuditTab from "./tabs/FeeAuditTab";
import styles from "./Fees.module.css";

type Tab = "overview" | "collect" | "bills" | "dues" | "structures" | "refunds" | "settings" | "audit";

// Fee Management shell. Each tab lives in its own file under ./tabs. Waivers are open to
// Admins too; other money decisions (refund approval, deletes, bulk fee changes, audit log)
// are Super Admin only — hidden here and enforced by the server.
const AdminFeesPage = () => {
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "overview");
  const [collectStudentId, setCollectStudentId] = useState<number | undefined>(
    params.get("studentId") ? Number(params.get("studentId")) : undefined
  );
  const { data: overview } = useGetFeeOverviewQuery();

  const go = (next: Tab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    if (next !== "collect") p.delete("studentId");
    setParams(p, { replace: true });
  };

  const tabs: Array<{ key: Tab; label: string; count?: number; superOnly?: boolean }> = [
    { key: "overview", label: "Overview" },
    { key: "collect", label: "Collect Payment" },
    { key: "bills", label: "Bills & Invoices" },
    { key: "dues", label: "Dues & Defaulters", count: overview?.defaulterCount },
    { key: "structures", label: "Fee Structures" },
    { key: "refunds", label: "Refunds", count: overview?.pendingRefunds },
    { key: "settings", label: "Settings" },
    { key: "audit", label: "Audit Log", superOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.superOnly || isSuperAdmin);

  return (
    <div className={styles.page}>
      <PageHeader title="Fee Management" subtitle="Collections, bills, dues, fee structures and refunds" />

      {/* Phones: one compact picker instead of tabs scrolling off-screen */}
      <label className={styles.tabSelectWrap}>
        <span className={styles.tabSelectLabel}>Section</span>
        <select className={styles.tabSelect} value={tab} onChange={(e) => go(e.target.value as Tab)}>
          {visibleTabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
              {t.count ? ` (${t.count})` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className={`${styles.tabs} ${styles.tabsWithPicker}`} role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => go(t.key)}
          >
            {t.label}
            {!!t.count && <span className={styles.tabCount}>{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && <FeeOverviewTab onGoTo={go} />}
      {tab === "collect" && <MultiMonthPaymentDesk initialStudentId={collectStudentId} />}
      {tab === "bills" && <BillsTab />}
      {tab === "dues" && (
        <DefaultersTab
          onCollect={(studentId) => {
            setCollectStudentId(studentId);
            go("collect");
          }}
        />
      )}
      {tab === "structures" && <StructuresTab isSuperAdmin={isSuperAdmin} />}
      {tab === "refunds" && <RefundsTab isSuperAdmin={isSuperAdmin} />}
      {tab === "settings" && <FeeSettingsTab isSuperAdmin={isSuperAdmin} />}
      {tab === "audit" && isSuperAdmin && <FeeAuditTab />}
    </div>
  );
};

export default AdminFeesPage;
