import { useNavigate } from "react-router-dom";
import { Badge, Button, FormSection, Spinner, Table } from "../../ui";
import { useGetFeePaymentsQuery, useGetInvoicesQuery } from "../../../store/api/fees.api";

interface StudentFeeHistoryCardProps {
  student: any;
}

const StudentFeeHistoryCard = ({ student }: StudentFeeHistoryCardProps) => {
  const navigate = useNavigate();
  const { data: invoices, isLoading: loadingInvoices } = useGetInvoicesQuery({ studentId: student.id });
  const { data: payments, isLoading: loadingPayments } = useGetFeePaymentsQuery({ studentId: student.id });

  const totalBilled = invoices?.reduce((acc, inv) => acc + Number(inv.totalAmount || 0), 0) || 0;
  const totalPaid = payments?.reduce((acc, p) => acc + Number(p.amount || 0), 0) || 0;
  const netDue = Math.max(0, totalBilled - totalPaid);

  return (
    <FormSection title="Fee Overview & Financial Summary">
      {/* Financial Overview Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
          Financial Summary for Student Record #{student.admissionNo}
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/student/fees")}>
          Go to Fees Page →
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "0.85rem" }}>
          <div style={{ color: "var(--erp-text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>Total Billed Fees</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--erp-text)", marginTop: "0.2rem" }}>
            ₹{totalBilled.toLocaleString("en-IN")}
          </div>
        </div>
        <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "0.85rem" }}>
          <div style={{ color: "var(--erp-text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>Total Fees Paid</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--erp-success)", marginTop: "0.2rem" }}>
            ₹{totalPaid.toLocaleString("en-IN")}
          </div>
        </div>
        <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "0.85rem" }}>
          <div style={{ color: "var(--erp-text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>Outstanding Balance Due</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: netDue > 0 ? "var(--erp-danger)" : "var(--erp-success)", marginTop: "0.2rem" }}>
            ₹{netDue.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* DETAILED FEE BILLS & PAYMENT HISTORY TABLE */}
      {loadingInvoices || loadingPayments ? (
        <Spinner />
      ) : (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <Table
            keyField="id"
            columns={[
              {
                key: "invoiceNumber",
                label: "Fee Bill / Receipt No",
                render: (r: any) => r.invoiceNumber || r.receiptNumber || r.transactionRef || `BILL-${r.id}`,
              },
              {
                key: "dueDate",
                label: "Date",
                render: (r: any) =>
                  r.dueDate
                    ? new Date(r.dueDate).toLocaleDateString("en-IN")
                    : r.paidAt
                    ? new Date(r.paidAt).toLocaleDateString("en-IN")
                    : new Date(r.createdAt || Date.now()).toLocaleDateString("en-IN"),
              },
              {
                key: "totalAmount",
                label: "Amount",
                render: (r: any) => `₹${Number(r.totalAmount || r.amount || 0).toLocaleString("en-IN")}`,
              },
              {
                key: "status",
                label: "Status",
                render: (r: any) => (
                  <Badge tone={r.status === "PAID" || !r.status ? "success" : r.status === "OVERDUE" ? "danger" : "warning"}>
                    {r.status || "PAID"}
                  </Badge>
                ),
              },
            ]}
            data={invoices && invoices.length > 0 ? invoices : payments || []}
          />
        </div>
      )}
    </FormSection>
  );
};

export default StudentFeeHistoryCard;
