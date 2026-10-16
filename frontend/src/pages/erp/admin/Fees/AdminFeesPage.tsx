import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Table,
} from "../../../../components/ui";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useAppSelector } from "../../../../store/store";
import FeeReceipt from "../../../../components/shared/FeeReceipt/FeeReceipt";
import {
  useCreateFeeHeadMutation,
  useUpdateFeeHeadMutation,
  useDeleteFeeHeadMutation,
  useCreateFeeStructureMutation,
  useUpdateFeeStructureMutation,
  useDeleteFeeStructureMutation,
  useBulkPreviewFeeStructuresMutation,
  useBulkUpdateFeeStructuresMutation,
  useCreateManualPaymentMutation,
  useGenerateFeeChargesMutation,
  useGetAuditLogsQuery,
  useGetCollectionReportQuery,
  useGetFeeDefaultersQuery,
  useGetFeeHeadsQuery,
  useGetFeeStructuresQuery,
  useGetInvoicesQuery,
  useGetCollectionPeriodOverviewQuery,
  usePreviewCollectionPeriodMutation,
  useGenerateCollectionPeriodBillsMutation,
  useWaiveLateFeeMutation,
} from "../../../../store/api/fees.api";
import styles from "./AdminFeesPage.module.css";

interface PaymentReceiptData {
  receiptNo: string;
  studentName: string;
  admissionNo: string;
  rollNo: string;
  fatherName: string;
  fatherContact: string;
  className: string;
  amountPaid: number;
  mode: string;
  refNo: string;
  paidAt: string;
}

const formatClassLabel = (csObj?: any) => {
  if (!csObj) return "N/A";
  let name = typeof csObj === "string" ? csObj : (csObj.className || "");
  const sec = typeof csObj === "object" ? csObj.section : "";
  if (!name) return "N/A";
  if (!name.toLowerCase().startsWith("class")) {
    name = `Class ${name}`;
  }
  return sec ? `${name} - ${sec}` : name;
};

