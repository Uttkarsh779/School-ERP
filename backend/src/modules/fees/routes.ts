import { Router } from "express";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";

const router = Router();

// Webhook endpoint (Public, HMAC verified inside handler)
router.post("/payments/razorpay/webhook", asyncHandler(controller.postRazorpayWebhook));

// Authenticated Routes
router.use(authenticateToken);

// Fee Heads
router.get("/fees/heads", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getFeeHeads));
router.post("/fees/heads", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postFeeHead));
router.put("/fees/heads/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.putFeeHead));
router.delete("/fees/heads/:id", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.deleteFeeHead));

// Fee Structures, Duplication, Calendar & Simulator
router.get(
  "/fee-structures",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(controller.getFeeStructures)
);
router.get(
  "/fee-structures/:id",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]),
  asyncHandler(controller.getFeeStructureById)
);
router.post("/fee-structures", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postFeeStructure));
router.put("/fee-structures/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.putFeeStructure));
router.delete("/fee-structures/:id", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.deleteFeeStructure));
router.post("/fee-structures/:id/duplicate", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postDuplicateFeeStructure));
router.post("/fees/structures/bulk-preview", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postBulkPreviewFeeStructures));
router.post("/fees/structures/bulk-update", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postBulkUpdateFeeStructures));
router.get("/fees/billing-calendar", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getBillingCalendar));
router.post("/fees/simulator", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postSimulateStudentFees));
router.post("/fees/preview-invoice", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postPreviewInvoice));

// Late Fee Rules
router.get("/fees/late-fee-rules", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getLateFeeRules));
router.post("/fees/late-fee-rules", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postLateFeeRule));

// Fee Charges & Due Summaries
router.post("/fees/charges/generate", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postGenerateCharges));
router.get(
  "/fees/student/:studentId/due-summary",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getStudentDueSummary)
);

// Invoices & Due Date Extension
router.post("/fees/invoices/generate", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postGenerateInvoice));
router.post("/fees/invoices/:id/extend-due-date", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postExtendDueDate));
router.get(
  "/fees/invoices",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getInvoices)
);
router.get(
  "/fees/invoices/:id",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getInvoiceById)
);

// Transport Villages & Student Assignments
router.get("/transport/villages", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]), asyncHandler(controller.getTransportVillages));
router.post("/transport/villages", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postTransportVillage));
router.put("/transport/villages/:id/fee", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.putTransportVillageFee));
router.patch("/transport/villages/:id/status", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.patchTransportVillageStatus));
router.delete("/transport/villages/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.deleteTransportVillage));
router.get("/transport/assignments", authorizeRoles(["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "PARENT"]), asyncHandler(controller.getTransportAssignments));
router.post("/transport/assignments", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postAssignTransport));
router.post("/transport/assignments/discontinue", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postDiscontinueTransport));
router.delete("/transport/assignments/:id", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.deleteTransportAssignment));

// Razorpay & Manual Payments
router.post(
  "/payments/razorpay/order",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.postCreateRazorpayOrder)
);
router.post(
  "/payments/razorpay/verify",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.postVerifyRazorpayPayment)
);
router.post("/payments/manual", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postManualPayment));
router.get(
  "/fees/student/:studentId/months-chart",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getStudentMonthsChart)
);
router.post(
  "/fees/payments/multi-month",
  authorizeRoles(["SUPER_ADMIN", "ADMIN"]),
  asyncHandler(controller.postMultiMonthPayment)
);

// Waivers
router.post("/fees/adjustments/waive-late-fee", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postWaiveLateFee));
router.post("/fees/adjustments/waive-small-balance", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postWaiveSmallBalance));
router.post("/fees/adjustments/waive-fee", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postWaiveFee));

// Receipts
router.get(
  "/payments/:id/receipt",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getReceipt)
);
router.get(
  "/payments/:id/receipt/pdf",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getReceiptPdfHtml)
);

// Student Ledger
router.get(
  "/fees/ledger/:studentId",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getStudentLedger)
);

// Adjustments & Refunds
router.post("/fees/adjustments", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.postAdjustment));
router.post("/refunds", authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]), asyncHandler(controller.postRefundRequest));
// Refund approval and charge-level discounts are money decisions: Super Admin only.
router.patch("/refunds/:id/approve", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.patchApproveRefund));
router.patch("/refunds/:id/process", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.patchProcessRefund));
router.get(
  "/refunds",
  authorizeRoles(["SUPER_ADMIN", "ADMIN", "STUDENT", "PARENT"]),
  asyncHandler(controller.getRefunds)
);

// Reports & Audit Logs
router.get("/fees/overview", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getFeeOverview));
router.get("/fees/reports/collection", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getCollectionReport));
router.get("/fee-payments/defaulters", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getDefaultersReport));
router.get("/fees/audit-logs", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.getAuditLogs));

// Collection Period Engine Routes
router.get("/fees/collection-period/overview", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.getCollectionPeriodOverview));
router.post("/fees/collection-period/preview", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postPreviewCollectionPeriod));
router.post("/fees/collection-period/generate", authorizeRoles(["SUPER_ADMIN", "ADMIN"]), asyncHandler(controller.postGenerateCollectionPeriodBills));

export default router;
