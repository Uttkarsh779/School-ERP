import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
} from "../../../../components/ui";
import {
  useGetFeeStructureByIdQuery,
  useUpdateFeeStructureMutation,
  useGetFeeHeadsQuery,
} from "../../../../store/api/fees.api";
import styles from "./AdminFeesPage.module.css";

interface FeeRuleConfig {
  headId: number;
  name: string;
  code: string;
  amount: number;
  scheduleType: "EVERY_MONTH" | "ONCE_A_YEAR" | "SELECTED_MONTHS";
  targetMonths: string[];
}

interface GeneratedMonthPlan {
  num: number;
  name: string;
  feesCollected: string;
  coveredMonths: string[];
  collectionStartDate: string;
  lastDateToPay: string;
  isCustom?: boolean;
}

const ALL_ACADEMIC_MONTHS = [
  "June", "July", "August", "September", "October", "November",
  "December", "January", "February", "March", "April", "May"
];

const AdminClassFeeStructureDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const structureId = Number(id);

  // UNCONDITIONAL HOOK CALLS AT TOP LEVEL
  const [activeTab, setActiveTab] = useState<"plan" | "check_student">("plan");
  const { data: structure, isLoading } = useGetFeeStructureByIdQuery(structureId);
  const { data: feeHeads } = useGetFeeHeadsQuery();
  const [updateFeeStructure] = useUpdateFeeStructureMutation();

  // 1. Fee Head Collection Rules State (Source of Truth)
  const [feeRules, setFeeRules] = useState<FeeRuleConfig[]>([
    { headId: 1, name: "Tuition Fee", code: "TUITION", amount: 3000, scheduleType: "EVERY_MONTH", targetMonths: ALL_ACADEMIC_MONTHS },
    { headId: 2, name: "Annual Fee", code: "ANNUAL", amount: 7500, scheduleType: "ONCE_A_YEAR", targetMonths: ["January"] },
    { headId: 3, name: "Exam Fee", code: "EXAM", amount: 1500, scheduleType: "SELECTED_MONTHS", targetMonths: ["September", "March"] },
    { headId: 4, name: "Development Fee", code: "DEV", amount: 2000, scheduleType: "ONCE_A_YEAR", targetMonths: ["January"] },
  ]);

  // 2. Collection Settings State
  const [vacationMode, setVacationMode] = useState<"BUNDLE_WITH_MAY" | "SEPARATE_JUNE">("BUNDLE_WITH_MAY");
  const [defaultStartDay, setDefaultStartDay] = useState<number>(1);
  const [defaultDueDateDay, setDefaultDueDateDay] = useState<number>(10);

  // 3. Custom Month Overrides State (Exceptions)
  const [customOverrides, setCustomOverrides] = useState<Record<string, Partial<GeneratedMonthPlan>>>({});

  // 4. Modals & Change Preview State
  const [editingRule, setEditingRule] = useState<FeeRuleConfig | null>(null);
  const [showAddHeadModal, setShowAddHeadModal] = useState(false);
  const [newHeadName, setNewHeadName] = useState("");
  const [newHeadAmount, setNewHeadAmount] = useState("");

  const [editingMonth, setEditingMonth] = useState<GeneratedMonthPlan | null>(null);
  const [pendingRuleChangeDiff, setPendingRuleChangeDiff] = useState<string | null>(null);

  // Student Fee Calculator State
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedMonthNum, setSelectedMonthNum] = useState<number>(8);

  // 5. AUTO-GENERATE FEE COLLECTION PLAN ENGINE
  const generatedCollectionPlan = useMemo<GeneratedMonthPlan[]>(() => {
    return ALL_ACADEMIC_MONTHS.map((mName, idx) => {
      // Check if admin created a custom exception for this month
      if (customOverrides[mName]) {
        return {
          num: idx + 1,
          name: mName,
          feesCollected: customOverrides[mName].feesCollected || `${mName} Fee`,
          coveredMonths: customOverrides[mName].coveredMonths || [mName],
          collectionStartDate: customOverrides[mName].collectionStartDate || `0${defaultStartDay} ${mName} 2026/27`,
          lastDateToPay: customOverrides[mName].lastDateToPay || `${defaultDueDateDay} ${mName} 2026/27`,
          isCustom: true,
        };
      }

      const activeHeadNames: string[] = [];
      let isMayJuneBundle = false;

      feeRules.forEach((rule) => {
        if (rule.scheduleType === "EVERY_MONTH" || rule.targetMonths.includes(mName)) {
          if (rule.code === "TUITION") {
            if (mName === "May" && vacationMode === "BUNDLE_WITH_MAY") {
              activeHeadNames.push("May Tuition + June Tuition");
              isMayJuneBundle = true;
            } else if (mName === "June" && vacationMode === "BUNDLE_WITH_MAY") {
              // Bundled in May
            } else {
              activeHeadNames.push("Tuition Fee");
            }
          } else {
            activeHeadNames.push(rule.name);
          }
        }
      });

      const feesCollectedText = activeHeadNames.join(" + ") || "Tuition Fee";
      const year = idx >= 7 ? "2027" : "2026";
      const covered = isMayJuneBundle ? ["May", "June"] : [mName];

      return {
        num: idx + 1,
        name: mName,
        feesCollected: feesCollectedText,
        coveredMonths: covered,
        collectionStartDate: `0${defaultStartDay} ${mName} ${year}`,
        lastDateToPay: `${defaultDueDateDay} ${mName} ${year}`,
        isCustom: false,
      };
    });
  }, [feeRules, vacationMode, defaultStartDay, defaultDueDateDay, customOverrides]);

  // Coverage Validation
  const monthCoverageValidation = useMemo(() => {
    const monthCounts: Record<string, number> = {};
    ALL_ACADEMIC_MONTHS.forEach((m) => (monthCounts[m] = 0));

    generatedCollectionPlan.forEach((plan) => {
      plan.coveredMonths.forEach((m) => {
        if (monthCounts[m] !== undefined) monthCounts[m]++;
        else monthCounts[m] = 1;
      });
    });

    const missingMonths = Object.keys(monthCounts).filter((m) => monthCounts[m] === 0);
    const doubleMonths = Object.keys(monthCounts).filter((m) => monthCounts[m] > 1);

    return {
      isValid: missingMonths.length === 0 && doubleMonths.length === 0,
      missingMonths,
      doubleMonths,
    };
  }, [generatedCollectionPlan]);

  // Expected Annual Summary Engine
  const annualSummary = useMemo(() => {
    let total = 0;
    const breakdown: Array<{ name: string; amount: number }> = [];

    feeRules.forEach((rule) => {
      let ruleAmount = 0;
      if (rule.scheduleType === "EVERY_MONTH") {
        ruleAmount = rule.amount * 12;
      } else {
        ruleAmount = rule.amount * Math.max(1, rule.targetMonths.length);
      }
      total += ruleAmount;
      breakdown.push({ name: rule.name, amount: ruleAmount });
    });

    return { total, breakdown };
  }, [feeRules]);

  // EARLY RETURN AFTER ALL HOOKS ARE CALLED
  if (isLoading || !structure) return <Spinner />;

  const classSection = structure?.classSection;
  const rawName = classSection?.className || "";
  const cleanClassName = rawName.toLowerCase().startsWith("class") ? rawName : `Class ${rawName}`;
  const classNameText = classSection
    ? `${cleanClassName} - ${classSection.section}`
    : structure?.name || "Standard Fee Plan";

  // Individual Fee Head Edit Handler
  const handleSaveSingleRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    setFeeRules((prev) => prev.map((r) => (r.headId === editingRule.headId ? editingRule : r)));
    setPendingRuleChangeDiff(`Updated ${editingRule.name}: ₹${editingRule.amount.toLocaleString("en-IN")} (${editingRule.scheduleType === "EVERY_MONTH" ? "Every Month" : editingRule.targetMonths.join(", ")})`);

    toast.success(`${editingRule.name} rule updated! Review preview below.`);
    setEditingRule(null);
  };

  // Reset Custom Month Override to Automatic
  const handleResetMonthToAutomatic = (monthName: string) => {
    setCustomOverrides((prev) => {
      const copy = { ...prev };
      delete copy[monthName];
      return copy;
    });
    toast.info(`${monthName} collection reset to automatic rule.`);
  };

  const handleSaveCustomException = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMonth) return;

    setCustomOverrides((prev) => ({
      ...prev,
      [editingMonth.name]: {
        feesCollected: editingMonth.feesCollected,
        coveredMonths: editingMonth.coveredMonths,
        collectionStartDate: editingMonth.collectionStartDate,
        lastDateToPay: editingMonth.lastDateToPay,
      },
    }));

    toast.success(`Custom exception saved for ${editingMonth.name}!`);
    setEditingMonth(null);
  };

  const handleAddCustomFeeHead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeadName || !newHeadAmount) return;

    const newId = Date.now();
    setFeeRules((prev) => [
      ...prev,
      {
        headId: newId,
        name: newHeadName,
        code: newHeadName.toUpperCase().replace(/\s+/g, "_"),
        amount: Number(newHeadAmount),
        scheduleType: "EVERY_MONTH",
        targetMonths: ALL_ACADEMIC_MONTHS,
      },
    ]);

    toast.success(`Added new fee head: ${newHeadName}`);
    setNewHeadName("");
    setNewHeadAmount("");
    setShowAddHeadModal(false);
  };

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
        <span style={{ cursor: "pointer", color: "var(--erp-primary-600)", fontWeight: 500 }} onClick={() => navigate("/admin/fees")}>
          Fees
        </span>
        <span>/</span>
        <span style={{ cursor: "pointer", color: "var(--erp-primary-600)", fontWeight: 500 }} onClick={() => navigate("/admin/fees")}>
          Fee Structures
        </span>
        <span>/</span>
        <span style={{ fontWeight: 600, color: "var(--erp-text)" }}>{classNameText}</span>
      </div>

      <PageHeader
        title={`${classNameText} Fee Plan`}
        subtitle={`Academic Year: ${structure?.session?.name || "2026–27"}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/admin/fees")}>
            ← Back to All Classes
          </Button>
        }
      />

      {/* STEP 1: WHAT DO STUDENTS PAY? (FEE RULES DEFINITION) */}
      <Card
        title="1. What do students pay?"
        action={
          <Button size="sm" variant="primary" onClick={() => setShowAddHeadModal(true)}>
            + Add Fee Head
          </Button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          {feeRules.map((rule) => (
            <div
              key={rule.headId}
              style={{
                background: "var(--erp-surface)",
                border: "1px solid var(--erp-border)",
                borderRadius: "var(--erp-radius-sm)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--erp-text)" }}>{rule.name}</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--erp-primary-700)", margin: "0.25rem 0" }}>
                  ₹{rule.amount.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--erp-text-muted)" }}>
                  Collected: {rule.scheduleType === "EVERY_MONTH" ? "Every month" : rule.targetMonths.join(", ")}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button size="sm" variant="outline" onClick={() => setEditingRule(rule)}>
                  Edit Rule
                </Button>
              </div>
            </div>
          ))}

          {/* Transport Card */}
          <div
            style={{
              background: "var(--erp-surface)",
              border: "1px solid var(--erp-border)",
              borderRadius: "var(--erp-radius-sm)",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--erp-text)" }}>Transport</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--erp-text-muted)", margin: "0.4rem 0" }}>
                Based on student's village
              </div>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)" }}>Calculated separately per student</div>
          </div>
        </div>

        {/* Expected Annual Fee Summary */}
        <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "1rem", maxWidth: "440px" }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.6rem", color: "var(--erp-text)" }}>
            Expected Yearly Fees ({classNameText})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.88rem" }}>
            {annualSummary.breakdown.map((b, idx) => (
              <div key={idx} className={styles.itemRow}>
                <span style={{ color: "var(--erp-text-muted)" }}>{b.name}</span>
                <span style={{ fontWeight: 500 }}>₹{b.amount.toLocaleString("en-IN")}</span>
              </div>
            ))}
            <div className={styles.itemRow} style={{ borderTop: "1px solid var(--erp-border)", paddingTop: "0.4rem", marginTop: "0.2rem", fontWeight: 700, color: "var(--erp-primary-700)" }}>
              <span>Expected Annual Total</span>
              <span>₹{annualSummary.total.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)", marginTop: "0.5rem" }}>
            (excluding variable transport)
          </div>
        </div>
      </Card>

      {/* STEP 2: COLLECTION SETTINGS */}
      <Card title="2. Collection Settings">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.5fr", gap: "1.25rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--erp-text-muted)", marginBottom: "0.3rem" }}>
              Collection Dates Default
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Select
                label="Starts"
                value={defaultStartDay}
                onChange={(e) => setDefaultStartDay(Number(e.target.value))}
                options={[
                  { label: "1st of month", value: 1 },
                  { label: "5th of month", value: 5 },
                ]}
              />
              <Select
                label="Last Date"
                value={defaultDueDateDay}
                onChange={(e) => setDefaultDueDateDay(Number(e.target.value))}
                options={[
                  { label: "10th of month", value: 10 },
                  { label: "15th of month", value: 15 },
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--erp-text-muted)", marginBottom: "0.3rem" }}>
              Summer Vacation Rule (June Fee)
            </label>
            <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.85rem", background: "var(--erp-surface)", padding: "0.55rem 0.8rem", borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="vacationRule"
                  checked={vacationMode === "BUNDLE_WITH_MAY"}
                  onChange={() => setVacationMode("BUNDLE_WITH_MAY")}
                />
                <span>Collect together with May</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="vacationRule"
                  checked={vacationMode === "SEPARATE_JUNE"}
                  onChange={() => setVacationMode("SEPARATE_JUNE")}
                />
                <span>Collect separately in June</span>
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Sub-Tabs for Plan vs Student Calculator */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "plan" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("plan")}
        >
          Fee Collection Plan
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "check_student" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("check_student")}
        >
          Check What a Student Will Pay
        </button>
      </div>

      {/* STEP 3 & 4: AUTOMATICALLY GENERATED COLLECTION PLAN */}
      {activeTab === "plan" && (
        <Card title="Fee Collection Plan">
          {/* Plan Change Preview Banner */}
          {pendingRuleChangeDiff && (
            <div style={{ background: "var(--erp-primary-50, #f0f7ff)", border: "1px solid var(--erp-primary-600)", padding: "0.85rem 1rem", borderRadius: "var(--erp-radius-sm)", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "var(--erp-primary-700)", fontSize: "0.88rem" }}>⚡ Rule Change Staged for Preview:</strong>
                <div style={{ fontSize: "0.84rem", color: "var(--erp-text)" }}>{pendingRuleChangeDiff}</div>
              </div>
              <Button size="sm" variant="primary" onClick={() => setPendingRuleChangeDiff(null)}>
                Save Fee Plan
              </Button>
            </div>
          )}

          {/* Automated Coverage Validation Status */}
          <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.85rem 1rem", borderRadius: "var(--erp-radius-sm)", marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem" }}>
            {monthCoverageValidation.isValid ? (
              <>
                <span style={{ color: "var(--erp-success)", fontWeight: 500 }}>✓ All academic months covered</span>
                <span style={{ color: "var(--erp-success)", fontWeight: 500 }}>✓ No month covered twice</span>
                <span style={{ color: "var(--erp-success)", fontWeight: 500 }}>✓ All collection dates & due dates configured</span>
                <span style={{ color: "var(--erp-primary-700)", fontWeight: 600, marginTop: "0.2rem" }}>Plan is ready</span>
              </>
            ) : (
              <>
                {monthCoverageValidation.missingMonths.map((m) => (
                  <span key={m} style={{ color: "var(--erp-danger)", fontWeight: 600 }}>
                    ⚠ {m} 2027 is not covered by any fee collection.
                  </span>
                ))}
                {monthCoverageValidation.doubleMonths.map((m) => (
                  <span key={m} style={{ color: "var(--erp-danger)", fontWeight: 600 }}>
                    ⚠ {m} 2027 is covered by more than one fee collection.
                  </span>
                ))}
              </>
            )}
          </div>

          <Table
            keyField="num"
            showPagination={false}
            columns={[
              {
                key: "name",
                label: "Month",
                width: "160px",
                render: (m: GeneratedMonthPlan) => (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>{m.name}</span>
                    {m.isCustom && <Badge tone="warning">⚠ Custom</Badge>}
                  </div>
                ),
              },
              { key: "feesCollected", label: "Fees Collected" },
              { key: "collectionStartDate", label: "Collection Starts" },
              { key: "lastDateToPay", label: "Last Date to Pay" },
              {
                key: "actions",
                label: "Action",
                width: "180px",
                render: (m: GeneratedMonthPlan) => (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <Button size="sm" variant="outline" onClick={() => setEditingMonth(m)}>
                      {m.isCustom ? "Edit Exception" : "Edit Exception"}
                    </Button>
                    {m.isCustom && (
                      <Button size="sm" variant="outline" onClick={() => handleResetMonthToAutomatic(m.name)}>
                        Reset
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
            data={generatedCollectionPlan}
          />
        </Card>
      )}

      {/* STUDENT FEE CALCULATOR */}
      {activeTab === "check_student" && (
        <Card title="Check What a Student Will Pay">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem", maxWidth: "600px" }}>
            <Input
              label="Student ID"
              type="number"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              placeholder="e.g. 1 (Rahul Kumar)"
            />
            <Select
              label="Select Month"
              value={selectedMonthNum}
              onChange={(e) => setSelectedMonthNum(Number(e.target.value))}
              options={generatedCollectionPlan.map((m) => ({ label: `${m.name} 2026/27`, value: m.num }))}
            />
          </div>

          <div className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div>
                <h4 style={{ margin: 0, fontWeight: 600 }}>Rahul Kumar</h4>
                <small style={{ color: "var(--erp-text-muted)" }}>{classNameText} | Transport: Rampur Village</small>
              </div>
              <Badge tone="success">ACTIVE TRANSPORT</Badge>
            </div>

            <div className={styles.itemList}>
              <div className={styles.itemRow}>
                <span>Current Month Fee</span>
                <span style={{ fontWeight: 500 }}>₹{selectedMonthNum === 5 ? 6000 : 3000}</span>
              </div>

              {selectedMonthNum === 1 && (
                <div className={styles.itemRow}>
                  <span>Annual & Development Fee</span>
                  <span style={{ fontWeight: 500 }}>₹9,500</span>
                </div>
              )}

              {(selectedMonthNum === 9 || selectedMonthNum === 3) && (
                <div className={styles.itemRow}>
                  <span>Exam Fee</span>
                  <span style={{ fontWeight: 500 }}>₹1,500</span>
                </div>
              )}

              <div className={styles.itemRow}>
                <span>Transport — Rampur</span>
                <span style={{ fontWeight: 500 }}>₹1,200</span>
              </div>

              <div className={styles.itemRow} style={{ color: "var(--erp-success)" }}>
                <span>Sibling Discount</span>
                <span style={{ fontWeight: 500 }}>-₹500</span>
              </div>

              <div className={styles.itemRow} style={{ color: "var(--erp-warning-strong, #d97706)" }}>
                <span>Previous Due</span>
                <span style={{ fontWeight: 500 }}>+₹1,000</span>
              </div>
            </div>

            <div className={styles.previewTotal}>
              <span>Total to Pay</span>
              <span>
                ₹
                {(
                  (selectedMonthNum === 5 ? 6000 : 3000) +
                  (selectedMonthNum === 1 ? 9500 : 0) +
                  (selectedMonthNum === 9 || selectedMonthNum === 3 ? 1500 : 0) +
                  1200 -
                  500 +
                  1000
                ).toLocaleString("en-IN")}
              </span>
            </div>

            <div style={{ textAlign: "right", fontSize: "0.82rem", color: "var(--erp-text-muted)", marginTop: "0.4rem" }}>
              Last date: {defaultDueDateDay} {generatedCollectionPlan.find((m) => m.num === selectedMonthNum)?.name || "August"} 2026
            </div>
          </div>
        </Card>
      )}

      {/* INDIVIDUAL FEE RULE EDIT MODAL */}
      {editingRule && (
        <Modal title={`Edit ${editingRule.name} Rule`} onClose={() => setEditingRule(null)}>
          <form onSubmit={handleSaveSingleRule} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <Input
              label="Fee Amount (₹)"
              type="number"
              required
              value={editingRule.amount}
              onChange={(e) => setEditingRule({ ...editingRule, amount: Number(e.target.value) })}
            />

            <Select
              label="How often is it collected?"
              value={editingRule.scheduleType}
              onChange={(e) => setEditingRule({ ...editingRule, scheduleType: e.target.value as any })}
              options={[
                { label: "Every month", value: "EVERY_MONTH" },
                { label: "Once a year", value: "ONCE_A_YEAR" },
                { label: "Selected months", value: "SELECTED_MONTHS" },
              ]}
            />

            {editingRule.scheduleType !== "EVERY_MONTH" && (
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Select Collection Month(s):
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem", fontSize: "0.85rem" }}>
                  {ALL_ACADEMIC_MONTHS.map((mName) => (
                    <label key={mName} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={editingRule.targetMonths.includes(mName)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditingRule({ ...editingRule, targetMonths: [...editingRule.targetMonths, mName] });
                          } else {
                            setEditingRule({ ...editingRule, targetMonths: editingRule.targetMonths.filter((m) => m !== mName) });
                          }
                        }}
                      />
                      <span>{mName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Input
              label="Start using this new rule from:"
              type="date"
              defaultValue="2026-10-01"
            />

            <div className={styles.formActions}>
              <Button variant="outline" type="button" onClick={() => setEditingRule(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save Rule & Preview
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* EDIT EXCEPTION MODAL */}
      {editingMonth && (
        <Modal title={`Advanced: Custom Collection Plan — ${editingMonth.name}`} onClose={() => setEditingMonth(null)}>
          <form onSubmit={handleSaveCustomException} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <Input
              label="Fees Collected Description:"
              type="text"
              value={editingMonth.feesCollected}
              onChange={(e) => setEditingMonth({ ...editingMonth, feesCollected: e.target.value })}
            />
            <Input
              label="Collection Starts:"
              type="text"
              value={editingMonth.collectionStartDate}
              onChange={(e) => setEditingMonth({ ...editingMonth, collectionStartDate: e.target.value })}
            />
            <Input
              label="Last Date to Pay:"
              type="text"
              value={editingMonth.lastDateToPay}
              onChange={(e) => setEditingMonth({ ...editingMonth, lastDateToPay: e.target.value })}
            />

            <div style={{ background: "var(--erp-surface)", padding: "0.75rem 1rem", borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)", fontSize: "0.82rem" }}>
              <span style={{ color: "var(--erp-warning)", fontWeight: 600 }}>⚠ Custom Exception Notice:</span>
              <p style={{ margin: "0.2rem 0 0 0", color: "var(--erp-text-muted)" }}>
                Saving this change will override the auto-generated collection rule for {editingMonth.name} and mark it as Custom.
              </p>
            </div>

            <div className={styles.formActions}>
              <Button variant="outline" type="button" onClick={() => setEditingMonth(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save Exception
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ADD NEW FEE HEAD MODAL */}
      {showAddHeadModal && (
        <Modal title="Add Dynamic Fee Head" onClose={() => setShowAddHeadModal(false)}>
          <form onSubmit={handleAddCustomFeeHead} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="Fee Head Name *"
              type="text"
              required
              value={newHeadName}
              onChange={(e) => setNewHeadName(e.target.value)}
              placeholder="e.g. Lab Fee / Library Fee / Sports Fee"
            />
            <Input
              label="Default Amount (₹) *"
              type="number"
              required
              value={newHeadAmount}
              onChange={(e) => setNewHeadAmount(e.target.value)}
              placeholder="e.g. 1500"
            />
            <div className={styles.formActions}>
              <Button variant="outline" type="button" onClick={() => setShowAddHeadModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Add Fee Head
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminClassFeeStructureDetailPage;
