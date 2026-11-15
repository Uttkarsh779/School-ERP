import { Router } from "express";
import { getDayBook } from "./dayBookService";
import { authenticateToken, authorizeRoles } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import * as controller from "./controller";
import { httpError } from "../../utils/httpError";
import type { CustomRequest } from "../../middleware/auth";
import type { Response } from "express";
import { getBillingSettings, updateBillingSettings } from "./billingSettingsService";
import {
  cancelInvoice,
  cancelInvoicesForPeriod,
  cancelPayment,
  recalculateInvoice,
  recalculateInvoicesForPeriod,
  reverseAdjustment,
} from "./reversalService";

const router = Router();

// Webhook endpoint (Public, HMAC verified inside handler)
router.post("/payments/razorpay/webhook", asyncHandler(controller.postRazorpayWebhook));

// Authenticated Routes
router.use(authenticateToken);

// Fee Heads
router.get("/fees/heads", allow("fees.view"), asyncHandler(controller.getFeeHeads));
router.post("/fees/heads", allow("fees.configure"), asyncHandler(controller.postFeeHead));
router.put("/fees/heads/:id", allow("fees.configure"), asyncHandler(controller.putFeeHead));
router.delete("/fees/heads/:id", allow("fees.configure"), asyncHandler(controller.deleteFeeHead));

// Fee Structures, Duplication, Calendar & Simulator
router.get(
  "/fee-structures",
  allow("fees.view", "TEACHER", "STUDENT"),
  asyncHandler(controller.getFeeStructures)
);
router.get(
  "/fee-structures/:id",
  allow("fees.view", "TEACHER", "STUDENT"),
  asyncHandler(controller.getFeeStructureById)
);
router.post("/fee-structures", allow("fees.configure"), asyncHandler(controller.postFeeStructure));
router.put("/fee-structures/:id", allow("fees.configure"), asyncHandler(controller.putFeeStructure));
router.delete("/fee-structures/:id", allow("fees.configure"), asyncHandler(controller.deleteFeeStructure));
router.post("/fee-structures/:id/duplicate", allow("fees.configure"), asyncHandler(controller.postDuplicateFeeStructure));
router.post("/fees/structures/bulk-preview", allow("fees.configure"), asyncHandler(controller.postBulkPreviewFeeStructures));
router.post("/fees/structures/bulk-update", allow("fees.configure"), asyncHandler(controller.postBulkUpdateFeeStructures));
router.get("/fees/billing-calendar", allow("fees.view"), asyncHandler(controller.getBillingCalendar));
router.post("/fees/simulator", allow("fees.view"), asyncHandler(controller.postSimulateStudentFees));
router.post("/fees/preview-invoice", allow("fees.view"), asyncHandler(controller.postPreviewInvoice));

// Late Fee Rules
router.get("/fees/late-fee-rules", allow("fees.view"), asyncHandler(controller.getLateFeeRules));
router.post("/fees/late-fee-rules", allow("fees.configure"), asyncHandler(controller.postLateFeeRule));

// Fee Charges & Due Summaries
router.post("/fees/charges/generate", allow("fees.collect"), asyncHandler(controller.postGenerateCharges));
router.get(
  "/fees/student/:studentId/due-summary",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getStudentDueSummary)
);

// Invoices & Due Date Extension
router.post("/fees/invoices/generate", allow("fees.collect"), asyncHandler(controller.postGenerateInvoice));
router.post("/fees/invoices/:id/extend-due-date", allow("fees.collect"), asyncHandler(controller.postExtendDueDate));
router.get(
  "/fees/invoices",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getInvoices)
);
router.get(
  "/fees/invoices/:id",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getInvoiceById)
);

// Transport Villages & Student Assignments
router.get("/transport/villages", allow("transport.view", "TEACHER", "STUDENT"), asyncHandler(controller.getTransportVillages));
router.post("/transport/villages", allow("fees.configure"), asyncHandler(controller.postTransportVillage));
router.put("/transport/villages/:id/fee", allow("fees.configure"), asyncHandler(controller.putTransportVillageFee));
router.patch("/transport/villages/:id/status", allow("fees.configure"), asyncHandler(controller.patchTransportVillageStatus));
router.delete("/transport/villages/:id", allow("fees.configure"), asyncHandler(controller.deleteTransportVillage));
router.get("/transport/assignments", allow("transport.view"), asyncHandler(controller.getTransportAssignments)); // the office's roster of every student
router.post("/transport/assignments", allow("transport.edit"), asyncHandler(controller.postAssignTransport));
router.delete("/transport/assignments/:id", allow("transport.edit"), asyncHandler(controller.deleteTransportAssignment));

