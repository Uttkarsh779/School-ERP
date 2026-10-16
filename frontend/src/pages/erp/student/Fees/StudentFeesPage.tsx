import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
  Table,
} from "../../../../components/ui";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import {
  useCreateRazorpayOrderMutation,
  useGetStudentDueSummaryQuery,
  useGetStudentLedgerQuery,
  useGetInvoicesQuery,
  useVerifyRazorpayPaymentMutation,
} from "../../../../store/api/fees.api";
import styles from "./StudentFeesPage.module.css";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const StudentFeesPage = () => {
  const [activeTab, setActiveTab] = useState<"dues" | "ledger">("dues");
  const [customPayAmount, setCustomPayAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [successModalData, setSuccessModalData] = useState<any | null>(null);
  const [selectedInvoiceForBreakdown, setSelectedInvoiceForBreakdown] = useState<any | null>(null);

  const { data: profile, isLoading: isLoadingProfile } = useGetMyStudentProfileQuery();

  const {
    data: dueSummary,
    isLoading: isLoadingSummary,
    refetch: refetchDues,
  } = useGetStudentDueSummaryQuery(profile?.id ?? 0, { skip: !profile });

  const { data: ledgerData, isLoading: isLoadingLedger } = useGetStudentLedgerQuery(profile?.id ?? 0, {
    skip: !profile || activeTab !== "ledger",
  });

  const { data: invoicesList, refetch: refetchInvoices } = useGetInvoicesQuery(
    { studentId: profile?.id },
    { skip: !profile }
  );

  const [createRazorpayOrder] = useCreateRazorpayOrderMutation();
  const [verifyRazorpayPayment] = useVerifyRazorpayPaymentMutation();

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const handlePayNow = async (targetAmount?: number) => {
    if (!profile) return;

    const amountToPay = targetAmount || (customPayAmount ? parseFloat(customPayAmount) : dueSummary?.netPayable || 0);

    if (amountToPay <= 0) {
      toast.error("Payment amount must be greater than 0");
      return;
    }

    try {
      setIsProcessing(true);
      const res = await createRazorpayOrder({
        studentId: profile.id,
        requestedAmount: amountToPay,
      }).unwrap();

      const options = {
        key: res.keyId || "rzp_test_key",
        amount: res.amount * 100,
        currency: "INR",
        name: "Dream Academy School",
        description: `Fee Payment - ${profile.name}`,
        order_id: res.orderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await verifyRazorpayPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              studentId: profile.id,
            }).unwrap();

            toast.success("Payment Successful & Verified!");
            setSuccessModalData(verifyRes.data || verifyRes);
            refetchDues();
            refetchInvoices();
          } catch (err: any) {
            toast.error(err?.data?.message || "Payment verification failed");
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: profile.name,
          contact: profile.contactNumber || profile.fatherContact || "",
        },
        theme: {
          color: "#0f2a47",
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to initiate payment");
      setIsProcessing(false);
    }
  };

  const handleOpenReceipt = (paymentId: number) => {
    const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    window.open(`${backendUrl}/payments/${paymentId}/receipt/pdf`, "_blank");
  };

  if (isLoadingProfile || isLoadingSummary) {
    return (
      <div className={styles.container}>
        <PageHeader title="School Fees & Payment" />
        <Spinner />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <PageHeader title="School Fees & Payment" />
        <EmptyState title="Profile not found" description="Unable to load student profile." />
      </div>
    );
  }

  const totalInvoiceBilled = invoicesList?.reduce((sum: number, inv: any) => sum + Number(inv.totalAmount || 0), 0) || 0;
  const totalInvoicePaid = invoicesList?.reduce((sum: number, inv: any) => sum + Number(inv.paidAmount || 0), 0) || 0;
  const totalInvoiceDue = Math.max(0, totalInvoiceBilled - totalInvoicePaid);

  const displayTotalBilled = (dueSummary?.totalOutstanding ?? 0) > 0 ? (dueSummary?.totalOutstanding ?? 0) : totalInvoiceBilled;
  const displayNetPayable = (dueSummary?.netPayable ?? 0) > 0 ? (dueSummary?.netPayable ?? 0) : totalInvoiceDue;
  const isPaidInFull = displayNetPayable <= 0;

  return (
    <div className={styles.container}>
      <PageHeader
        title="School Fees & Online Payment"
        subtitle={`${profile.name} · Admission No: ${profile.admissionNo}`}
      />

      {/* CLEAN THEME OUTSTANDING CARD */}
      <div className={styles.dueCard}>
        <div className={styles.dueHeader}>
          <div>
            <div className={styles.dueLabel}>Net Outstanding Balance</div>
            <div className={styles.dueAmount}>
              ₹{Number(displayNetPayable || 0).toLocaleString("en-IN")}
            </div>
          </div>
          <Badge tone={isPaidInFull ? "success" : "warning"}>
            {isPaidInFull ? "Paid in Full" : "Pending Dues"}
          </Badge>
        </div>

        <div className={styles.summaryRow}>
          <div>
            <div className={styles.summaryLabel}>Total Billed</div>
            <div className={styles.summaryVal}>₹{Number(displayTotalBilled || 0).toLocaleString("en-IN")}</div>
          </div>
          <div>
            <div className={styles.summaryLabel}>Advance Balance</div>
            <div className={styles.summaryVal}>₹{(dueSummary?.totalAdvanceAvailable || 0).toLocaleString("en-IN")}</div>
          </div>
        </div>

        {!isPaidInFull && (
          <div className={styles.payActions}>
            <div className={styles.customPayRow}>
              <input
                type="number"
                placeholder="Custom amount (optional)..."
                className={styles.customPayInput}
                value={customPayAmount}
                onChange={(e) => setCustomPayAmount(e.target.value)}
              />
              <button
                type="button"
                className={styles.payNowBtn}
                disabled={isProcessing}
                onClick={() => handlePayNow()}
              >
                {isProcessing
                  ? "Processing..."
                  : `Pay ₹${(customPayAmount ? parseFloat(customPayAmount) || 0 : displayNetPayable).toLocaleString("en-IN")} Now →`}
              </button>
            </div>

            <div className={styles.quickPills}>
              <button type="button" className={styles.pillBtn} onClick={() => setCustomPayAmount("1000")}>₹1,000</button>
              <button type="button" className={styles.pillBtn} onClick={() => setCustomPayAmount("2000")}>₹2,000</button>
              <button type="button" className={styles.pillBtn} onClick={() => setCustomPayAmount("5000")}>₹5,000</button>
              <button type="button" className={styles.pillBtn} onClick={() => setCustomPayAmount("")}>Full Amount</button>
            </div>
          </div>
        )}
      </div>

      {/* TAB NAVIGATION */}
      <div className={styles.tabRow}>
        <Button
          variant={activeTab === "dues" ? "primary" : "outline"}
          onClick={() => setActiveTab("dues")}
        >
          Fee Bills & Dues
        </Button>
        <Button
          variant={activeTab === "ledger" ? "primary" : "outline"}
          onClick={() => setActiveTab("ledger")}
        >
          Financial Ledger History
        </Button>
      </div>

      {/* TAB 1: DUES & FEE BILLS */}
      {activeTab === "dues" && (
        <>
          {/* MOBILE CARDS VIEW */}
          <div className={styles.mobileCardView}>
            {!invoicesList || invoicesList.length === 0 ? (
              <EmptyState title="No Fee Bills Issued" description="All fee charges are up to date!" />
            ) : (
              <div className={styles.mobileCardsList}>
                {invoicesList.map((bill: any) => {
                  const dueAmt = Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount || 0));
                  return (
                    <div key={bill.id} className={styles.billCard}>
                      <div className={styles.billHeader}>
                        <div>
                          <div className={styles.billNo}>{bill.invoiceNumber}</div>
                          <div className={styles.billPeriod}>{bill.collectionPeriodCode || "Monthly Fee"}</div>
                        </div>
                        <Badge tone={bill.status === "PAID" ? "success" : bill.status === "OVERDUE" ? "danger" : "warning"}>
                          {bill.status}
                        </Badge>
                      </div>

                      <div className={styles.billRow}>
                        <div>
                          <div className={styles.summaryLabel}>Total Bill</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                            ₹{Number(bill.totalAmount).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className={styles.summaryLabel}>Balance Due</div>
                          <div style={{ fontSize: "1rem", fontWeight: 800, color: dueAmt > 0 ? "var(--erp-danger)" : "var(--erp-success)" }}>
                            ₹{dueAmt.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      <div className={styles.billFooter}>
                        <div className={styles.summaryLabel}>
                          Due: {new Date(bill.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedInvoiceForBreakdown(bill)}
                          >
                            Details
                          </Button>
                          {dueAmt > 0 ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isProcessing}
                              onClick={() => handlePayNow(dueAmt)}
                            >
                              Pay ₹{dueAmt.toLocaleString("en-IN")}
                            </Button>
                          ) : (
                            <span style={{ color: "var(--erp-success)", fontWeight: 700, fontSize: "0.85rem" }}>✓ Paid</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DESKTOP TABLE VIEW */}
          <div className={styles.desktopTableView}>
            <Card title="Monthly Fee Bills & Statements">
              {!invoicesList || invoicesList.length === 0 ? (
                <EmptyState title="No Fee Bills Issued" description="All fee charges are up to date!" />
              ) : (
                <Table
                  keyField="id"
                  columns={[
                    { key: "invoiceNumber", label: "Fee Bill No", render: (r: any) => <strong>{r.invoiceNumber}</strong> },
                    {
                      key: "collectionPeriodCode",
                      label: "Billing Period",
                      render: (r: any) => r.collectionPeriodCode || "Monthly Fee",
                    },
                    {
                      key: "dueDate",
                      label: "Last Date to Pay",
                      render: (r: any) => new Date(r.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                    },
                    {
                      key: "totalAmount",
                      label: "Total Amount",
                      render: (r: any) => `₹${Number(r.totalAmount).toLocaleString("en-IN")}`,
                    },
                    {
                      key: "paidAmount",
                      label: "Paid Amount",
                      render: (r: any) => `₹${Number(r.paidAmount || 0).toLocaleString("en-IN")}`,
                    },
                    {
                      key: "due",
                      label: "Balance Due",
                      render: (r: any) => {
                        const dueAmt = Math.max(0, Number(r.totalAmount) - Number(r.paidAmount || 0));
                        return <strong style={{ color: dueAmt > 0 ? "var(--erp-danger)" : "var(--erp-success)" }}>₹{dueAmt.toLocaleString("en-IN")}</strong>;
                      },
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => (
                        <Badge tone={r.status === "PAID" ? "success" : r.status === "OVERDUE" ? "danger" : "warning"}>
                          {r.status}
                        </Badge>
                      ),
                    },
                    {
                      key: "action",
                      label: "Actions",
                      render: (r: any) => {
                        const dueAmt = Math.max(0, Number(r.totalAmount) - Number(r.paidAmount || 0));
                        return (
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedInvoiceForBreakdown(r)}
                            >
                              View Components
                            </Button>
                            {dueAmt > 0 ? (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={isProcessing}
                                onClick={() => handlePayNow(dueAmt)}
                              >
                                Pay ₹{dueAmt.toLocaleString("en-IN")} →
                              </Button>
                            ) : (
                              <span style={{ color: "var(--erp-success)", fontWeight: 600 }}>✓ Paid</span>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  data={invoicesList}
                />
              )}
            </Card>
          </div>
        </>
      )}

      {/* TAB 2: FINANCIAL LEDGER */}
      {activeTab === "ledger" && (
        <Card title="Student Financial Ledger History">
          {isLoadingLedger ? (
            <Spinner />
          ) : !ledgerData?.entries || ledgerData.entries.length === 0 ? (
            <EmptyState title="No financial history" description="No charges or payments recorded." />
          ) : (
            <Table
              keyField="date"
              columns={[
                { key: "date", label: "Date", render: (e: any) => new Date(e.date).toLocaleDateString("en-IN") },
                { key: "description", label: "Description" },
                { key: "type", label: "Type", render: (e: any) => <Badge tone={e.type === "PAYMENT" ? "success" : "info"}>{e.type}</Badge> },
                { key: "debit", label: "Debit (Charges)", render: (e: any) => e.debit > 0 ? <span style={{ color: "var(--erp-danger)" }}>₹{Number(e.debit).toLocaleString("en-IN")}</span> : "—" },
                { key: "credit", label: "Credit (Paid)", render: (e: any) => e.credit > 0 ? <span style={{ color: "var(--erp-success)" }}>₹{Number(e.credit).toLocaleString("en-IN")}</span> : "—" },
                { key: "balance", label: "Balance", render: (e: any) => <strong>₹{Number(e.balance).toLocaleString("en-IN")}</strong> },
              ]}
              data={ledgerData.entries}
            />
          )}
        </Card>
      )}

      {/* VERIFIED SUCCESS MODAL */}
      {successModalData && (
        <Modal title="Payment Successful ✓" onClose={() => setSuccessModalData(null)}>
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <div style={{ fontSize: "3rem", color: "var(--erp-success)", marginBottom: "0.5rem" }}>✓</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1rem 0" }}>Payment Verified & Confirmed</h2>
            <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "1rem", textAlign: "left", marginBottom: "1.25rem", fontSize: "0.88rem" }}>
              <p><strong>Receipt Number:</strong> {successModalData.receiptNumber}</p>
              <p><strong>Amount Paid:</strong> ₹{(successModalData.payment?.amount || 0).toLocaleString("en-IN")}</p>
              <p><strong>Payment Mode:</strong> Razorpay Gateway</p>
              <p><strong>Razorpay Order ID:</strong> {successModalData.payment?.razorpayPaymentId || "Verified"}</p>
            </div>
            <Button variant="primary" onClick={() => handleOpenReceipt(successModalData.payment?.id)}>
              View & Download PDF Receipt
            </Button>
          </div>
        </Modal>
      )}

      {/* FEE BILL DETAILED COMPONENTS BREAKDOWN MODAL */}
      {selectedInvoiceForBreakdown && (
        <Modal
          title={`Fee Bill Breakdown — ${selectedInvoiceForBreakdown.invoiceNumber}`}
          onClose={() => setSelectedInvoiceForBreakdown(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "1rem", fontSize: "0.88rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>Billing Period: <strong>{selectedInvoiceForBreakdown.collectionPeriodCode || "Monthly Fee"}</strong></div>
              <div>Last Payment Date: <strong>{new Date(selectedInvoiceForBreakdown.dueDate).toLocaleDateString("en-IN")}</strong></div>
              <div>Total Bill Amount: <strong>₹{Number(selectedInvoiceForBreakdown.totalAmount).toLocaleString("en-IN")}</strong></div>
              <div>Status: <strong>{selectedInvoiceForBreakdown.status}</strong></div>
            </div>

            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--erp-text)" }}>
              Detailed Component Items Included:
            </div>

            <Table
              keyField="id"
              columns={[
                {
                  key: "description",
                  label: "Fee Component Head",
                  render: (item: any) => item.feeCharge?.feeHead?.name || item.description || "Tuition Fee",
                },
                {
                  key: "code",
                  label: "Code",
                  render: (item: any) => item.feeCharge?.feeHead?.code || "TUITION",
                },
                {
                  key: "amount",
                  label: "Amount",
                  render: (item: any) => <strong>₹{Number(item.amount).toLocaleString("en-IN")}</strong>,
                },
              ]}
              data={selectedInvoiceForBreakdown.items && selectedInvoiceForBreakdown.items.length > 0 ? selectedInvoiceForBreakdown.items : [
                { id: 1, description: "Monthly Tuition Fee", code: "TUITION", amount: selectedInvoiceForBreakdown.totalAmount }
              ]}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" onClick={() => setSelectedInvoiceForBreakdown(null)}>
                Close
              </Button>
              {Math.max(0, Number(selectedInvoiceForBreakdown.totalAmount) - Number(selectedInvoiceForBreakdown.paidAmount || 0)) > 0 && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const dueAmt = Math.max(0, Number(selectedInvoiceForBreakdown.totalAmount) - Number(selectedInvoiceForBreakdown.paidAmount || 0));
                    setSelectedInvoiceForBreakdown(null);
                    handlePayNow(dueAmt);
                  }}
                >
                  Pay ₹{Math.max(0, Number(selectedInvoiceForBreakdown.totalAmount) - Number(selectedInvoiceForBreakdown.paidAmount || 0)).toLocaleString("en-IN")} Now →
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentFeesPage;