const AdminFeesPage = () => {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  // 4 Clean Main Tabs
  const [activeTab, setActiveTab] = useState<"structures" | "invoices" | "record_payment" | "defaulters">("record_payment");

  // Modal states
  const [showCreateHeadModal, setShowCreateHeadModal] = useState(false);
  const [showCreateStructureModal, setShowCreateStructureModal] = useState(false);

  // Bulk Selection & Editing states
  const [selectedStructureIds, setSelectedStructureIds] = useState<number[]>([]);
  const [bulkHeadId, setBulkHeadId] = useState<number | "">("");
  const [bulkHikeMode, setBulkHikeMode] = useState<"FLAT" | "PERCENT" | "FIXED">("FLAT");
  const [bulkNewAmount, setBulkNewAmount] = useState<string>("");
  const [bulkEffectiveFrom, setBulkEffectiveFrom] = useState<string>("2027-04-01");
  const [bulkPreviewData, setBulkPreviewData] = useState<any | null>(null);

  // Fee Head creation & editing state
  const [headName, setHeadName] = useState("");
  const [headCode, setHeadCode] = useState("");
  const [headDescription, setHeadDescription] = useState("");
  const [editingHeadId, setEditingHeadId] = useState<number | null>(null);

  // Structure creation state
  const [structureName, setStructureName] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<number | "">("");
  const [structureAmount, setStructureAmount] = useState("");

  // Enhanced Offline Payment recording state
  const [offlineClassId, setOfflineClassId] = useState<number | "">("");
  const [offlineSearchQuery, setOfflineSearchQuery] = useState("");
  const [offlineStudentId, setOfflineStudentId] = useState<number | "">("");
  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlineMode, setOfflineMode] = useState<"CASH" | "BANK_TRANSFER" | "UPI_MANUAL">("CASH");
  const [offlineRef, setOfflineRef] = useState("");

  // Receipt Slip & Fee Breakdown Modals state
  const [generatedReceipt, setGeneratedReceipt] = useState<PaymentReceiptData | null>(null);
  const [showFeeBreakdownModal, setShowFeeBreakdownModal] = useState(false);

  // Defaulters Roster Filter & Search state
  const [defaulterClassId, setDefaulterClassId] = useState<number | "">("");
  const [defaulterSearchQuery, setDefaulterSearchQuery] = useState("");

  // Fee Bills Roster Filter & Search state
  const [rosterClassId, setRosterClassId] = useState<number | "">("");
  const [rosterStatus, setRosterStatus] = useState<string>("");
  const [rosterSearchQuery, setRosterSearchQuery] = useState("");

  // Collection Period Dashboard & Bulk Generation state
  const { data: sessions } = useGetSessionsQuery();
  const [selectedSessionId, setSelectedSessionId] = useState<number | "">("");
  const [selectedCollectionMonth, setSelectedCollectionMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedCollectionYear, setSelectedCollectionYear] = useState<number>(2026);
  const [showBulkBillModal, setShowBulkBillModal] = useState(false);
  const [bulkBillPreview, setBulkBillPreview] = useState<any | null>(null);

  const activeSession = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    return (
      sessions.find((s) => s.id === Number(selectedSessionId)) ||
      sessions.find((s) => s.isCurrent) ||
      sessions[0]
    );
  }, [sessions, selectedSessionId]);

  const sessionMonthOptions = useMemo(() => {
    let startYr = 2026;
    if (activeSession?.startDate) {
      startYr = new Date(activeSession.startDate).getFullYear();
    } else if (activeSession?.name) {
      const match = activeSession.name.match(/\d{4}/);
      if (match) startYr = parseInt(match[0], 10);
    }

    return [
      { label: `April ${startYr}`, month: 4, year: startYr },
      { label: `May ${startYr}`, month: 5, year: startYr },
      { label: `June ${startYr}`, month: 6, year: startYr },
      { label: `July ${startYr}`, month: 7, year: startYr },
      { label: `August ${startYr}`, month: 8, year: startYr },
      { label: `September ${startYr}`, month: 9, year: startYr },
      { label: `October ${startYr}`, month: 10, year: startYr },
      { label: `November ${startYr}`, month: 11, year: startYr },
      { label: `December ${startYr}`, month: 12, year: startYr },
      { label: `January ${startYr + 1}`, month: 1, year: startYr + 1 },
      { label: `February ${startYr + 1}`, month: 2, year: startYr + 1 },
      { label: `March ${startYr + 1}`, month: 3, year: startYr + 1 },
    ];
  }, [activeSession]);

  const { data: classSections } = useGetClassSectionsQuery();
  const { data: studentsList } = useGetStudentsQuery();
  const { data: feeHeads, refetch: refetchFeeHeads } = useGetFeeHeadsQuery();
  const { data: feeStructures, refetch: refetchStructures } = useGetFeeStructuresQuery();
  const { data: defaulters, refetch: refetchDefaulters } = useGetFeeDefaultersQuery();
  const { data: invoices } = useGetInvoicesQuery();
  const { data: collectionOverview, refetch: refetchCollectionOverview } = useGetCollectionPeriodOverviewQuery({
    month: selectedCollectionMonth,
    year: selectedCollectionYear,
    sessionId: activeSession ? activeSession.id : undefined,
  });

  const [createFeeHead] = useCreateFeeHeadMutation();
  const [updateFeeHead] = useUpdateFeeHeadMutation();
  const [deleteFeeHead] = useDeleteFeeHeadMutation();
  const [createFeeStructure] = useCreateFeeStructureMutation();
  const [deleteFeeStructure] = useDeleteFeeStructureMutation();
  const [bulkPreviewFeeStructures] = useBulkPreviewFeeStructuresMutation();
  const [bulkUpdateFeeStructures] = useBulkUpdateFeeStructuresMutation();
  const [createManualPayment] = useCreateManualPaymentMutation();
  const [waiveLateFee, { isLoading: isWaivingFine }] = useWaiveLateFeeMutation();
  const [previewCollectionPeriod, { isLoading: isPreviewingBills }] = usePreviewCollectionPeriodMutation();
  const [generateCollectionPeriodBills, { isLoading: isGeneratingBills }] = useGenerateCollectionPeriodBillsMutation();

  const [showWaiveFineModal, setShowWaiveFineModal] = useState(false);
  const [waiveFineAmount, setWaiveFineAmount] = useState("");
  const [waiveFineReason, setWaiveFineReason] = useState("");

  const handleConfirmWaiveFine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentObj) return;

    try {
      await waiveLateFee({
        feeChargeIds: [],
        waiverAmountPerCharge: waiveFineAmount ? parseFloat(waiveFineAmount) : "FULL",
        reason: waiveFineReason || "Admin Approval",
      }).unwrap();

      toast.success(`Late fine waived for ${selectedStudentObj.name}`);
      setShowWaiveFineModal(false);
      setWaiveFineAmount("");
      setWaiveFineReason("");
      refetchCollectionOverview();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to waive late fine");
    }
  };

  const handleOpenBulkBillPreview = async () => {
    try {
      const res = await previewCollectionPeriod({
        billingMonth: selectedCollectionMonth,
        billingYear: selectedCollectionYear,
        sessionId: activeSession ? activeSession.id : undefined,
      }).unwrap();
      setBulkBillPreview(res);
      setShowBulkBillModal(true);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to preview collection period bills");
    }
  };

  const handleConfirmGenerateBills = async () => {
    try {
      const res = await generateCollectionPeriodBills({
        billingMonth: selectedCollectionMonth,
        billingYear: selectedCollectionYear,
        sessionId: activeSession ? activeSession.id : undefined,
      }).unwrap();
      toast.success(
        `✓ Fee Collection Complete: ${res.newlyGenerated} new Fee Bills generated! (${res.alreadyBilled} already existed)`
      );
      setShowBulkBillModal(false);
      setBulkBillPreview(null);
      refetchCollectionOverview();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to generate fee collection bills");
    }
  };

  const handleDeleteStructure = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete the fee structure "${name}"?`)) {
      try {
        await deleteFeeStructure(id).unwrap();
        toast.success("Fee structure deleted successfully");
        refetchStructures();
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to delete fee structure");
      }
    }
  };

  const handleDeleteHead = async (id: number, name: string) => {
    if (window.confirm(`Delete fee head "${name}"?\nNote: Heads with linked student charges are protected. Use Edit to rename.`)) {
      try {
        await deleteFeeHead(id).unwrap();
        toast.success("Fee head deleted");
        refetchFeeHeads();
      } catch (err: any) {
        toast.error(err?.data?.message || "Cannot delete fee head with active charges. Use Edit to rename.");
      }
    }
  };

  const currentSession = sessions?.find((s) => s.isCurrent) || sessions?.[0];

  // Filtered Students for Offline Payment
  const filteredStudentsForPayment = useMemo(() => {
    if (!studentsList) return [];
    return studentsList.filter((s) => {
      const matchClass = !offlineClassId || s.classSectionId === Number(offlineClassId);
      const query = offlineSearchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.admissionNo.toLowerCase().includes(query) ||
        (s.rollNo && s.rollNo.toLowerCase().includes(query));
      return matchClass && matchQuery;
    });
  }, [studentsList, offlineClassId, offlineSearchQuery]);

  // Selected Student Object for Verification Card
  const selectedStudentObj = useMemo(() => {
    if (!offlineStudentId || !studentsList) return null;
    return studentsList.find((s) => s.id === Number(offlineStudentId));
  }, [offlineStudentId, studentsList]);

  // Outstanding Due Amount for Selected Student
  const selectedStudentDueAmount = useMemo(() => {
    if (!selectedStudentObj) return 0;
    const def = defaulters?.find((d: any) => d.studentId === selectedStudentObj.id || d.admissionNo === selectedStudentObj.admissionNo);
    if (def) return Number(def.totalDue || 0);

    const invs = invoices?.filter((i: any) => (i.studentId === selectedStudentObj.id || i.student?.id === selectedStudentObj.id) && i.status !== "PAID");
    if (invs && invs.length > 0) {
      return invs.reduce((acc: number, item: any) => acc + Number(item.totalAmount || 0), 0);
    }
    return 0;
  }, [selectedStudentObj, defaulters, invoices]);

  // Filtered Defaulters List (Only students with outstanding due > 0)
  const filteredDefaulters = useMemo(() => {
    if (!defaulters) return [];
    const selectedClassObj = classSections?.find((cs) => cs.id === Number(defaulterClassId));
    const targetClassName = selectedClassObj ? `${selectedClassObj.className} - ${selectedClassObj.section}` : "";

    return defaulters.filter((d: any) => {
      const hasOverdueBalance = Number(d.totalDue || 0) > 0;
      const matchClass =
        !defaulterClassId ||
        d.classSectionId === Number(defaulterClassId) ||
        (targetClassName && d.classSection === targetClassName);
      const query = defaulterSearchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        d.studentName.toLowerCase().includes(query) ||
        d.admissionNo.toLowerCase().includes(query);
      return hasOverdueBalance && matchClass && matchQuery;
    });
  }, [defaulters, defaulterClassId, defaulterSearchQuery, classSections]);

  // Filtered Fee Bills / Invoices for Roster Table
  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    const selectedClassObj = classSections?.find((cs) => cs.id === Number(rosterClassId));
    const targetClassName = selectedClassObj ? `${selectedClassObj.className} - ${selectedClassObj.section}` : "";

    return invoices.filter((inv: any) => {
      const matchClass =
        !rosterClassId ||
        inv.student?.classSectionId === Number(rosterClassId) ||
        inv.student?.classSection?.id === Number(rosterClassId) ||
        (targetClassName && (inv.student?.classSection === targetClassName || inv.classSection === targetClassName));

      const matchStatus = !rosterStatus || inv.status === rosterStatus;

      const query = rosterSearchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(query)) ||
        (inv.student?.name && inv.student.name.toLowerCase().includes(query)) ||
        (inv.student?.admissionNo && inv.student.admissionNo.toLowerCase().includes(query));

      return matchClass && matchStatus && matchQuery;
    });
  }, [invoices, rosterClassId, rosterStatus, rosterSearchQuery, classSections]);

  // Select student and auto pre-fill payment amount
  const handleSelectStudentForPayment = (stId: number) => {
    setOfflineStudentId(stId);
    const st = studentsList?.find((s) => s.id === stId);
    if (st) {
      const def = defaulters?.find((d: any) => d.studentId === st.id || d.admissionNo === st.admissionNo);
      const invs = invoices?.filter((i: any) => (i.studentId === st.id || i.student?.id === st.id) && i.status !== "PAID");
      let calculatedDue = 0;
      if (def) {
        calculatedDue = Number(def.totalDue || 0);
      } else if (invs && invs.length > 0) {
        calculatedDue = invs.reduce((acc: number, item: any) => acc + Number(item.totalAmount || 0), 0);
      }
      setOfflineAmount(calculatedDue > 0 ? calculatedDue.toString() : "");
    }
  };

  // Handlers
  const handleToggleStructureSelect = (id: number) => {
    setSelectedStructureIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllStructures = (selectAll: boolean) => {
    if (selectAll && feeStructures) {
      setSelectedStructureIds(feeStructures.map((s) => s.id));
    } else {
      setSelectedStructureIds([]);
    }
  };

  const handleOpenBulkPreview = async () => {
    if (selectedStructureIds.length === 0) {
      toast.error("Please select at least one class fee structure.");
      return;
    }
    if (!bulkHeadId || !bulkNewAmount) {
      toast.error("Please select a target fee head and enter the hike value.");
      return;
    }

    const val = parseFloat(bulkNewAmount);
    const targetHead = feeHeads?.find((h) => h.id === Number(bulkHeadId));

    const impactSummary = selectedStructureIds.map((id) => {
      const st = feeStructures?.find((s) => s.id === id);
      const className = st?.classSection
        ? formatClassLabel(st.classSection)
        : st?.name || `Structure #${id}`;

      const item = st?.items?.find((i: any) => i.feeHeadId === Number(bulkHeadId) || i.feeHead?.id === Number(bulkHeadId));
      const oldAmount = item ? Number(item.amount) : 3000;

      let newAmount = oldAmount;
      if (bulkHikeMode === "FLAT") {
        newAmount = oldAmount + val;
      } else if (bulkHikeMode === "PERCENT") {
        newAmount = Math.round(oldAmount * (1 + val / 100));
      } else {
        newAmount = val;
      }

      return {
        structureId: id,
        className,
        oldAmount,
        newAmount,
      };
    });

    setBulkPreviewData({
      targetFeeHead: targetHead,
      hikeMode: bulkHikeMode,
      hikeValue: val,
      effectiveFrom: bulkEffectiveFrom,
      impactSummary,
    });
  };

  const handleApplyBulkUpdate = async () => {
    if (!bulkPreviewData) return;
    try {
      for (const item of bulkPreviewData.impactSummary) {
        await bulkUpdateFeeStructures({
          feeStructureIds: [item.structureId],
          feeHeadId: Number(bulkHeadId),
          newAmount: item.newAmount,
          effectiveFrom: bulkEffectiveFrom,
        }).unwrap();
      }

      toast.success("Fee hike applied successfully for selected classes!");
      setBulkPreviewData(null);
      setSelectedStructureIds([]);
      refetchStructures();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to apply fee update.");
    }
  };

  const handleStartEditHead = (head: IFeeHead) => {
    setEditingHeadId(head.id);
    setHeadName(head.name);
    setHeadCode(head.code);
    setHeadDescription(head.description || "");
  };

  const handleCancelEditHead = () => {
    setEditingHeadId(null);
    setHeadName("");
    setHeadCode("");
    setHeadDescription("");
  };

  const handleCreateOrUpdateHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headName || !headCode) return;
    try {
      if (editingHeadId) {
        await updateFeeHead({
          id: editingHeadId,
          body: { name: headName, code: headCode.toUpperCase(), description: headDescription },
        }).unwrap();
        toast.success("Fee Head updated! Past transaction history preserved.");
      } else {
        await createFeeHead({ name: headName, code: headCode.toUpperCase(), description: headDescription }).unwrap();
        toast.success("Fee Head created!");
      }
      handleCancelEditHead();
      refetchFeeHeads();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save fee head");
    }
  };

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession || !structureAmount) return;

    const tuitionHead = feeHeads?.find((h) => h.code === "TUITION" || h.name.toLowerCase().includes("tuition")) || feeHeads?.[0];
    const targetHeadId = tuitionHead ? tuitionHead.id : 1;

    try {
      await createFeeStructure({
        sessionId: currentSession.id,
        classSectionId: selectedClassId ? Number(selectedClassId) : undefined,
        name: structureName || "Standard Fee Plan",
        items: [
          {
            feeHeadId: targetHeadId,
            amount: parseFloat(structureAmount),
            frequency: "MONTHLY",
            applicableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            dueDateDay: 10,
            allowPartialPayment: true,
          },
        ],
      }).unwrap();

      toast.success("Class Fee Structure created!");
      refetchStructures();
      setStructureName("");
      setStructureAmount("");
      setShowCreateStructureModal(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to create fee structure");
    }
  };

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const studentIdNum = Number(offlineStudentId);
    if (!studentIdNum || isNaN(studentIdNum) || !offlineAmount) {
      toast.error("Please select a student and enter an amount");
      return;
    }

    try {
      const res = await createManualPayment({
        studentId: studentIdNum,
        amount: parseFloat(offlineAmount),
        mode: offlineMode,
        transactionRef: offlineRef || undefined,
      }).unwrap();

      toast.success("Offline payment recorded!");

      const st = selectedStudentObj;
      const receiptNo = res?.receiptNumber || `RCP-${Date.now().toString().slice(-6)}`;
      const paidAmt = parseFloat(offlineAmount);
      const paidDate = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      setGeneratedReceipt({
        receiptNo,
        studentName: st?.name || "Student",
        admissionNo: st?.admissionNo || "N/A",
        rollNo: st?.rollNo || "N/A",
        fatherName: st?.fatherName || "Parent",
        fatherContact: st?.fatherContact || st?.contactNumber || "",
        className: st?.classSection ? formatClassLabel(st.classSection) : "N/A",
        amountPaid: paidAmt,
        mode: offlineMode,
        refNo: offlineRef || "N/A",
        paidAt: paidDate,
      });

      setOfflineStudentId("");
      setOfflineAmount("");
      setOfflineRef("");
      refetchDefaulters();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to record payment");
    }
  };

  const handleShareWhatsApp = (receipt: PaymentReceiptData) => {
    const phone = receipt.fatherContact.replace(/\D/g, "");
    const msg = `*OFFICIAL FEE RECEIPT SLIP — DREAM PUBLIC SCHOOL*\n\n` +
      `Receipt No: ${receipt.receiptNo}\n` +
      `Date: ${receipt.paidAt}\n` +
      `Student Name: ${receipt.studentName} (Roll No: ${receipt.rollNo})\n` +
      `Father's Name: ${receipt.fatherName}\n` +
      `Class: ${receipt.className}\n` +
      `Amount Paid: ₹${receipt.amountPaid.toLocaleString("en-IN")}\n` +
      `Payment Mode: ${receipt.mode}\n` +
      `Reference No: ${receipt.refNo}\n\n` +
      `Thank you for the payment!`;

    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <PageHeader
        title="Fee Management"
        subtitle="Manage class fee plans, student fee bills, payment desk, and defaulters"
        actions={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button variant="outline" onClick={() => setShowCreateHeadModal(true)}>
              + Fee Head
            </Button>
            <Button variant="primary" onClick={() => setShowCreateStructureModal(true)}>
              + New Structure
            </Button>
          </div>
        }
      />

      {/* 4 Clean Dedicated Tabs */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "structures" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("structures")}
        >
          Fee Structures ({feeStructures?.length || 0})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "invoices" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("invoices")}
        >
          Fee Bills & Invoices ({invoices?.length || 0})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "record_payment" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("record_payment")}
        >
          Record Payment
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "defaulters" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("defaulters")}
        >
          Fee Defaulters ({filteredDefaulters.length})
        </button>
      </div>

      {/* TAB 1: FEE STRUCTURES */}
      {activeTab === "structures" && (
        <div className={styles.page}>
          <Card
            title="Class Fee Structures Matrix"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSelectAllStructures(selectedStructureIds.length !== (feeStructures?.length || 0))}
              >
                {selectedStructureIds.length === (feeStructures?.length || 0) ? "Deselect All" : "Select All Classes"}
              </Button>
            }
          >
            <Table
              keyField="id"
              columns={[
                {
                  key: "select",
                  label: "☑",
                  width: "40px",
                  render: (r: any) => (
                    <input
                      type="checkbox"
                      checked={selectedStructureIds.includes(r.id)}
                      onChange={() => handleToggleStructureSelect(r.id)}
                    />
                  ),
                },
                {
                  key: "class",
                  label: "Class",
                  render: (r: any) =>
                    r.classSection ? formatClassLabel(r.classSection) : r.name,
                },
                {
                  key: "tuition",
                  label: "Tuition",
                  render: (r: any) => {
                    const item = r.items?.find((i: any) => i.feeHead?.code === "TUITION" || i.feeHead?.name?.toLowerCase().includes("tuition"));
                    return item ? `₹${Number(item.amount).toLocaleString("en-IN")}` : "—";
                  },
                },
                {
                  key: "annual",
                  label: "Annual",
                  render: (r: any) => {
                    const item = r.items?.find((i: any) => i.frequency === "ANNUAL" || i.feeHead?.name?.toLowerCase().includes("annual"));
                    return item ? `₹${Number(item.amount).toLocaleString("en-IN")}` : "—";
                  },
                },
                {
                  key: "exam",
                  label: "Exam",
                  render: (r: any) => {
                    const item = r.items?.find((i: any) => i.feeHead?.code === "EXAM" || i.feeHead?.name?.toLowerCase().includes("exam"));
                    return item ? `₹${Number(item.amount).toLocaleString("en-IN")}` : "—";
                  },
                },
                {
                  key: "transport",
                  label: "Transport",
                  render: () => "Variable by village",
                },
                {
                  key: "actions",
                  label: "Actions",
                  width: "210px",
                  render: (r: any) => (
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <Button size="sm" variant="primary" onClick={() => navigate(`/admin/fees/structures/${r.id}`)}>
                        View Fee Plan →
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeleteStructure(r.id, r.name)}>
                        Delete
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={feeStructures || []}
            />
          </Card>

          {/* BULK FEE HIKE TOOL */}
          {(user?.role === "SUPER_ADMIN" || user?.email?.includes("superadmin")) && (
            <Card
              title={
                selectedStructureIds.length > 0
                  ? `Increase Fees for Selected Classes (${selectedStructureIds.length} Classes Selected)`
                  : "Increase Fees for Selected Classes"
              }
            >
              {selectedStructureIds.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)", padding: "0.5rem 0" }}>
                  <em>Select one or more classes in the table above using the checkboxes to apply a fee hike.</em>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto", gap: "1rem", alignItems: "flex-end" }}>
                  <Select
                    label="Target Fee Head *"
                    value={bulkHeadId}
                    onChange={(e) => setBulkHeadId(Number(e.target.value))}
                    options={feeHeads?.map((h) => ({ label: `${h.name} (${h.code})`, value: h.id })) || []}
                    placeholder="Select Fee Head..."
                  />
                  <Select
                    label="Hike Mode"
                    value={bulkHikeMode}
                    onChange={(e) => setBulkHikeMode(e.target.value as any)}
                    options={[
                      { label: "Flat Increase (+₹)", value: "FLAT" },
                      { label: "Percentage Increase (+%)", value: "PERCENT" },
                      { label: "Set Fixed Amount (₹)", value: "FIXED" },
                    ]}
                  />
                  <Input
                    label={
                      bulkHikeMode === "FLAT"
                        ? "Increase Amount (+₹) *"
                        : bulkHikeMode === "PERCENT"
                        ? "Hike Rate (+%) *"
                        : "Fixed Amount (₹) *"
                    }
                    type="number"
                    value={bulkNewAmount}
                    onChange={(e) => setBulkNewAmount(e.target.value)}
                    placeholder={bulkHikeMode === "PERCENT" ? "e.g. 10" : "e.g. 500"}
                  />
                  <Input
                    label="Starts From Date *"
                    type="date"
                    value={bulkEffectiveFrom}
                    onChange={(e) => setBulkEffectiveFrom(e.target.value)}
                  />
                  <Button variant="primary" onClick={handleOpenBulkPreview}>
                    Preview Fee Hike
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: FEE BILLS & INVOICES */}
      {activeTab === "invoices" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* MONTHLY FEE COLLECTION OVERVIEW DASHBOARD */}
          <Card
            title={`Fee Collection Overview — ${collectionOverview?.collectionPeriodName || "Fee Collection"}`}
            action={
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <Select
                  value={activeSession?.id || ""}
                  onChange={(e) => {
                    const newSessId = Number(e.target.value);
                    setSelectedSessionId(newSessId);
                    const newSess = sessions?.find((s) => s.id === newSessId);
                    if (newSess?.startDate) {
                      const yr = new Date(newSess.startDate).getFullYear();
                      setSelectedCollectionYear(yr);
                    }
                  }}
                  options={(sessions || []).map((s) => ({
                    label: `Session ${s.name}${s.isCurrent ? " (Current)" : ""}`,
                    value: s.id,
                  }))}
                  style={{ minWidth: "150px" }}
                />
                <Select
                  value={`${selectedCollectionMonth}-${selectedCollectionYear}`}
                  onChange={(e) => {
                    const [m, y] = e.target.value.split("-").map(Number);
                    setSelectedCollectionMonth(m);
                    setSelectedCollectionYear(y);
                  }}
                  options={sessionMonthOptions.map((opt) => ({
                    label: opt.label,
                    value: `${opt.month}-${opt.year}`,
                  }))}
                  style={{ minWidth: "150px" }}
                />
                <Button variant="primary" size="sm" onClick={handleOpenBulkBillPreview} isLoading={isPreviewingBills}>
                  + Generate Missing Fee Bills
                </Button>
              </div>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Eligible Students</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.2rem" }}>{collectionOverview?.eligibleStudents || 0}</div>
              </div>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Bills Issued</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--erp-primary-600)", marginTop: "0.2rem" }}>{collectionOverview?.feeBillsGenerated || 0}</div>
              </div>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Paid</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--erp-success)", marginTop: "0.2rem" }}>{collectionOverview?.paidCount || 0}</div>
              </div>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Partially Paid</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#d97706", marginTop: "0.2rem" }}>{collectionOverview?.partiallyPaidCount || 0}</div>
              </div>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Pending</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--erp-info-700, #2563eb)", marginTop: "0.2rem" }}>{collectionOverview?.pendingCount || 0}</div>
              </div>
              <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", padding: "0.75rem", borderRadius: "var(--erp-radius-sm)", textAlign: "center" }}>
                <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)", textTransform: "uppercase" }}>Overdue</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--erp-danger)", marginTop: "0.2rem" }}>{collectionOverview?.overdueCount || 0}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", borderTop: "1px solid var(--erp-border)", paddingTop: "0.75rem", fontSize: "0.88rem" }}>
              <div>Expected Collection: <strong>₹{Number(collectionOverview?.expectedCollectionAmount || 0).toLocaleString("en-IN")}</strong></div>
              <div>Collected Amount: <strong style={{ color: "var(--erp-success)" }}>₹{Number(collectionOverview?.collectedAmount || 0).toLocaleString("en-IN")}</strong></div>
              <div>Remaining Balance: <strong style={{ color: "var(--erp-danger)" }}>₹{Number(collectionOverview?.remainingAmount || 0).toLocaleString("en-IN")}</strong></div>
            </div>
          </Card>

          {/* FEE BILLS ROSTER TABLE */}
          <Card
            title="Student Fee Bills Roster"
            action={
              (rosterClassId || rosterStatus || rosterSearchQuery) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRosterClassId("");
                    setRosterStatus("");
                    setRosterSearchQuery("");
                  }}
                >
                  Clear Filters
                </Button>
              ) : undefined
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <Select
                label="Filter Class Section"
                value={rosterClassId}
                onChange={(e) => setRosterClassId(Number(e.target.value) || "")}
                options={classSections?.map((cs) => ({ label: formatClassLabel(cs), value: cs.id })) || []}
                placeholder="All Classes"
              />
              <Select
                label="Filter Status"
                value={rosterStatus}
                onChange={(e) => setRosterStatus(e.target.value)}
                options={[
                  { label: "All Statuses", value: "" },
                  { label: "Pending / Unpaid", value: "PENDING" },
                  { label: "Partially Paid", value: "PARTIALLY_PAID" },
                  { label: "Paid", value: "PAID" },
                  { label: "Overdue", value: "OVERDUE" },
                ]}
                placeholder="All Statuses"
              />
              <Input
                label="Search Fee Bill / Student"
                type="text"
                value={rosterSearchQuery}
                onChange={(e) => setRosterSearchQuery(e.target.value)}
                placeholder="Search by Fee Bill No, Student Name, Admission No..."
              />
            </div>

            <Table
              keyField="id"
              columns={[
                { key: "invoiceNumber", label: "Fee Bill No" },
                {
                  key: "student",
                  label: "Student",
                  render: (r: any) => `${r.student?.name} (${r.student?.classSection ? formatClassLabel(r.student.classSection) : ""})`,
                },
                {
                  key: "totalAmount",
                  label: "Total Amount",
                  render: (r: any) => `₹${Number(r.totalAmount).toLocaleString("en-IN")}`,
                },
                {
                  key: "paidAmount",
                  label: "Paid",
                  render: (r: any) => `₹${Number(r.paidAmount || 0).toLocaleString("en-IN")}`,
                },
                {
                  key: "remaining",
                  label: "Remaining",
                  render: (r: any) => {
                    const rem = Number(r.totalAmount) - Number(r.paidAmount || 0);
                    return <span style={{ fontWeight: 600, color: rem > 0 ? "var(--erp-danger)" : "var(--erp-success)" }}>₹{rem.toLocaleString("en-IN")}</span>;
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
                  key: "dueDate",
                  label: "Last Date to Pay",
                  render: (r: any) => new Date(r.dueDate).toLocaleDateString("en-IN"),
                },
              ]}
              data={filteredInvoices}
            />
          </Card>
        </div>
      )}

      {/* TAB 3: RECORD PAYMENT (SPACIOUS FULL-WIDTH 2-COLUMN POS DESK) */}
      {activeTab === "record_payment" && (
        <form onSubmit={handleManualPayment}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "1.25rem", alignItems: "start" }}>
            {/* LEFT COLUMN: 1. Student Selection & Identity Verification */}
            <Card
              title="1. Student Lookup & Identity Verification"
              action={
                (offlineClassId || offlineSearchQuery) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setOfflineClassId("");
                      setOfflineSearchQuery("");
                      setOfflineStudentId("");
                    }}
                  >
                    Clear Filters
                  </Button>
                ) : undefined
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <Select
                    label="Filter Class Section"
                    value={offlineClassId}
                    onChange={(e) => {
                      setOfflineClassId(Number(e.target.value) || "");
                      setOfflineStudentId("");
                    }}
                    options={classSections?.map((cs) => ({ label: formatClassLabel(cs), value: cs.id })) || []}
                    placeholder="All Classes"
                  />
                  <Input
                    label="Search Student"
                    type="text"
                    value={offlineSearchQuery}
                    onChange={(e) => setOfflineSearchQuery(e.target.value)}
                    placeholder="Name / Adm No / Roll No..."
                  />
                </div>

                <Select
                  label="Select Student *"
                  required
                  value={offlineStudentId}
                  onChange={(e) => handleSelectStudentForPayment(Number(e.target.value))}
                  options={
                    filteredStudentsForPayment.map((s) => ({
                      label: `${s.name} (Adm: ${s.admissionNo} ${s.rollNo ? `| Roll: ${s.rollNo}` : ""} - ${formatClassLabel(s.classSection)})`,
                      value: s.id,
                    }))
                  }
                  placeholder="Select student to verify details..."
                />

                {/* STUDENT IDENTITY VERIFICATION CARD */}
                {selectedStudentObj ? (
                  <div style={{ background: "var(--erp-surface)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "1rem", fontSize: "0.88rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--erp-text)" }}>
                        {selectedStudentObj.name}
                      </div>
                      <Badge tone={selectedStudentDueAmount > 0 ? "danger" : "success"}>
                        Total Due: ₹{selectedStudentDueAmount.toLocaleString("en-IN")}
                      </Badge>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", color: "var(--erp-text-muted)", fontSize: "0.85rem" }}>
                      <div>Admission No: <strong style={{ color: "var(--erp-text)" }}>{selectedStudentObj.admissionNo}</strong></div>
                      <div>Roll No: <strong style={{ color: "var(--erp-text)" }}>{selectedStudentObj.rollNo || "N/A"}</strong></div>
                      <div>Class: <strong style={{ color: "var(--erp-text)" }}>{formatClassLabel(selectedStudentObj.classSection)}</strong></div>
                      <div>Father's Name: <strong style={{ color: "var(--erp-text)" }}>{selectedStudentObj.fatherName || "N/A"}</strong></div>
                      <div>Phone: <strong style={{ color: "var(--erp-text)" }}>{selectedStudentObj.fatherContact || selectedStudentObj.contactNumber || "N/A"}</strong></div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--erp-border)", paddingTop: "0.5rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                      <Button size="sm" variant="outline" type="button" onClick={() => setShowWaiveFineModal(true)}>
                        Waive Late Fine
                      </Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => setShowFeeBreakdownModal(true)}>
                        Explain Fee Breakdown
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)", padding: "1rem", background: "var(--erp-surface)", borderRadius: "var(--erp-radius-sm)", border: "1px dashed var(--erp-border)", textAlign: "center" }}>
                    Select a student above to verify their Roll No, Father's Name & Outstanding Due balance.
                  </div>
                )}
              </div>
            </Card>

            {/* RIGHT COLUMN: 2. Payment Entry & Receipt Issuance Desk */}
            <Card title="2. Payment Collection Desk">
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <Input
                  label="Payment Amount (₹) *"
                  type="number"
                  required
                  value={offlineAmount}
                  onChange={(e) => setOfflineAmount(e.target.value)}
                  placeholder="e.g. 3700"
                />

                <Select
                  label="Payment Mode *"
                  value={offlineMode}
                  onChange={(e) => setOfflineMode(e.target.value as any)}
                  options={[
                    { label: "Cash Payment", value: "CASH" },
                    { label: "Bank Transfer", value: "BANK_TRANSFER" },
                    { label: "UPI / QR Code", value: "UPI_MANUAL" },
                  ]}
                />

                <Input
                  label="Reference No / Note"
                  type="text"
                  value={offlineRef}
                  onChange={(e) => setOfflineRef(e.target.value)}
                  placeholder="e.g. Cash Receipt # / UTR Transaction ID"
                />

                <Button variant="primary" type="submit" style={{ marginTop: "0.5rem", width: "100%", padding: "0.75rem" }}>
                  Record Fee Payment & Issue Receipt Slip
                </Button>
              </div>
            </Card>
          </div>
        </form>
      )}

      {/* TAB 4: FEE DEFAULTERS ROSTER (SPACIOUS DEDICATED PAGE) */}
      {activeTab === "defaulters" && (
        <Card
          title="Fee Defaulters Roster & Overdue Tracker"
          action={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(defaulterClassId || defaulterSearchQuery) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDefaulterClassId("");
                    setDefaulterSearchQuery("");
                  }}
                >
                  Clear Filters
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                Print / Export PDF
              </Button>
            </div>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem", marginBottom: "1.25rem" }}>
            <Select
              label="Filter Class Section"
              value={defaulterClassId}
              onChange={(e) => setDefaulterClassId(Number(e.target.value) || "")}
              options={classSections?.map((cs) => ({ label: formatClassLabel(cs), value: cs.id })) || []}
              placeholder="All Classes"
            />
            <Input
              label="Search Defaulter Student"
              type="text"
              value={defaulterSearchQuery}
              onChange={(e) => setDefaulterSearchQuery(e.target.value)}
              placeholder="Search Student Name or Admission Number..."
            />
          </div>

          <Table
            keyField="studentId"
            columns={[
              { key: "studentName", label: "Student Name" },
              { key: "admissionNo", label: "Admission No" },
              { key: "classSection", label: "Class" },
              {
                key: "totalDue",
                label: "Total Due Amount",
                render: (r: any) => (
                  <span style={{ fontWeight: 700, color: "var(--erp-danger)" }}>
                    ₹{Number(r.totalDue || 0).toLocaleString("en-IN")}
                  </span>
                ),
              },
              {
                key: "actions",
                label: "Action",
                width: "140px",
                render: (r: any) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOfflineStudentId(r.studentId);
                      setOfflineAmount(r.totalDue?.toString() || "");
                      setActiveTab("record_payment");
                    }}
                  >
                    Collect Fee →
                  </Button>
                ),
              },
            ]}
            data={filteredDefaulters}
          />
        </Card>
      )}

      {/* EXPLAIN FEE DETAILS TO PARENT BREAKDOWN MODAL */}
      {showFeeBreakdownModal && selectedStudentObj && (() => {
        const totalDue = selectedStudentDueAmount;
        const currentMonthName = new Date(selectedCollectionYear, selectedCollectionMonth - 1).toLocaleString("en-US", { month: "long" });

        return (
          <Modal title={`Fee Breakdown — ${selectedStudentObj.name}`} onClose={() => setShowFeeBreakdownModal(false)}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ background: "var(--erp-surface)", padding: "0.75rem 1rem", borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)", fontSize: "0.85rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{selectedStudentObj.name}</div>
                <div style={{ color: "var(--erp-text-muted)", marginTop: "0.2rem" }}>
                  Admission No: {selectedStudentObj.admissionNo} | Roll No: {selectedStudentObj.rollNo || "N/A"} | Class: {formatClassLabel(selectedStudentObj.classSection)}
                </div>
              </div>

              {totalDue === 0 ? (
                <div style={{ background: "var(--erp-surface)", border: "1px dashed var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "1.5rem", textAlign: "center", color: "var(--erp-text-muted)" }}>
                  <div style={{ fontWeight: 600, color: "var(--erp-text)", marginBottom: "0.25rem" }}>No Pending Dues</div>
                  There are no unpaid fee charges or outstanding invoices generated for this student.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--erp-text)" }}>
                    Outstanding Fee Breakdown ({currentMonthName} {selectedCollectionYear}):
                  </div>

                  <div className={styles.itemList}>
                    <div className={styles.itemRow}>
                      <span>{currentMonthName} {selectedCollectionYear} Net Fee Charges</span>
                      <span style={{ fontWeight: 500 }}>₹{totalDue.toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  <div className={styles.previewTotal}>
                    <span>Net Total Amount Outstanding</span>
                    <span>₹{totalDue.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}

              <div style={{ fontSize: "0.8rem", color: "var(--erp-text-muted)", lineHeight: 1.4 }}>
                Use this standard breakdown to explain exact fee calculation line items to parents at the counter.
              </div>

              <div className={styles.formActions}>
                <Button variant="primary" onClick={() => setShowFeeBreakdownModal(false)}>
                  Close Breakdown
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* WAIVE LATE FINE MODAL */}
      {showWaiveFineModal && selectedStudentObj && (
        <Modal title={`Waive Late Fine — ${selectedStudentObj.name}`} onClose={() => setShowWaiveFineModal(false)}>
          <form onSubmit={handleConfirmWaiveFine} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ background: "var(--erp-surface)", padding: "0.75rem 1rem", borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)", fontSize: "0.85rem" }}>
              <div>Student: <strong style={{ color: "var(--erp-text)" }}>{selectedStudentObj.name}</strong></div>
              <div style={{ color: "var(--erp-text-muted)", marginTop: "0.25rem" }}>
                Admission No: {selectedStudentObj.admissionNo} | Roll No: {selectedStudentObj.rollNo || "N/A"}
              </div>
            </div>

            <Input
              label="Waiver Amount (₹)"
              type="number"
              placeholder="Leave blank for Full Fine Waiver"
              value={waiveFineAmount}
              onChange={(e) => setWaiveFineAmount(e.target.value)}
            />

            <Input
              label="Reason for Waiver *"
              type="text"
              required
              placeholder="e.g. Exemption approved by Principal due to medical reasons"
              value={waiveFineReason}
              onChange={(e) => setWaiveFineReason(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setShowWaiveFineModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isWaivingFine}>
                Confirm Late Fine Waiver
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* PAYMENT RECEIPT SLIP MODAL */}
      {generatedReceipt && (
        <Modal title="Official Fee Payment Receipt" onClose={() => setGeneratedReceipt(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <FeeReceipt data={generatedReceipt} />

            <div className={styles.formActions}>
              <Button variant="outline" onClick={() => window.print()}>
                Print Receipt Slip
              </Button>
              <Button variant="primary" onClick={() => handleShareWhatsApp(generatedReceipt)}>
                Share on WhatsApp
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MANAGE, EDIT & CREATE FEE HEAD MODAL */}
      {showCreateHeadModal && (
        <Modal title="Manage Fee Heads" onClose={() => { setShowCreateHeadModal(false); handleCancelEditHead(); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Existing Fee Heads Roster */}
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--erp-text)" }}>
              Existing Fee Heads ({feeHeads?.length || 0}):
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "200px", overflowY: "auto", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "0.75rem" }}>
              {feeHeads && feeHeads.length > 0 ? (
                feeHeads.map((head) => (
                  <div key={head.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: editingHeadId === head.id ? "var(--erp-primary-50, #f0f7ff)" : "var(--erp-surface)", borderRadius: "var(--erp-radius-sm)", border: editingHeadId === head.id ? "1px solid var(--erp-primary-600)" : "1px solid var(--erp-border)", fontSize: "0.85rem" }}>
                    <div>
                      <strong>{head.name}</strong> <span style={{ color: "var(--erp-text-muted)", fontSize: "0.78rem" }}>({head.code})</span>
                      {head.description && <div style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)" }}>{head.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <Button size="sm" variant="outline" type="button" onClick={() => handleStartEditHead(head)}>
                        Edit Name
                      </Button>
                      <Button size="sm" variant="outline" type="button" onClick={() => handleDeleteHead(head.id, head.name)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.82rem", color: "var(--erp-text-muted)" }}>No fee heads created yet.</div>
              )}
            </div>

            {/* Create or Edit Fee Head Form */}
            <form onSubmit={handleCreateOrUpdateHead} style={{ borderTop: "1px solid var(--erp-border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--erp-text)" }}>
                {editingHeadId ? "Edit Fee Head (Preserves Past Records):" : "+ Add New Fee Head:"}
              </div>
              <Input label="Fee Head Name *" type="text" required value={headName} onChange={(e) => setHeadName(e.target.value)} placeholder="e.g. Tuition Fee" />
              <Input label="Head Code *" type="text" required value={headCode} onChange={(e) => setHeadCode(e.target.value)} placeholder="e.g. TUITION" />
              <Input label="Description" type="text" value={headDescription} onChange={(e) => setHeadDescription(e.target.value)} placeholder="Optional description" />
              <div className={styles.formActions}>
                {editingHeadId && (
                  <Button variant="outline" type="button" onClick={handleCancelEditHead}>
                    Cancel Edit
                  </Button>
                )}
                <Button variant="primary" type="submit">
                  {editingHeadId ? "Save Changes" : "Create Head"}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* CREATE FEE STRUCTURE MODAL */}
      {showCreateStructureModal && (
        <Modal title="Create Class Fee Plan" onClose={() => setShowCreateStructureModal(false)}>
          <form onSubmit={handleCreateStructure} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="Structure Name *"
              type="text"
              required
              value={structureName}
              onChange={(e) => setStructureName(e.target.value)}
              placeholder="e.g. Class 8 Standard Fee Plan"
            />
            <Select
              label="Select Class Section"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              options={classSections?.map((cs) => ({ label: formatClassLabel(cs), value: cs.id })) || []}
              placeholder="Select Class Section..."
            />
            <Input
              label="Monthly Tuition Fee Amount (₹) *"
              type="number"
              required
              value={structureAmount}
              onChange={(e) => setStructureAmount(e.target.value)}
              placeholder="e.g. 3000"
            />
            <div className={styles.formActions}>
              <Button variant="outline" type="button" onClick={() => setShowCreateStructureModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Create Fee Plan
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* BULK HIKE PREVIEW MODAL */}
      {bulkPreviewData && (
        <Modal title="Confirm Fee Hike" onClose={() => setBulkPreviewData(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ fontSize: "0.88rem", color: "var(--erp-text)" }}>
              Applying <strong>{bulkPreviewData.targetFeeHead?.name}</strong> hike ({bulkPreviewData.hikeMode === "FLAT" ? `+₹${bulkPreviewData.hikeValue}` : bulkPreviewData.hikeMode === "PERCENT" ? `+${bulkPreviewData.hikeValue}%` : `Fixed ₹${bulkPreviewData.hikeValue}`}) starting from <strong>{bulkPreviewData.effectiveFrom}</strong> across {bulkPreviewData.impactSummary?.length} selected classes:
            </div>

            <div className={styles.itemList} style={{ maxHeight: "240px", overflowY: "auto" }}>
              {bulkPreviewData.impactSummary?.map((item: any) => (
                <div key={item.structureId} className={styles.itemRow}>
                  <span>{item.className}</span>
                  <span>
                    ₹{item.oldAmount?.toLocaleString("en-IN")} → <strong>₹{item.newAmount?.toLocaleString("en-IN")}</strong>
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: "0.78rem", color: "var(--erp-text-muted)" }}>
              * Previously generated fee bills and receipts remain completely unchanged.
            </div>

            <div className={styles.formActions}>
              <Button variant="outline" onClick={() => setBulkPreviewData(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleApplyBulkUpdate}>Apply Fee Hike</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK FEE BILL GENERATION PREVIEW MODAL */}
      {showBulkBillModal && bulkBillPreview && (
        <Modal title={`Fee Collection Preview — ${bulkBillPreview.collectionPeriodCode}`} onClose={() => { setShowBulkBillModal(false); setBulkBillPreview(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ background: "var(--erp-surface)", padding: "1rem", borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)", fontSize: "0.88rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>Collection Period: <strong>{bulkBillPreview.collectionPeriodCode}</strong></div>
              <div>Eligible Students: <strong>{bulkBillPreview.totalEligible}</strong></div>
              <div>Bills Already Issued: <strong style={{ color: "var(--erp-primary-600)" }}>{bulkBillPreview.alreadyBilled}</strong></div>
              <div>Bills to be Generated: <strong style={{ color: "var(--erp-success)" }}>{bulkBillPreview.newlyGenerated}</strong></div>
              <div>Expected Total Amount: <strong style={{ color: "var(--erp-text)" }}>₹{Number(bulkBillPreview.expectedAmount).toLocaleString("en-IN")}</strong></div>
              <div>Configured Last Date: <strong>10th of Month</strong></div>
            </div>

            <div style={{ fontSize: "0.82rem", color: "var(--erp-text-muted)", lineHeight: 1.4 }}>
              ℹ️ <strong>Idempotency & Data Safety Active:</strong> Re-running billing will skip the {bulkBillPreview.alreadyBilled} students who already have Fee Bills. Exactly {bulkBillPreview.newlyGenerated} missing Fee Bills will be generated with 0 duplicates.
            </div>

            <div className={styles.formActions}>
              <Button variant="outline" onClick={() => { setShowBulkBillModal(false); setBulkBillPreview(null); }}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmGenerateBills} isLoading={isGeneratingBills}>
                Generate {bulkBillPreview.newlyGenerated} Fee Bills
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminFeesPage;