// Razorpay & Manual Payments
router.post(
  "/payments/razorpay/order",
  allow("fees.collect", "STUDENT"),
  asyncHandler(controller.postCreateRazorpayOrder)
);
router.post(
  "/payments/razorpay/verify",
  allow("fees.collect", "STUDENT"),
  asyncHandler(controller.postVerifyRazorpayPayment)
);
router.post("/payments/manual", allow("fees.collect"), asyncHandler(controller.postManualPayment));
router.get(
  "/fees/student/:studentId/months-chart",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getStudentMonthsChart)
);
router.post(
  "/fees/payments/multi-month",
  allow("fees.collect"),
  asyncHandler(controller.postMultiMonthPayment)
);

// Waivers: late fees and small leftover balances at the counter; any other waiver is the
// Super Admin's (see config/permissions.ts)
router.post("/fees/adjustments/waive-late-fee", allow("fees.collect"), asyncHandler(controller.postWaiveLateFee));
router.post("/fees/adjustments/waive-small-balance", allow("fees.collect"), asyncHandler(controller.postWaiveSmallBalance));
router.post("/fees/adjustments/waive-fee", allow("fees.waive"), asyncHandler(controller.postWaiveFee));

// Receipts
router.get(
  "/payments/:id/receipt",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getReceipt)
);
router.get(
  "/payments/:id/receipt/pdf",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getReceiptPdfHtml)
);

// Student Ledger
router.get(
  "/fees/ledger/:studentId",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getStudentLedger)
);

// Adjustments & Refunds
router.post("/fees/adjustments", allow("fees.waive"), asyncHandler(controller.postAdjustment));
router.post("/refunds", allow("fees.collect", "STUDENT"), asyncHandler(controller.postRefundRequest));
// Refund approval and charge-level discounts are money decisions: Super Admin only.
router.patch("/refunds/:id/approve", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.patchApproveRefund));
router.patch("/refunds/:id/process", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.patchProcessRefund));
router.get(
  "/refunds",
  allow("fees.view", "STUDENT"),
  asyncHandler(controller.getRefunds)
);

// Reports & Audit Logs
router.get("/fees/overview", allow("fees.view"), asyncHandler(controller.getFeeOverview));
router.get("/fees/reports/collection", allow("fees.view"), asyncHandler(controller.getCollectionReport));
// Day book: receipts, totals by mode and collector, cancellations and refunds for closing the counter.
router.get(
  "/fees/reports/day-book",
  allow("fees.view"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getDayBook(req.query.from, req.query.to) });
  })
);
router.get("/fee-payments/defaulters", allow("fees.view"), asyncHandler(controller.getDefaultersReport));
router.get("/fees/audit-logs", authorizeRoles(["SUPER_ADMIN"]), asyncHandler(controller.getAuditLogs));

// Collection Period Engine Routes
router.get("/fees/collection-period/overview", allow("fees.view"), asyncHandler(controller.getCollectionPeriodOverview));
router.post("/fees/collection-period/preview", allow("fees.collect"), asyncHandler(controller.postPreviewCollectionPeriod));
router.post("/fees/collection-period/generate", allow("fees.collect"), asyncHandler(controller.postGenerateCollectionPeriodBills));

// Monthly billing settings (automatic generation day, transport due day)
router.get(
  "/fees/billing-settings",
  allow("fees.view"),
  asyncHandler(async (_req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await getBillingSettings() });
  })
);
router.put(
  "/fees/billing-settings",
  allow("fees.configure"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Billing settings saved", data: await updateBillingSettings(req.user!, req.body ?? {}) });
  })
);

// Corrections (reversalService). Cancelling a receipt or a bill lowers what is owed, so
// only the Super Admin can do it; recalculating and reversing a waiver are open to the counter.
const idParam = (req: CustomRequest) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  return id;
};
router.post(
  "/payments/:id/cancel",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Receipt cancelled", data: await cancelPayment(req.user!, idParam(req), req.body?.reason) });
  })
);
router.post(
  "/fees/invoices/:id/cancel",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Bill cancelled", data: await cancelInvoice(req.user!, idParam(req), req.body?.reason) });
  })
);
router.post(
  "/fees/invoices/:id/recalculate",
  allow("fees.collect"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Bill recalculated", data: await recalculateInvoice(req.user!, idParam(req)) });
  })
);
router.post(
  "/fees/invoices/bulk-cancel",
  authorizeRoles(["SUPER_ADMIN"]),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await cancelInvoicesForPeriod(req.user!, req.body ?? {}) });
  })
);
router.post(
  "/fees/invoices/bulk-recalculate",
  allow("fees.collect"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, data: await recalculateInvoicesForPeriod(req.user!, req.body ?? {}) });
  })
);
router.post(
  "/fees/adjustments/:id/reverse",
  allow("fees.collect"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    res.json({ success: true, message: "Waiver reversed", data: await reverseAdjustment(req.user!, idParam(req), req.body?.reason) });
  })
);

export default router;
