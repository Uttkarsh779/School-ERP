import { useState, useMemo } from "react";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Modal,
  PageHeader,
  StatCard,
  Table,
  Select,
  Input,
  FormSection,
  FormGrid,
  Icon,
  Card,
  Spinner
} from "../../../../components/ui";

import {
  useGetAllConcessionsQuery,
  useGetConcessionSchemesQuery,
  useAssignStudentConcessionMutation,
  useEndStudentConcessionMutation,
  type IStudentConcession
} from "../../../../store/api/concessions.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStaffListQuery } from "../../../../store/api/staff.api";
import { useGetFeeHeadsQuery } from "../../../../store/api/fees.api";
import { useAppSelector } from "../../../../store/store";
import styles from "./AdminFeesPage.module.css";

const formatMonthYear = (dateInput: string | Date) => {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const AdminConcessionsPage = () => {
  const { data: concessionsData, isLoading: isLoadingConcessions, refetch } = useGetAllConcessionsQuery();
  const { data: schemesData } = useGetConcessionSchemesQuery();
  const { data: studentsData } = useGetStudentsQuery();
  const { data: classSectionsData } = useGetClassSectionsQuery();
  const { data: staffData } = useGetStaffListQuery();
  const { data: feeHeadsData } = useGetFeeHeadsQuery();

  const concessions = Array.isArray(concessionsData) ? concessionsData : concessionsData?.data || [];
  const schemes = Array.isArray(schemesData) ? schemesData : schemesData?.data || [];
  const students = Array.isArray(studentsData) ? studentsData : (studentsData as any)?.data || [];
  const classSections = Array.isArray(classSectionsData) ? classSectionsData : [];
  const staffMembers = Array.isArray(staffData) ? staffData : (staffData as any)?.data || [];
  const feeHeads: any[] = Array.isArray(feeHeadsData) ? feeHeadsData : (feeHeadsData as any)?.data || [];

  const [assignConcession, { isLoading: isAssigning }] = useAssignStudentConcessionMutation();
  const [endConcession, { isLoading: isEnding }] = useEndStudentConcessionMutation();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedConcession, setSelectedConcession] = useState<IStudentConcession | null>(null);

  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [endEffectiveDate, setEndEffectiveDate] = useState("");

  const activeCount = concessions.filter(c => c.status === "ACTIVE").length;
  const scholarshipsCount = concessions.filter(c => c.status === "ACTIVE" && c.type === "SCHOLARSHIP").length;
  const staffChildCount = concessions.filter(c => c.status === "ACTIVE" && c.type === "STAFF_CHILD").length;
  
  const expiringSoonCount = concessions.filter(c => {
    if (c.status !== "ACTIVE" || !c.endsOn) return false;
    const end = new Date(c.endsOn);
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return end < thirtyDaysLater && end > now;
  }).length;

  const [addStep, setAddStep] = useState(1);
  const [addWho, setAddWho] = useState<"INDIVIDUAL" | "FAMILY" | "STAFF_CHILD">("INDIVIDUAL");
  const [addType, setAddType] = useState("");
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string>("ALL");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
  const [customSchemeName, setCustomSchemeName] = useState("");
  const [customCalcType, setCustomCalcType] = useState<"FLAT" | "PERCENTAGE">("FLAT");
  const [addForm, setAddForm] = useState({
    studentId: "",
    staffId: "",
    concessionSchemeId: "",
    value: "",
    applicableHeads: [] as string[],
    startsFrom: new Date().toISOString().split("T")[0],
    endsOn: "",
    reason: "",
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isOther = addForm.concessionSchemeId === "OTHER";
      let calculationType = "FLAT";
      let schemeId: number | undefined = undefined;

      if (isOther) {
        if (!customSchemeName.trim()) return toast.error("Please specify a custom concession name");
        calculationType = customCalcType;
      } else {
        const scheme = schemes.find(s => s.id.toString() === addForm.concessionSchemeId);
        if (!scheme) return toast.error("Please select a valid scheme or '+ Other / Custom'");
        calculationType = scheme.calculationType;
        schemeId = Number(addForm.concessionSchemeId);
      }

      if (!addForm.studentId) return toast.error("Please select a student");
      if (!addForm.value || Number(addForm.value) <= 0) return toast.error("Please enter a valid benefit value");

      const isStaffChild = addWho === "STAFF_CHILD" || addType === "STAFF_CHILD";
      if (isStaffChild && !addForm.staffId) {
        return toast.error("Please select a Staff Member for Staff Child discount");
      }

      await assignConcession({
        studentId: Number(addForm.studentId),
        staffId: isStaffChild && addForm.staffId ? Number(addForm.staffId) : undefined,
        concessionSchemeId: schemeId,
        type: addType,
        calculationType,
        value: Number(addForm.value),
        applicableHeads: addForm.applicableHeads.map(Number),
        startsFrom: addForm.startsFrom || undefined,
        endsOn: addForm.endsOn || undefined,
        reason: isOther ? customSchemeName.trim() : addForm.reason,
      }).unwrap();
      toast.success("Concession assigned successfully!");
      setIsAddModalOpen(false);
      resetAddForm();
      refetch();
    } catch (err: any) {
      toast.error(err.data?.message || err.message || "Failed to assign concession");
    }
  };

  const handleEndConcession = async () => {
    if (!selectedConcession || !endEffectiveDate) return;
    try {
      await endConcession({ id: selectedConcession.id, effectiveDate: endEffectiveDate }).unwrap();
      toast.success("Concession ended successfully.");
      setIsEndConfirmOpen(false);
      setIsDetailModalOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.data?.message || err.message || "Failed to end concession");
    }
  };

  const resetAddForm = () => {
    setAddStep(1);
    setAddWho("INDIVIDUAL");
    setAddType("");
    setSelectedClassSectionId("ALL");
    setStudentSearchQuery("");
    setShowStudentSuggestions(false);
    setCustomSchemeName("");
    setCustomCalcType("FLAT");
    setAddForm({
      studentId: "", staffId: "", concessionSchemeId: "", value: "",
      applicableHeads: [], startsFrom: new Date().toISOString().split("T")[0], endsOn: "", reason: "",
    });
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Concessions & Scholarships"
        subtitle="Manage student discounts, scholarships, staff-child concessions and other recurring fee benefits."
        actions={
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            + Add Concession
          </Button>
        }
      />

      <div className={styles.statsGrid}>
        <StatCard label="Active Concessions" value={activeCount} icon={<Icon name="users" />} />
        <StatCard label="Scholarships" value={scholarshipsCount} icon={<Icon name="graduationCap" />} />
        <StatCard label="Staff Child Concessions" value={staffChildCount} icon={<Icon name="familyCheck" />} />
        <StatCard 
          label="Expiring Soon" 
          value={expiringSoonCount} 
          icon={<Icon name="bell" />} 
          trend={
            expiringSoonCount > 0 
              ? { value: expiringSoonCount, label: "this month", isPositive: false }
              : undefined
          } 
        />
      </div>

      <Card>
        {isLoadingConcessions ? (
          <Spinner />
        ) : (
          <Table<IStudentConcession>
            mobilePrimary="student"
            stackBelow={900}
            data={concessions}
            keyField="id"
            columns={[
              {
                key: "student",
                label: "Student",
                render: (c) => `${c.student?.name} ${c.student?.classSection ? `(${c.student.classSection.className} ${c.student.classSection.section})` : ""}`,
              },
              {
                key: "staff",
                label: "Staff Member",
                render: (c) => c.staff?.user?.name || "-",
              },
              {
                key: "type",
                label: "Type",
                render: (c) => c.concessionScheme?.name || c.reason || c.type,
              },
              {
                key: "benefit",
                label: "Benefit",
                render: (c) => c.calculationType === "PERCENTAGE" ? `${c.value}%` : `₹${c.value}`,
              },
              {
                key: "appliesTo",
                label: "Applies To",
                render: (c) => {
                  if (!c.applicableHeads?.length) return "All Heads";
                  return c.applicableHeads.map(hid => feeHeads.find(h => h.id === hid)?.name || hid).join(", ");
                },
              },
              {
                key: "startsFrom",
                label: "Starts From",
                render: (c) => c.startsFrom ? formatMonthYear(c.startsFrom) : "-",
              },
              {
                key: "endsOn",
                label: "Valid Until",
                render: (c) => c.endsOn ? formatMonthYear(c.endsOn) : "Ongoing",
              },
              {
                key: "status",
                label: "Status",
                render: (c) => (
                  <Badge
                    variant={c.status === "ACTIVE" ? "success" : c.status === "CANCELLED" ? "danger" : "neutral"}
                  >
                    {c.status}
                  </Badge>
                ),
              },
              {
                key: "actions",
                label: "Actions",
                render: (c) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedConcession(c);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    View
                  </Button>
                ),
              },
            ]}
            emptyMessage="No concessions yet. Create a scholarship, discount, staff-child concession or family discount to get started."
          />
        )}
      </Card>

      {/* Add Wizard Modal */}
      {isAddModalOpen && (
        <Modal title="Add Concession" size="lg" onClose={() => { setIsAddModalOpen(false); resetAddForm(); }}>
          <form onSubmit={handleAddSubmit}>
            {addStep === 1 && (
              <FormSection title="Step 1: Who is receiving it?">
                <Select
                  label="Recipient Type"
                  value={addWho}
                  onChange={(e) => setAddWho(e.target.value as any)}
                  options={[
                    { label: "Individual Student", value: "INDIVIDUAL" },
                    { label: "Staff Member's Child", value: "STAFF_CHILD" },
                    { label: "Family", value: "FAMILY" },
                  ]}
                />
                <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <Button type="button" onClick={() => setAddStep(2)}>Next</Button>
                </div>
              </FormSection>
            )}
            
            {addStep === 2 && (
              <FormSection title="Step 2: What type of benefit?">
                <Select
                  label="Benefit Type"
                  value={addType}
                  onChange={(e) => setAddType(e.target.value)}
                  options={[
                    { label: "Select Type", value: "" },
                    { label: "Scholarship", value: "SCHOLARSHIP" },
                    { label: "Discount", value: "DISCOUNT" },
                    { label: "Family/Sibling Discount", value: "SIBLING_DISCOUNT" },
                    { label: "Staff Child Discount", value: "STAFF_CHILD" },
                    { label: "Transport Concession", value: "TRANSPORT_CONCESSION" },
                    { label: "Other", value: "OTHER" },
                  ]}
                />
                <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "flex-end" }}>
                  <Button type="button" variant="ghost" onClick={() => setAddStep(1)}>Back</Button>
                  <Button type="button" onClick={() => setAddStep(3)} disabled={!addType}>Next</Button>
                </div>
              </FormSection>
            )}

            {addStep === 3 && (() => {
              const isStaffChildRecipient = addWho === "STAFF_CHILD" || addType === "STAFF_CHILD";
              const selectedStaff = staffMembers.find((s: any) => s.id.toString() === addForm.staffId);
              const linkedChildStudentIds: number[] = selectedStaff?.user?.parent?.children?.map((c: any) => c.studentId) || [];
              
              const filteredStudentsList = students.filter((st: any) => {
                if (isStaffChildRecipient && !addForm.staffId) {
                  return false;
                }
                if (selectedClassSectionId !== "ALL") {
                  if (st.classSectionId?.toString() !== selectedClassSectionId) return false;
                }
                if (studentSearchQuery.trim()) {
                  const q = studentSearchQuery.toLowerCase();
                  const nameMatch = st.name?.toLowerCase().includes(q);
                  const admMatch = st.admissionNo?.toLowerCase().includes(q);
                  const rollMatch = st.rollNo?.toString().includes(q);
                  if (!nameMatch && !admMatch && !rollMatch) return false;
                }
                return true;
              }).sort((a: any, b: any) => {
                // Sort pre-linked children to top if present
                const aIsLinked = linkedChildStudentIds.includes(a.id);
                const bIsLinked = linkedChildStudentIds.includes(b.id);
                if (aIsLinked && !bIsLinked) return -1;
                if (!aIsLinked && bIsLinked) return 1;
                return 0;
              });

              const selectedStudentObj = students.find((s: any) => s.id.toString() === addForm.studentId);

              return (
                <FormSection title="Step 3: Configuration">
                  <div style={{ padding: "0.5rem 1rem", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-md)", marginBottom: "1rem", fontSize: "0.9rem" }}>
                    <strong>Important:</strong> This concession will apply to new Fee Bills generated from the selected start date. Existing Fee Bills will not be changed.
                  </div>
                  <FormGrid className="erp-stack-sm" style={{ gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                    {isStaffChildRecipient && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <Select
                          label="Staff Member *"
                          required
                          value={addForm.staffId}
                          onChange={(e) => setAddForm({ ...addForm, staffId: e.target.value, studentId: "" })}
                          options={[{ label: "Select Staff", value: "" }, ...staffMembers.map((s: any) => ({ label: `${s.user?.name || s.user?.email}${s.user?.role ? ` (${s.user.role})` : ""}`, value: s.id.toString() }))]}
                        />
                      </div>
                    )}
                    
                    {/* Class Filter & Autocomplete Student Search */}
                    <div className="erp-stack-sm" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem", alignItems: "start" }}>
                      <Select
                        label="Filter By Class / Section"
                        value={selectedClassSectionId}
                        onChange={(e) => setSelectedClassSectionId(e.target.value)}
                        options={[
                          { label: "All Classes & Sections", value: "ALL" },
                          ...classSections.map((cs: any) => ({
                            label: `${cs.className} - ${cs.section}`,
                            value: cs.id.toString(),
                          })),
                        ]}
                      />

                      <div style={{ position: "relative" }}>
                        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--erp-text)", display: "block", marginBottom: "0.35rem" }}>
                          Student *
                        </label>
                        <div style={{ position: "relative" }}>
                          <Input
                            placeholder={isStaffChildRecipient && !addForm.staffId ? "Select Staff Member first..." : "Type student name or admission no..."}
                            value={studentSearchQuery}
                            disabled={isStaffChildRecipient && !addForm.staffId}
                            onChange={(e) => {
                              setStudentSearchQuery(e.target.value);
                              setShowStudentSuggestions(true);
                              if (addForm.studentId) setAddForm({ ...addForm, studentId: "" });
                            }}
                            onFocus={() => setShowStudentSuggestions(true)}
                          />
                          {addForm.studentId && (
                            <button
                              type="button"
                              onClick={() => {
                                setAddForm({ ...addForm, studentId: "" });
                                setStudentSearchQuery("");
                              }}
                              style={{
                                position: "absolute",
                                right: "0.75rem",
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--erp-text-muted)",
                                fontSize: "1.1rem",
                                lineHeight: 1,
                              }}
                              title="Clear Student Selection"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {/* Floating Live Suggestions */}
                        {showStudentSuggestions && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              zIndex: 999,
                              maxHeight: "220px",
                              overflowY: "auto",
                              background: "var(--erp-surface)",
                              border: "1px solid var(--erp-border)",
                              borderRadius: "var(--erp-radius-sm)",
                              boxShadow: "var(--erp-shadow-lg)",
                              marginTop: "0.25rem",
                            }}
                          >
                            {filteredStudentsList.length === 0 ? (
                              <div style={{ padding: "0.75rem", fontSize: "0.85rem", color: "var(--erp-text-muted)", textAlign: "center" }}>
                                {isStaffChildRecipient && !addForm.staffId
                                  ? "Please select a Staff Member first"
                                  : "No matching students found"}
                              </div>
                            ) : (
                              filteredStudentsList.map((st: any) => {
                                const isSelected = addForm.studentId === st.id.toString();
                                return (
                                  <div
                                    key={st.id}
                                    onClick={() => {
                                      setAddForm({ ...addForm, studentId: st.id.toString() });
                                      setStudentSearchQuery(`${st.name} (${st.admissionNo})`);
                                      setShowStudentSuggestions(false);
                                    }}
                                    style={{
                                      padding: "0.6rem 0.85rem",
                                      fontSize: "0.88rem",
                                      cursor: "pointer",
                                      borderBottom: "1px solid var(--erp-border-subtle)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      background: isSelected ? "var(--erp-primary-50)" : "transparent",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--erp-surface-hover)")}
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background = isSelected ? "var(--erp-primary-50)" : "transparent")
                                    }
                                  >
                                    <div>
                                      <strong style={{ color: "var(--erp-text)" }}>{st.name}</strong>
                                      <span style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)", marginLeft: "0.5rem" }}>
                                        Adm: {st.admissionNo}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                                      {isStaffChildRecipient && linkedChildStudentIds.includes(st.id) && (
                                        <Badge tone="success">Linked Child</Badge>
                                      )}
                                      {st.classSection && (
                                        <Badge tone="neutral">
                                          Class {st.classSection.className} - {st.classSection.section}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  <Select
                    label="Concession Scheme (Preset Template) *"
                    required
                    value={addForm.concessionSchemeId}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id === "OTHER") {
                        setAddForm({ ...addForm, concessionSchemeId: "OTHER", value: "" });
                      } else {
                        const s = schemes.find(sch => sch.id.toString() === id);
                        setAddForm({ ...addForm, concessionSchemeId: id, value: s ? s.value.toString() : "" });
                      }
                    }}
                    options={[
                      { label: "Select Scheme", value: "" },
                      ...schemes.filter(s => s.type === addType).map(s => ({
                        label: `${s.name} (${s.calculationType === 'PERCENTAGE' ? s.value + '%' : '₹' + s.value})`,
                        value: s.id.toString()
                      })),
                      { label: "+ Other / Custom Concession", value: "OTHER" },
                    ]}
                  />

                  {addForm.concessionSchemeId === "OTHER" && (
                    <>
                      <Input
                        label="Custom Concession Name *"
                        placeholder="e.g. Sports Excellence Scholarship"
                        required
                        value={customSchemeName}
                        onChange={(e) => setCustomSchemeName(e.target.value)}
                      />

                      <Select
                        label="Discount Mode *"
                        value={customCalcType}
                        onChange={(e) => setCustomCalcType(e.target.value as any)}
                        options={[
                          { label: "Flat Amount (₹)", value: "FLAT" },
                          { label: "Percentage Discount (%)", value: "PERCENTAGE" },
                        ]}
                      />
                    </>
                  )}
                  
                  <Input
                    label={customCalcType === "PERCENTAGE" && addForm.concessionSchemeId === "OTHER" ? "Benefit Value (%) *" : "Benefit Value (₹ / %) *"}
                    required
                    type="number"
                    placeholder={customCalcType === "PERCENTAGE" ? "e.g. 15" : "e.g. 500"}
                    value={addForm.value}
                    onChange={(e) => setAddForm({ ...addForm, value: e.target.value })}
                  />

                  <div>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--erp-text)", display: "block", marginBottom: "0.35rem" }}>
                      Applies To (Fee Heads)
                    </label>

                    {feeHeads.length === 0 ? (
                      <div style={{ padding: "0.5rem 0.75rem", backgroundColor: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        No specific fee heads configured. Concession will apply to <strong>All Fee Heads</strong>.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", padding: "0.5rem", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", backgroundColor: "var(--erp-surface)", maxHeight: "140px", overflowY: "auto" }}>
                          {feeHeads.map((f: any) => {
                            const isSelected = addForm.applicableHeads.includes(f.id.toString());
                            return (
                              <label
                                key={f.id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                  padding: "0.3rem 0.6rem",
                                  borderRadius: "4px",
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                  backgroundColor: isSelected ? "rgba(2, 132, 199, 0.1)" : "var(--bg-secondary, #f1f5f9)",
                                  border: `1px solid ${isSelected ? "#0284c7" : "var(--erp-border, #cbd5e1)"}`,
                                  color: isSelected ? "#0369a1" : "inherit",
                                  userSelect: "none"
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const headId = f.id.toString();
                                    if (e.target.checked) {
                                      setAddForm({ ...addForm, applicableHeads: [...addForm.applicableHeads, headId] });
                                    } else {
                                      setAddForm({ ...addForm, applicableHeads: addForm.applicableHeads.filter(id => id !== headId) });
                                    }
                                  }}
                                />
                                {f.name}
                              </label>
                            );
                          })}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
                          {addForm.applicableHeads.length === 0 ? "Leaving all unchecked applies concession to ALL fee heads." : `${addForm.applicableHeads.length} fee head(s) selected.`}
                        </span>
                      </>
                    )}
                  </div>

                  <Input
                    label="Starts From"
                    type="date"
                    required
                    value={addForm.startsFrom}
                    onChange={(e) => setAddForm({ ...addForm, startsFrom: e.target.value })}
                  />

                  <Input
                    label="Valid Until (Optional)"
                    type="date"
                    value={addForm.endsOn}
                    onChange={(e) => setAddForm({ ...addForm, endsOn: e.target.value })}
                  />

                  <Input
                    label="Reason / Notes"
                    value={addForm.reason}
                    onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                  />

                </FormGrid>
                <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "flex-end" }}>
                  <Button type="button" variant="ghost" onClick={() => setAddStep(2)}>Back</Button>
                  <Button type="submit" isLoading={isAssigning}>Assign Concession</Button>
                </div>
              </FormSection>
            );
          })()}
          </form>
        </Modal>
      )}

      {/* Details Modal */}
      {isDetailModalOpen && selectedConcession && !isEndConfirmOpen && (
        <Modal title="Concession Detail" onClose={() => setIsDetailModalOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Student Header Card */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-md)", padding: "1rem 1.25rem" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--erp-text)" }}>
                  {selectedConcession.student?.name}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)", marginTop: "0.2rem" }}>
                  {selectedConcession.student?.classSection
                    ? `Class: ${selectedConcession.student.classSection.className} - ${selectedConcession.student.classSection.section}`
                    : "Student Record"}
                </div>
              </div>
              <Badge tone={selectedConcession.status === "ACTIVE" ? "success" : "neutral"}>
                {selectedConcession.status}
              </Badge>
            </div>

            {/* 2-Column Summary */}
            <div className="erp-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-md)", padding: "1rem 1.25rem" }}>
              <div>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--erp-text-muted)", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Benefit
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--erp-text)" }}>
                  {selectedConcession.concessionScheme?.name || selectedConcession.reason || selectedConcession.type}{" "}
                  <span style={{ color: "var(--erp-primary-600)" }}>
                    ({selectedConcession.calculationType === "PERCENTAGE" ? `${selectedConcession.value}%` : `₹${selectedConcession.value}`})
                  </span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--erp-text-muted)", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Valid Period
                </div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--erp-text)" }}>
                  {selectedConcession.startsFrom ? formatMonthYear(selectedConcession.startsFrom) : "-"} &rarr;{" "}
                  {selectedConcession.endsOn ? formatMonthYear(selectedConcession.endsOn) : "Ongoing"}
                </div>
              </div>
            </div>

            {/* Why is this fee different banner */}
            {selectedConcession.type === "STAFF_CHILD" && selectedConcession.staff && (
              <div style={{ padding: "1rem 1.25rem", background: "rgba(2, 132, 199, 0.04)", border: "1px solid rgba(2, 132, 199, 0.2)", borderRadius: "var(--erp-radius-md)" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--erp-primary-700)", marginBottom: "0.35rem" }}>
                  Why is this fee different?
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--erp-text)" }}>
                  Eligible because student is a child of <strong>{selectedConcession.staff?.user?.name}</strong> (Staff Category: {selectedConcession.staff?.staffCategory}).
                </div>
              </div>
            )}

            {/* What the concession does — stated from the concession itself, no invented base fee */}
            <div style={{ padding: "1.25rem", background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-md)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--erp-text)", marginBottom: "0.5rem" }}>
                Effect on fees
              </div>
              <div style={{ fontSize: "0.9rem", color: "var(--erp-text)" }}>
                {selectedConcession.calculationType === "PERCENTAGE"
                  ? `${Number(selectedConcession.value)}% off`
                  : `₹${Number(selectedConcession.value).toLocaleString("en-IN")} off`}{" "}
                {selectedConcession.applicableHeads && selectedConcession.applicableHeads.length > 0
                  ? "the selected fee heads"
                  : "each applicable fee"}{" "}
                on every bill generated while the concession is active.
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--erp-text-muted)", marginTop: "0.5rem" }}>
                The exact rupee amount appears on each bill and in the student's fee history.
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--erp-border)", paddingTop: "1rem", marginTop: "0.25rem" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
                Approved by <strong style={{ color: "var(--erp-text)" }}>{selectedConcession.approvedByUser?.name || "System Super Admin"}</strong>
              </div>
              {selectedConcession.status === "ACTIVE" && (
                <Button variant="danger" size="sm" onClick={() => setIsEndConfirmOpen(true)}>
                  End Concession
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* End Concession Confirm Modal */}
      {isEndConfirmOpen && (
        <Modal title="End Concession?" onClose={() => setIsEndConfirmOpen(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p>This will stop the concession for future fee bills. Previously issued fee bills will not change.</p>
            <Input
              label="Effective From"
              type="date"
              required
              value={endEffectiveDate}
              onChange={(e) => setEndEffectiveDate(e.target.value)}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button variant="ghost" onClick={() => setIsEndConfirmOpen(false)}>Cancel</Button>
              <Button variant="danger" isLoading={isEnding} onClick={handleEndConcession} disabled={!endEffectiveDate}>Confirm End</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminConcessionsPage;
