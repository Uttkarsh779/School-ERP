import type { Response } from "express";
import type { CustomRequest } from "../../middleware/auth";
import * as feeStructureService from "./feeStructureService";
import * as feeChargeService from "./feeChargeService";
import * as invoiceService from "./invoiceService";
import * as razorpayService from "./razorpayService";
import * as ledgerService from "./ledgerService";
import * as adjustmentService from "./adjustmentService";
import * as receiptService from "./receiptService";
import * as paymentAllocationService from "./paymentAllocationService";
import * as collectionEngineService from "./collectionEngineService";
import * as transportVillageService from "../transport/transportVillageService";
import { recordFamilyPayment } from "./familyPaymentService";
import { prisma } from "../../config/prisma";
import { FeeMode, PaymentStatus } from "../../generated/prisma/enums";

// Helper to check ownership for STUDENT or PARENT
const verifyStudentAccess = async (req: CustomRequest, studentId: number): Promise<boolean> => {
  if (!req.user) return false;
  if (req.user.role === "SUPER_ADMIN" || req.user.role === "ADMIN") return true;

  if (req.user.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    return student?.id === studentId;
  }

  if (req.user.role === "PARENT") {
    const parent = await prisma.parentGuardian.findUnique({
      where: { userId: req.user.id },
      include: { children: true },
    });
    return parent?.children.some((c: any) => c.studentId === studentId) ?? false;
  }

  return false;
};

// Fee Heads
export const getFeeHeads = async (_req: CustomRequest, res: Response) => {
  const heads = await feeStructureService.listFeeHeads();
  res.json({ success: true, data: heads });
};

export const postFeeHead = async (req: CustomRequest, res: Response) => {
  const head = await feeStructureService.createFeeHead(req.body);
  await ledgerService.createAuditLog({
    action: "CREATE_FEE_HEAD",
    entityType: "FeeHead",
    entityId: head.id,
    userId: req.user!.id,
    newValues: head,
  });
  res.status(201).json({ success: true, data: head });
};

export const putFeeHead = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const head = await feeStructureService.updateFeeHead(id, req.body);
  await ledgerService.createAuditLog({
    action: "UPDATE_FEE_HEAD",
    entityType: "FeeHead",
    entityId: id,
    userId: req.user!.id,
    newValues: head,
  });
  res.json({ success: true, data: head });
};

export const deleteFeeHead = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const head = await feeStructureService.deleteFeeHead(id);
  await ledgerService.createAuditLog({
    action: "DELETE_FEE_HEAD",
    entityType: "FeeHead",
    entityId: id,
    userId: req.user!.id,
    newValues: head,
  });
  res.json({ success: true, data: head });
};

// Fee Structures
export const getFeeStructures = async (req: CustomRequest, res: Response) => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
  const structures = await feeStructureService.listFeeStructures(classSectionId, sessionId);
  res.json({ success: true, data: structures });
};

export const getFeeStructureById = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const structure = await feeStructureService.getFeeStructureById(id);
  if (!structure) {
    res.status(404).json({ success: false, message: "Fee structure not found" });
    return;
  }
  res.json({ success: true, data: structure });
};

export const postBulkPreviewFeeStructures = async (req: CustomRequest, res: Response) => {
  const result = await feeStructureService.previewBulkUpdateFeeStructures(req.body);
  res.json({ success: true, data: result });
};

export const postBulkUpdateFeeStructures = async (req: CustomRequest, res: Response) => {
  const result = await feeStructureService.bulkUpdateFeeStructures({
    feeStructureIds: req.body.feeStructureIds,
    feeHeadId: req.body.feeHeadId,
    newAmount: req.body.newAmount,
    effectiveFrom: new Date(req.body.effectiveFrom),
    userId: req.user!.id,
  });
  res.json({ success: true, message: `Successfully updated ${result.updatedCount} class fee structures`, data: result });
};

export const postFeeStructure = async (req: CustomRequest, res: Response) => {
  const structure = await feeStructureService.createFeeStructureWithItems(req.body);
  await ledgerService.createAuditLog({
    action: "CREATE_FEE_STRUCTURE",
    entityType: "FeeStructure",
    entityId: structure.id,
    userId: req.user!.id,
    newValues: structure,
  });
  res.status(201).json({ success: true, data: structure });
};

