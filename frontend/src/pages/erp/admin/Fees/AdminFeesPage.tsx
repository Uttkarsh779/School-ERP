import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Icon, PageHeader } from "../../../../components/ui";
import { useAppSelector } from "../../../../store/store";
import { useCan, type Permission } from "../../../../store/permissions";
import { useGetFeeOverviewQuery } from "../../../../store/api/fees.api";
import MultiMonthPaymentDesk from "./MultiMonthPaymentDesk";
import FeeOverviewTab from "./tabs/FeeOverviewTab";
import BillsTab from "./tabs/BillsTab";
import DayBookTab from "./tabs/DayBookTab";
import DefaultersTab from "./tabs/DefaultersTab";
import StructuresTab from "./tabs/StructuresTab";
import RefundsTab from "./tabs/RefundsTab";
import FeeSettingsTab from "./tabs/FeeSettingsTab";
import FeeAuditTab from "./tabs/FeeAuditTab";
import styles from "./Fees.module.css";

type Tab = "overview" | "collect" | "daybook" | "bills" | "dues" | "structures" | "refunds" | "settings" | "audit";

// Fee Management shell. Each tab lives in its own file under ./tabs. Tabs and buttons follow
// store/permissions.ts: the counter (office, accountant) collects and bills; the Principal only
// reads; fee amounts, rules, waivers, refunds and the audit log are the Super Admin's.
const AdminFeesPage = () => {
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // The tab lives in the URL, so the phone's back button steps back through sections.
  const tab: Tab = (params.get("tab") as Tab) || "overview";
  const [collectStudentId, setCollectStudentId] = useState<number | undefined>(
    params.get("studentId") ? Number(params.get("studentId")) : undefined
  );
  const { data: overview } = useGetFeeOverviewQuery();

  const go = (next: Tab, fromHub = false) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    if (next !== "collect") p.delete("studentId");
    // Opening a section from the phone's section list adds a history entry (back returns to the list).
    setParams(p, fromHub ? { state: { fromHub: true } } : { replace: true });
  };
  const backToSections = () => {
    if ((location.state as { fromHub?: boolean } | null)?.fromHub) navigate(-1);
    else go("overview");
  };

  const tabs: Array<{ key: Tab; label: string; hint: string; icon: string; count?: number; perm?: Permission }> = [
    { key: "overview", label: "Overview", hint: "Today's collection and totals", icon: "dashboard" },
    { key: "collect", label: "Collect Payment", hint: "Take a fee payment and print the receipt", icon: "wallet", perm: "fees.collect" },
    { key: "daybook", label: "Day Book", hint: "Each day's collection by mode and collector · print", icon: "clipboardCheck" },
    { key: "bills", label: "Bills & Invoices", hint: "Monthly bills issued to students", icon: "fileText" },
    { key: "dues", label: "Dues & Defaulters", hint: "Who hasn't paid · print the list", icon: "bell", count: overview?.defaulterCount },
    { key: "structures", label: "Fee Structures", hint: "Fee amounts for each class", icon: "layers" },
    { key: "refunds", label: "Refunds", hint: "Refund requests from parents", icon: "arrowLeft", count: overview?.pendingRefunds },
    { key: "settings", label: "Settings", hint: "Fee heads, late fee and billing rules", icon: "edit", perm: "fees.configure" },
    { key: "audit", label: "Audit Log", hint: "Every change made to fee records", icon: "clipboardCheck", perm: "owner" },
  ];
  const visibleTabs = tabs.filter((t) => !t.perm || can(t.perm));
  const current = visibleTabs.find((t) => t.key === tab);
  const inSection = tab !== "overview";

  return (
    <div className={styles.page}>
      <div className={inSection ? styles.hideOnPhone : undefined}>
        <PageHeader
          title="Fee Management"
          subtitle="Collections, bills, dues, fee structures and refunds"
          actions={
            <Button variant="outline" icon={<Icon name="badge" size={16} />} onClick={() => navigate("/admin/fees/concessions")}>
              Concessions
            </Button>
          }
        />
      </div>

      {/* Phones: inside a section, a back link and the section's name instead of the tab strip */}
      {inSection && (
        <div className={styles.phoneSectionHead}>
          <button type="button" className={styles.phoneBack} onClick={backToSections}>
            <Icon name="arrowLeft" size={16} /> Fee sections
          </button>
          <h1 className={styles.phoneSectionTitle}>{current?.label}</h1>
        </div>
      )}

      {/* Phones: the Fee Management home lists every section; Collect Payment comes first */}
      {!inSection && (
        <nav className={styles.phoneHub} aria-label="Fee sections">
          {visibleTabs
            .filter((t) => t.key !== "overview")
            .map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.hubRow} ${t.key === "collect" ? styles.hubPrimary : ""}`}
                onClick={() => go(t.key, true)}
              >
                <span className={styles.hubIcon}>
                  <Icon name={t.icon} size={18} />
                </span>
                <span className={styles.hubText}>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
                {!!t.count && <span className={styles.tabCount}>{t.count}</span>}
                <Icon name="chevronRight" size={16} className={styles.hubChev} />
              </button>
            ))}
        </nav>
      )}

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
      {tab === "collect" && can("fees.collect") && <MultiMonthPaymentDesk initialStudentId={collectStudentId} />}
      {tab === "daybook" && <DayBookTab />}
      {tab === "bills" && <BillsTab isSuperAdmin={isSuperAdmin} />}
      {tab === "dues" && (
        <DefaultersTab
          onCollect={
            can("fees.collect")
              ? (studentId) => {
                  setCollectStudentId(studentId);
                  go("collect");
                }
              : undefined
          }
        />
      )}
      {tab === "structures" && <StructuresTab isSuperAdmin={isSuperAdmin} />}
      {tab === "refunds" && <RefundsTab isSuperAdmin={isSuperAdmin} />}
      {tab === "settings" && can("fees.configure") && <FeeSettingsTab isSuperAdmin={isSuperAdmin} />}
      {tab === "audit" && can("owner") && <FeeAuditTab />}
    </div>
  );
};

export default AdminFeesPage;
