import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { PageHeader, Button, Badge, Spinner, EmptyState, Icon, Table, Card, StatCard } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetParentByIdQuery, useGetParentDuesSummaryQuery } from "../../../../store/api/parents.api";
import RecordStudentPaymentModal from "./RecordStudentPaymentModal.tsx";
import LinkChildModal from "./LinkChildModal.tsx";
import styles from "./FamilyProfilePage.module.css";

const FamilyProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const parentId = Number(id);
  const [activeTab, setActiveTab] = useState("dues");
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState<{
    student: any;
    netDue: number;
  } | null>(null);
  const [showLinkChildModal, setShowLinkChildModal] = useState(false);

  const { data: parent, isLoading: isLoadingParent } = useGetParentByIdQuery(parentId);
  const { data: duesSummary, isLoading: isLoadingDues } = useGetParentDuesSummaryQuery(parentId);

  if (isLoadingParent || isLoadingDues) {
    return (
      <div className={styles.page}>
        <Spinner />
      </div>
    );
  }

  if (!parent || !duesSummary) {
    return (
      <div className={styles.page}>
        <EmptyState title="Family not found" description="The family you are looking for does not exist." />
      </div>
    );
  }

  const tabs = [
    { id: "dues", label: "Family Dues & Payments" },
    { id: "children", label: "Linked Children" },
  ];

  const childrenColumns: TableColumn<any>[] = [
    { key: "name", label: "Student Name", render: (r) => r.student.name },
    { key: "admissionNo", label: "Admission No", render: (r) => r.student.admissionNo },
    { key: "relationship", label: "Relationship", render: (r) => r.relationshipType || "—" },
    { key: "actions", label: "", render: (r) => (
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/students/${r.student.id}`)}>
          View Ledger
        </Button>
      </div>
    )}
  ];

  const displayName = parent.name && parent.name !== "Unknown" ? parent.name : (parent.children?.[0]?.student?.fatherName || "Unknown");

  return (
    <div>
      <PageHeader
        title={`${displayName} Family`}
        subtitle={`Contact: ${parent.contact || "N/A"} | Email: ${parent.email || "N/A"}`}
        actions={
          <div style={{ display: "flex", gap: "10px" }}>
            <Button variant="outline" onClick={() => navigate("/admin/parents")}>
              Back
            </Button>
            <Button icon={<Icon name="plus" size={16} />} variant="outline" onClick={() => setShowLinkChildModal(true)}>
              Link Student
            </Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <StatCard 
          label="Total Family Due" 
          value={`₹${duesSummary.familyTotal.toLocaleString()}`} 
          trend={duesSummary.familyTotal > 0 ? { value: 1, label: "Due", isPositive: false } : undefined}
        />
        <StatCard 
          label="Linked Children" 
          value={parent.children.length.toString()} 
        />
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "primary" : "outline"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "dues" && (
        <Card padded title="Family Dues & Breakdowns">
          {duesSummary.childrenSummaries.length === 0 ? (
            <EmptyState title="No dues found" description="There are no children linked to this family yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {duesSummary.childrenSummaries.map((childSummary) => (
                <div key={childSummary.student.id} style={{ border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-lg)", padding: "16px", background: "var(--erp-surface)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", color: "var(--erp-text)" }}>{childSummary.student.name}</h3>
                      <div style={{ fontSize: "0.875rem", color: "var(--erp-text-muted)" }}>
                        Class {childSummary.student.classSection?.className} {childSummary.student.classSection?.section} • Roll No: {childSummary.student.rollNo}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Badge tone={childSummary.dueSummary.netPayable > 0 ? "danger" : "success"}>
                        Due: ₹{childSummary.dueSummary.netPayable.toLocaleString()}
                      </Badge>
                      {childSummary.dueSummary.netPayable > 0 && (
                        <Button
                          size="sm"
                          icon={<Icon name="wallet" size={14} />}
                          onClick={() => setSelectedStudentForPayment({
                            student: childSummary.student,
                            netDue: childSummary.dueSummary.netPayable
                          })}
                        >
                          Record Payment
                        </Button>
                      )}
                    </div>
                  </div>

                  {childSummary.dueSummary.charges.length > 0 ? (
                    <div style={{ background: "var(--erp-background, #fff)", borderRadius: "var(--erp-radius-md)", border: "1px solid var(--erp-border)", overflow: "hidden" }}>
                      <Table
                        columns={[
                          { key: "head", label: "Fee Component" },
                          { key: "base", label: "Base Amount", render: (r: any) => `₹${r.baseAmount.toLocaleString()}` },
                          { key: "discount", label: "Discount", render: (r: any) => r.discountAmount > 0 ? <span style={{ color: "var(--erp-success)", fontWeight: 500 }}>-₹{r.discountAmount.toLocaleString()}</span> : "—" },
                          { key: "late", label: "Late Fee", render: (r: any) => r.lateFeeAmount > 0 ? <span style={{ color: "var(--erp-danger)", fontWeight: 500 }}>+₹{r.lateFeeAmount.toLocaleString()}</span> : "—" },
                          { key: "paid", label: "Paid", render: (r: any) => r.paidAmount > 0 ? <span style={{ color: "var(--erp-success)", fontWeight: 500 }}>-₹{r.paidAmount.toLocaleString()}</span> : "—" },
                          { key: "net", label: "Net Due", render: (r: any) => {
                             const net = r.baseAmount - r.discountAmount + r.lateFeeAmount;
                             const due = Math.max(0, net - r.paidAmount);
                             return <strong style={{color:"var(--erp-text)", fontSize: "1.05rem"}}>₹{due.toLocaleString()}</strong>;
                          }}
                        ]}
                        data={childSummary.dueSummary.charges.filter((c: any) => {
                          const net = c.baseAmount - c.discountAmount + c.lateFeeAmount;
                          return Math.max(0, net - c.paidAmount) > 0;
                        }).map((c: any) => ({
                           ...c,
                           head: `${c.feeHead.name} (Month ${c.billingMonth})`
                        }))}
                        keyField="id"
                        emptyMessage="No outstanding charges."
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", fontWeight: 700, color: "var(--erp-text)", borderTop: "1px solid var(--erp-border)", background: "var(--erp-primary-50)", flexWrap: "wrap", gap: "10px" }}>
                        <span>Net Payable for {childSummary.student.name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontSize: "1.1rem" }}>₹{childSummary.dueSummary.netPayable.toLocaleString()}</span>
                          {childSummary.dueSummary.netPayable > 0 && (
                            <Button
                              size="sm"
                              icon={<Icon name="wallet" size={14} />}
                              onClick={() => setSelectedStudentForPayment({
                                student: childSummary.student,
                                netDue: childSummary.dueSummary.netPayable
                              })}
                            >
                              Record Payment
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "var(--erp-text-muted)", fontSize: "0.875rem", padding: "8px 0" }}>No outstanding charges.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === "children" && (
        <Card padded title="Linked Children Roster">
          <Table
            columns={childrenColumns}
            data={parent.children}
            keyField="id"
            emptyMessage="No children linked to this family."
          />
        </Card>
      )}

      {selectedStudentForPayment && (
        <RecordStudentPaymentModal 
          student={selectedStudentForPayment.student}
          netDue={selectedStudentForPayment.netDue}
          onClose={() => setSelectedStudentForPayment(null)} 
        />
      )}
      {showLinkChildModal && (
        <LinkChildModal 
          parentId={parentId} 
          onClose={() => setShowLinkChildModal(false)} 
        />
      )}
    </div>
  );
};

export default FamilyProfilePage;