export const putFeeStructure = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const structure = await feeStructureService.updateFeeStructure(id, req.body);
  await ledgerService.createAuditLog({
    action: "UPDATE_FEE_STRUCTURE",
    entityType: "FeeStructure",
    entityId: id,
    userId: req.user!.id,
    newValues: structure,
  });
  res.json({ success: true, data: structure });
};

export const deleteFeeStructure = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  await feeStructureService.deleteFeeStructure(id);
  await ledgerService.createAuditLog({
    action: "DELETE_FEE_STRUCTURE",
    entityType: "FeeStructure",
    entityId: id,
    userId: req.user!.id,
  });
  res.json({ success: true, message: "Fee structure deleted successfully" });
};

// Fee Charges
export const postGenerateCharges = async (req: CustomRequest, res: Response) => {
  const result = await feeChargeService.generateChargesForClassSection(req.body);
  await ledgerService.createAuditLog({
    action: "GENERATE_FEE_CHARGES",
    entityType: "ClassSection",
    entityId: req.body.classSectionId,
    userId: req.user!.id,
    newValues: result,
  });
  res.json({ success: true, data: result });
};

export const getStudentDueSummary = async (req: CustomRequest, res: Response) => {
  const studentId = Number(req.params.studentId);
  const isAllowed = await verifyStudentAccess(req, studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden: You cannot access another student's financial info" });
    return;
  }
  const summary = await feeChargeService.getStudentDueSummary(studentId);
  res.json({ success: true, data: summary });
};

// Invoices
export const postGenerateInvoice = async (req: CustomRequest, res: Response) => {
  const { studentId, sessionId, chargeIds, notes } = req.body;
  const isAllowed = await verifyStudentAccess(req, studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const invoice = await invoiceService.createInvoiceForCharges({ studentId, sessionId, chargeIds, notes });
  await ledgerService.createAuditLog({
    action: "GENERATE_INVOICE",
    entityType: "Invoice",
    entityId: invoice.id,
    userId: req.user!.id,
    newValues: invoice,
  });
  res.status(201).json({ success: true, data: invoice });
};

export const getInvoices = async (req: CustomRequest, res: Response) => {
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
  if (studentId) {
    const isAllowed = await verifyStudentAccess(req, studentId);
    if (!isAllowed) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  }
  const invoices = await invoiceService.listInvoices({
    studentId,
    sessionId: req.query.sessionId ? Number(req.query.sessionId) : undefined,
    status: req.query.status as any,
  });
  res.json({ success: true, data: invoices });
};

export const getInvoiceById = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const invoice = await invoiceService.getInvoiceById(id);
  if (!invoice) {
    res.status(404).json({ success: false, message: "Invoice not found" });
    return;
  }
  const isAllowed = await verifyStudentAccess(req, invoice.studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  res.json({ success: true, data: invoice });
};

// Razorpay Online Payments
export const postCreateRazorpayOrder = async (req: CustomRequest, res: Response) => {
  const { studentId, requestedAmount, chargeIds } = req.body;
  const isAllowed = await verifyStudentAccess(req, studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const order = await razorpayService.createRazorpayOrderForStudent({
    studentId,
    requestedAmount: requestedAmount ? Number(requestedAmount) : undefined,
    chargeIds,
  });
  res.json({ success: true, data: order });
};

export const postVerifyRazorpayPayment = async (req: CustomRequest, res: Response) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, studentId } = req.body;
  const isAllowed = await verifyStudentAccess(req, studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const result = await razorpayService.verifyAndConfirmRazorpayPayment({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    studentId,
  });
  await ledgerService.createAuditLog({
    action: "RAZORPAY_PAYMENT_VERIFIED",
    entityType: "Payment",
    entityId: result.payment.id,
    userId: req.user!.id,
    newValues: result,
  });
  res.json({ success: true, data: result });
};

export const postRazorpayWebhook = async (req: CustomRequest, res: Response) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody = JSON.stringify(req.body);
  const result = await razorpayService.processRazorpayWebhook(rawBody, signature);
  res.json({ success: true, data: result });
};

// Offline Manual Payment Entry
export const postManualPayment = async (req: CustomRequest, res: Response) => {
  const { studentId, amount, mode, transactionRef } = req.body;
  const receiptNumber = await receiptService.generateReceiptNumber();
  const paymentNumber = `PAY-MANUAL-${Date.now()}-${studentId}`;

  const payment = await prisma.payment.create({
    data: {
      paymentNumber,
      studentId,
      amount: Number(amount),
      mode: mode as FeeMode,
      status: PaymentStatus.SUCCESS,
      transactionRef,
      receiptNumber,
      paidAt: new Date(),
      recordedByUserId: req.user!.id,
    },
  });

  // Allocate payment FIFO
  await paymentAllocationService.allocatePaymentToCharges(payment.id, studentId, Number(amount));

  await ledgerService.createAuditLog({
    action: "RECORD_MANUAL_PAYMENT",
    entityType: "Payment",
    entityId: payment.id,
    userId: req.user!.id,
    newValues: payment,
  });

  res.status(201).json({ success: true, data: payment });
};

export const postFamilyPayment = async (req: CustomRequest, res: Response) => {
  const { parentGuardianId, totalAmount, mode, transactionRef, notes, allocations } = req.body;
  try {
    const result = await recordFamilyPayment({
      parentGuardianId: Number(parentGuardianId),
      totalAmount: Number(totalAmount),
      mode: mode as FeeMode,
      transactionRef,
      notes,
      recordedByUserId: req.user!.id,
      allocations,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Receipts
export const getReceipt = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const receipt = await receiptService.getReceiptDetails(id);
  const isAllowed = await verifyStudentAccess(req, receipt.student.id);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  res.json({ success: true, data: receipt });
};

export const getReceiptPdfHtml = async (req: CustomRequest, res: Response) => {
  const id = Number(req.params.id);
  const receipt = await receiptService.getReceiptDetails(id);
  const isAllowed = await verifyStudentAccess(req, receipt.student.id);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const html = receiptService.generateReceiptHtml(receipt);
  res.setHeader("Content-Type", "text/html");
  res.send(html);
};

export const getFamilyReceipt = async (req: CustomRequest, res: Response) => {
  const { receiptNo } = req.params;
  const batch = await prisma.paymentBatch.findUnique({
    where: { receiptNumber: receiptNo },
    include: {
      parentGuardian: true,
      payments: {
        include: {
          student: true,
          allocations: {
            include: { feeCharge: { include: { feeHead: true } } }
          }
        }
      }
    }
  });

  if (!batch) {
    res.status(404).json({ success: false, message: "Receipt not found" });
    return;
  }

  res.json({ success: true, data: batch });
};

// Student Financial Ledger
export const getStudentLedger = async (req: CustomRequest, res: Response) => {
  const studentId = Number(req.params.studentId);
  const isAllowed = await verifyStudentAccess(req, studentId);
  if (!isAllowed) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  const ledger = await ledgerService.getStudentLedger(studentId);
  res.json({ success: true, data: ledger });
};

// Adjustments & Discounts
export const postAdjustment = async (req: CustomRequest, res: Response) => {
  const adjustment = await adjustmentService.applyFeeAdjustment({
    ...req.body,
    appliedByUserId: req.user!.id,
  });
  await ledgerService.createAuditLog({
    action: "APPLY_FEE_ADJUSTMENT",
    entityType: "FeeAdjustment",
    entityId: adjustment.id,
    userId: req.user!.id,
    newValues: adjustment,
  });
  res.status(201).json({ success: true, data: adjustment });
};

// Refunds
export const postRefundRequest = async (req: CustomRequest, res: Response) => {
  const refund = await adjustmentService.createRefundRequest({
    ...req.body,
    requestedByUserId: req.user!.id,
  });
  await ledgerService.createAuditLog({
    action: "CREATE_REFUND_REQUEST",
    entityType: "Refund",
    entityId: refund.id,
    userId: req.user!.id,
    newValues: refund,
  });
  res.status(201).json({ success: true, data: refund });
};

export const patchApproveRefund = async (req: CustomRequest, res: Response) => {
  const refundId = Number(req.params.id);
  const { approved } = req.body;
  const refund = await adjustmentService.approveOrRejectRefund({
    refundId,
    approved,
    approvedByUserId: req.user!.id,
  });
  await ledgerService.createAuditLog({
    action: approved ? "APPROVE_REFUND" : "REJECT_REFUND",
    entityType: "Refund",
    entityId: refund.id,
    userId: req.user!.id,
    newValues: refund,
  });
  res.json({ success: true, data: refund });
};

export const getRefunds = async (req: CustomRequest, res: Response) => {
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
  if (studentId) {
    const isAllowed = await verifyStudentAccess(req, studentId);
    if (!isAllowed) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  }
  const refunds = await adjustmentService.listRefunds(studentId);
  res.json({ success: true, data: refunds });
};

// Reports & Audit Logs
export const getCollectionReport = async (req: CustomRequest, res: Response) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const report = await ledgerService.getCollectionReport(startDate, endDate);
  res.json({ success: true, data: report });
};

export const getDefaultersReport = async (req: CustomRequest, res: Response) => {
  const classSectionId = req.query.classSectionId ? Number(req.query.classSectionId) : undefined;
  const report = await ledgerService.getDefaultersReport(classSectionId);
  res.json({ success: true, data: report });
};

export const getAuditLogs = async (_req: CustomRequest, res: Response) => {
  const logs = await ledgerService.getAuditLogs();
  res.json({ success: true, data: logs });
};

// Fee Duplication, Billing Calendar, Simulator & Due Date Extensions
export const postDuplicateFeeStructure = async (req: CustomRequest, res: Response) => {
  const sourceStructureId = Number(req.params.id);
  const { targetSessionId, targetClassSectionId, name } = req.body;
  const result = await feeStructureService.duplicateFeeStructure({
    sourceStructureId,
    targetSessionId: Number(targetSessionId),
    targetClassSectionId: targetClassSectionId ? Number(targetClassSectionId) : undefined,
    name,
  });
  res.json({ success: true, data: result });
};

export const getBillingCalendar = async (req: CustomRequest, res: Response) => {
  const classSectionId = Number(req.query.classSectionId);
  const sessionId = Number(req.query.sessionId);
  if (!classSectionId || !sessionId) {
    res.status(400).json({ success: false, message: "classSectionId and sessionId are required" });
    return;
  }
  const calendar = await feeStructureService.getBillingCalendar(classSectionId, sessionId);
  res.json({ success: true, data: calendar });
};

export const postSimulateStudentFees = async (req: CustomRequest, res: Response) => {
  const { sessionId, classSectionId, studentId, billingYear } = req.body;
  const simulation = await feeStructureService.simulateStudentFees({
    sessionId: Number(sessionId),
    classSectionId: Number(classSectionId),
    studentId: studentId ? Number(studentId) : undefined,
    billingYear: billingYear ? Number(billingYear) : undefined,
  });
  res.json({ success: true, data: simulation });
};

export const postPreviewInvoice = async (req: CustomRequest, res: Response) => {
  const { studentId, sessionId, billingMonth, billingYear } = req.body;
  const preview = await invoiceService.previewInvoiceForStudent({
    studentId: Number(studentId),
    sessionId: Number(sessionId),
    billingMonth: Number(billingMonth),
    billingYear: Number(billingYear),
  });
  res.json({ success: true, data: preview });
};

export const postExtendDueDate = async (req: CustomRequest, res: Response) => {
  const invoiceId = Number(req.params.id);
  const { newDueDate, reason } = req.body;
  const result = await invoiceService.extendInvoiceDueDate({
    invoiceId,
    newDueDate: new Date(newDueDate),
    changedByUserId: req.user!.id,
    reason,
  });
  res.json({ success: true, data: result });
};

// Transport Villages & Student Assignment Endpoints
export const getTransportVillages = async (req: CustomRequest, res: Response) => {
  const includeInactive = req.query.includeInactive === "true";
  await transportVillageService.seedDefaultVillages();
  const villages = await transportVillageService.listVillages(includeInactive);
  res.json({ success: true, data: villages });
};

export const postTransportVillage = async (req: CustomRequest, res: Response) => {
  const { name, monthlyFee } = req.body;
  const village = await transportVillageService.createVillage({ name, monthlyFee: Number(monthlyFee) });
  res.json({ success: true, data: village });
};

export const putTransportVillageFee = async (req: CustomRequest, res: Response) => {
  const villageId = Number(req.params.id);
  const { monthlyFee, effectiveDate } = req.body;
  const village = await transportVillageService.updateVillageFee(villageId, {
    monthlyFee: Number(monthlyFee),
    effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
  });
  res.json({ success: true, data: village });
};

export const patchTransportVillageStatus = async (req: CustomRequest, res: Response) => {
  const villageId = Number(req.params.id);
  const { isActive } = req.body;
  const village = await transportVillageService.toggleVillageStatus(villageId, Boolean(isActive));
  res.json({ success: true, data: village });
};

export const getTransportAssignments = async (req: CustomRequest, res: Response) => {
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
  const assignments = await transportVillageService.listStudentTransportAssignments(studentId);
  res.json({ success: true, data: assignments });
};

export const postAssignTransport = async (req: CustomRequest, res: Response) => {
  const { studentId, villageId, startDate, endDate, policy } = req.body;
  const assignment = await transportVillageService.assignStudentTransport({
    studentId: Number(studentId),
    villageId: Number(villageId),
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    policy,
  });
  res.json({ success: true, data: assignment });
};

export const postDiscontinueTransport = async (req: CustomRequest, res: Response) => {
  const { assignmentId, discontinuedAt, reason, policy } = req.body;
  const assignment = await transportVillageService.discontinueStudentTransport({
    assignmentId: Number(assignmentId),
    discontinuedAt: new Date(discontinuedAt),
    reason,
    policy,
  });
  res.json({ success: true, data: assignment });
};

// Collection Period Engine Controllers
export const getCollectionPeriodOverview = async (req: CustomRequest, res: Response) => {
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
  const overview = await collectionEngineService.getCollectionDashboardOverview(month, year, sessionId);
  res.json({ success: true, data: overview });
};

export const postPreviewCollectionPeriod = async (req: CustomRequest, res: Response) => {
  const result = await collectionEngineService.previewCollectionPeriod(req.body);
  res.json({ success: true, data: result });
};

export const postGenerateCollectionPeriodBills = async (req: CustomRequest, res: Response) => {
  const result = await collectionEngineService.generateCollectionPeriodBills(req.body);
  await ledgerService.createAuditLog({
    action: "GENERATE_COLLECTION_PERIOD_BILLS",
    entityType: "CollectionPeriod",
    entityId: 0,
    userId: req.user!.id,
    newValues: result,
  });
  res.json({ success: true, data: result });
};

// Waivers
export const postWaiveLateFee = async (req: CustomRequest, res: Response) => {
  const { feeChargeIds, waiverAmountPerCharge, reason } = req.body;
  const result = await adjustmentService.waiveLateFee(feeChargeIds, waiverAmountPerCharge, reason, req.user!.id);
  res.json({ success: true, data: result });
};

export const postWaiveSmallBalance = async (req: CustomRequest, res: Response) => {
  const { feeChargeId, reason, limit } = req.body;
  const result = await adjustmentService.waiveSmallBalance(Number(feeChargeId), reason, req.user!.id, limit ? Number(limit) : undefined);
  res.json({ success: true, data: result });
};

export const postWaiveFee = async (req: CustomRequest, res: Response) => {
  const { feeChargeId, amountToWaive, reason } = req.body;
  const result = await adjustmentService.waiveFee(Number(feeChargeId), Number(amountToWaive), reason, req.user!.id);
  res.json({ success: true, data: result });
};

export const deleteTransportVillage = async (req: CustomRequest, res: Response) => {
  try {
    const villageId = Number(req.params.id);
    await transportVillageService.deleteVillage(villageId);
    res.json({ success: true, message: "Location deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to delete transport location" });
  }
};

export const deleteTransportAssignment = async (req: CustomRequest, res: Response) => {
  try {
    const assignmentId = Number(req.params.id);
    await transportVillageService.deleteStudentTransportAssignment(assignmentId);
    res.json({ success: true, message: "Transport assignment deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Failed to delete transport assignment" });
  }
};

export const getLateFeeRules = async (req: CustomRequest, res: Response) => {
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : 1;
  const rules = await feeStructureService.listLateFeeRules(sessionId);
  res.json({ success: true, data: rules });
};

export const postLateFeeRule = async (req: CustomRequest, res: Response) => {
  const { sessionId, gracePeriodDays, feeType, amount, slabsJson } = req.body;
  if (!sessionId || !feeType || amount === undefined) {
    res.status(400).json({ success: false, message: "sessionId, feeType, and amount are required" });
    return;
  }
  const rule = await feeStructureService.createLateFeeRule({
    sessionId: Number(sessionId),
    gracePeriodDays: gracePeriodDays ? Number(gracePeriodDays) : 10,
    feeType,
    amount: Number(amount),
    slabsJson: typeof slabsJson === "string" ? slabsJson : slabsJson ? JSON.stringify(slabsJson) : undefined,
  });
  res.status(201).json({ success: true, data: rule });
};
