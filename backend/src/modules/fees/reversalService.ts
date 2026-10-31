import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { computeMonthBill, loadBillingContext, periodCodeFor, syncMonthInvoice } from "./billingService";
import { createAuditLog } from "./ledgerService";

// Correcting fee mistakes the way school ERPs do: nothing is deleted. Every correction keeps
// the original record, marks it cancelled/reversed with who did it and why, puts the
// money/bills back to the right state, and is written to the fee audit log.
//
//  - Cancel receipt: an office payment recorded by mistake. Its amounts are taken back off
//    the bills it paid (they become unpaid / part-paid again). Online (Razorpay) payments are
//    real bank transfers — those go through Refunds instead.
//  - Cancel bill: a month's bill that shouldn't exist (wrong student / month). Only while
//    nothing has been paid on it; cancel the receipts first otherwise.
//  - Recalculate bill: re-works an unpaid bill from the current fee structure, transport and
//    concessions (after fixing a wrong amount), or restores a cancelled bill.
//  - Reverse waiver: a late-fee / fee / small-balance waiver given by mistake.

const MANUAL_WAIVERS = new Set(["LATE_FEE_WAIVER", "SMALL_BALANCE_WAIVER", "FEE_WAIVER", "OTHER"]);
type Actor = { id: number };

const reasonOf = (reason: unknown) => {
  if (typeof reason !== "string" || reason.trim().length < 3) throw httpError(400, "Please give a reason (at least 3 characters)");
  return reason.trim().slice(0, 300);
};
const num = (v: unknown) => Number(v ?? 0);
const statusFor = (paid: number, net: number) => (net <= 0 || paid >= net ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "UNPAID");
const PERIOD_RE = /^([A-Z]{3})_(\d{4})$/;
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const periodOf = (code: string | null) => {
  const m = code?.match(PERIOD_RE);
  if (!m) throw httpError(400, "This bill isn't a monthly bill");
  return { month: MON.indexOf(m[1]) + 1, year: Number(m[2]) };
};

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export const cancelPayment = async (actor: Actor, paymentId: number, rawReason: unknown) => {
  const reason = reasonOf(rawReason);
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      allocations: { include: { feeCharge: true } },
      advances: true,
      refunds: true,
      student: { select: { id: true, admissionNo: true } },
    },
  });
  if (!payment) throw httpError(404, "Payment not found");
  if (payment.status === "CANCELLED") throw httpError(409, "This receipt is already cancelled");
  if (payment.status !== "SUCCESS") throw httpError(409, "Only completed payments can be cancelled");
  if (payment.mode === "GATEWAY") {
    throw httpError(409, "Online payments are real bank transfers and can't be cancelled here — raise a refund instead.");
  }
  if (payment.refunds.some((r: any) => r.status !== "REFUND_REJECTED")) {
    throw httpError(409, "A refund has been raised against this payment — settle the refund instead of cancelling.");
  }
  if (payment.advances.some((a: any) => num(a.usedAmount) > 0)) {
    throw httpError(409, "Part of this payment was kept as advance and has already been used.");
  }

  const months = new Map<string, { sessionId: number; month: number; year: number }>();
  await prisma.$transaction(async (tx: any) => {
    for (const a of payment.allocations as any[]) {
      // Re-read inside the transaction: other payments may have touched the charge.
      const c = await tx.feeCharge.findUnique({ where: { id: a.feeChargeId } });
      const paid = Math.max(0, num(c.paidAmount) - num(a.allocatedAmount));
      await tx.feeCharge.update({
        where: { id: c.id },
        data: { paidAmount: paid, status: c.status === "CANCELLED" || c.status === "VOID" ? c.status : statusFor(paid, num(c.netAmount)) },
      });
      months.set(`${c.sessionId}:${c.billingYear}:${c.billingMonth}`, { sessionId: c.sessionId, month: c.billingMonth, year: c.billingYear });
    }
    await tx.advancePayment.deleteMany({ where: { paymentId } });
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: reason },
    });
    for (const m of months.values()) await syncMonthInvoice(tx, payment.student, m.sessionId, m.month, m.year);
  });

  await createAuditLog({
    action: "CANCEL_PAYMENT",
    entityType: "Payment",
    entityId: paymentId,
    userId: actor.id,
    oldValues: { status: payment.status, amount: num(payment.amount), receiptNumber: payment.receiptNumber },
    newValues: { status: "CANCELLED", reason, billsReopened: months.size },
  });
  return { paymentId, receiptNumber: payment.receiptNumber, billsReopened: months.size };
};

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

const loadMonth = async (db: any, invoiceId: number) => {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { student: { select: { id: true, admissionNo: true, name: true } } } });
  if (!invoice) throw httpError(404, "Bill not found");
  const { month, year } = periodOf(invoice.collectionPeriodCode);
  const charges = await db.feeCharge.findMany({
    where: { studentId: invoice.studentId, sessionId: invoice.sessionId, billingMonth: month, billingYear: year },
    include: { adjustments: true },
  });
  return { invoice, month, year, charges };
};

const assertNothingPaid = async (charges: any[]) => {
  const paid = charges.filter((c) => num(c.paidAmount) > 0);
  if (paid.length === 0) return;
  const allocations = await prisma.paymentAllocation.findMany({
    where: { feeChargeId: { in: paid.map((c) => c.id) }, payment: { status: "SUCCESS" } },
    select: { payment: { select: { receiptNumber: true, paymentNumber: true } } },
  });
  const receipts = [...new Set(allocations.map((a: any) => a.payment.receiptNumber ?? a.payment.paymentNumber))];
  throw httpError(
    409,
    `Payments have been received on this bill${receipts.length ? ` (receipt ${receipts.join(", ")})` : ""}. Cancel ${receipts.length > 1 ? "those receipts" : "that receipt"} first.`
  );
};

export const cancelInvoice = async (actor: Actor, invoiceId: number, rawReason: unknown) => {
  const reason = reasonOf(rawReason);
  const { invoice, charges } = await loadMonth(prisma, invoiceId);
  if (invoice.status === "CANCELLED") throw httpError(409, "This bill is already cancelled");
  await assertNothingPaid(charges);

  await prisma.$transaction(async (tx: any) => {
    await tx.feeCharge.updateMany({ where: { id: { in: charges.map((c: any) => c.id) } }, data: { status: "CANCELLED" } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: reason },
    });
  });
  await createAuditLog({
    action: "CANCEL_BILL",
    entityType: "Invoice",
    entityId: invoiceId,
    userId: actor.id,
    oldValues: { status: invoice.status, totalAmount: num(invoice.totalAmount) },
    newValues: { status: "CANCELLED", reason },
  });
  return { invoiceId, invoiceNumber: invoice.invoiceNumber };
};

export const recalculateInvoice = async (actor: Actor, invoiceId: number) => {
  const { invoice, month, year, charges } = await loadMonth(prisma, invoiceId);
  await assertNothingPaid(charges);
  const waivers = charges.flatMap((c: any) => c.adjustments.filter((a: any) => MANUAL_WAIVERS.has(a.type) && !a.reversedAt));
  if (waivers.length) throw httpError(409, "This bill has waivers on it. Reverse them first (student → Fees), then recalculate.");

  const ctx = await loadBillingContext(prisma, invoice.studentId, invoice.sessionId);
  const bill = computeMonthBill(ctx, month, year);
  const before = { status: invoice.status, totalAmount: num(invoice.totalAmount) };

  const result = await prisma.$transaction(async (tx: any) => {
    const billedBy = actor.id;
    const byHead = new Map(charges.map((c: any) => [c.feeHeadId, c]));
    // Concession lines are re-derived from the current concessions.
    await tx.feeAdjustment.deleteMany({ where: { feeChargeId: { in: charges.map((c: any) => c.id) }, reversedAt: null } });

    const keep = new Set<number>();
    for (const line of bill.eligible ? bill.lines : []) {
      const existing: any = byHead.get(line.feeHeadId);
      const data = {
        feeStructureItemId: line.feeStructureItemId,
        dueDate: line.dueDate,
        baseAmount: line.baseAmount,
        discountAmount: line.discountAmount,
        lateFeeAmount: 0,
        netAmount: line.netAmount,
        paidAmount: 0,
        status: line.netAmount > 0 ? "UNPAID" : "PAID",
      };
      const charge = existing
        ? await tx.feeCharge.update({ where: { id: existing.id }, data })
        : await tx.feeCharge.create({
            data: { ...data, studentId: invoice.studentId, feeHeadId: line.feeHeadId, sessionId: invoice.sessionId, billingMonth: month, billingYear: year },
          });
      keep.add(charge.id);
      for (const c of line.concessions) {
        await tx.feeAdjustment.create({
          data: {
            studentId: invoice.studentId,
            feeChargeId: charge.id,
            studentConcessionId: c.studentConcessionId ?? null,
            type: c.type,
            calculationType: "FIXED_AMOUNT",
            value: c.amount,
            amount: c.amount,
            reason: c.reason,
            appliedByUserId: billedBy,
          },
        });
      }
    }
    const dropped = charges.filter((c: any) => !keep.has(c.id)).map((c: any) => c.id);
    if (dropped.length) {
      await tx.feeCharge.updateMany({ where: { id: { in: dropped } }, data: { status: "CANCELLED" } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId, feeChargeId: { in: dropped } } });
    }

    if (keep.size === 0) {
      return tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: `Recalculated: ${bill.reason ?? "no fee applies"}` },
      });
    }
    // syncMonthInvoice refreshes totals/status; clear any earlier cancellation.
    await tx.invoice.update({ where: { id: invoiceId }, data: { cancelledAt: null, cancelledByUserId: null, cancelReason: null } });
    return syncMonthInvoice(tx, invoice.student, invoice.sessionId, month, year);
  });

  await createAuditLog({
    action: invoice.status === "CANCELLED" ? "RESTORE_BILL" : "RECALCULATE_BILL",
    entityType: "Invoice",
    entityId: invoiceId,
    userId: actor.id,
    oldValues: before,
    newValues: { status: result?.status, totalAmount: num(result?.totalAmount) },
  });
  return { invoiceId, status: result?.status, totalAmount: num(result?.totalAmount), oldTotal: before.totalAmount };
};

// Bulk versions for one month (optionally one class): each bill is handled on its own and
// bills that can't be changed (payments received, waivers) are reported, not forced.
const periodInvoices = async (sessionId: number, month: number, year: number, classSectionId?: number) =>
  prisma.invoice.findMany({
    where: {
      sessionId,
      collectionPeriodCode: periodCodeFor(month, year),
      status: { not: "CANCELLED" },
      ...(classSectionId ? { student: { classSectionId } } : {}),
    },
    select: { id: true, invoiceNumber: true, student: { select: { name: true } } },
  });

const parsePeriod = (body: any) => {
  const sessionId = Number(body?.sessionId);
  const month = Number(body?.billingMonth);
  const year = Number(body?.billingYear);
  const classSectionId = body?.classSectionId ? Number(body.classSectionId) : undefined;
  if (!Number.isInteger(sessionId) || !(month >= 1 && month <= 12) || !Number.isInteger(year)) throw httpError(400, "Choose a session and month");
  return { sessionId, month, year, classSectionId };
};

const bulk = async (invoices: Array<{ id: number; invoiceNumber: string; student: { name: string } }>, run: (id: number) => Promise<unknown>) => {
  let done = 0;
  const skipped: Array<{ invoiceNumber: string; student: string; reason: string }> = [];
  for (const inv of invoices) {
    try {
      await run(inv.id);
      done++;
    } catch (err: any) {
      skipped.push({ invoiceNumber: inv.invoiceNumber, student: inv.student.name, reason: err?.message ?? "Failed" });
    }
  }
  return { done, skipped };
};

export const cancelInvoicesForPeriod = async (actor: Actor, body: any) => {
  const reason = reasonOf(body?.reason);
  const p = parsePeriod(body);
  return bulk(await periodInvoices(p.sessionId, p.month, p.year, p.classSectionId), (id) => cancelInvoice(actor, id, reason));
};

export const recalculateInvoicesForPeriod = async (actor: Actor, body: any) => {
  const p = parsePeriod(body);
  return bulk(await periodInvoices(p.sessionId, p.month, p.year, p.classSectionId), (id) => recalculateInvoice(actor, id));
};

// ---------------------------------------------------------------------------
// Waivers
// ---------------------------------------------------------------------------

export const reverseAdjustment = async (actor: Actor, adjustmentId: number, rawReason: unknown) => {
  const reason = reasonOf(rawReason);
  const adj = await prisma.feeAdjustment.findUnique({ where: { id: adjustmentId }, include: { feeCharge: true, student: { select: { id: true, admissionNo: true } } } });
  if (!adj) throw httpError(404, "Waiver not found");
  if (adj.reversedAt) throw httpError(409, "This waiver is already reversed");
  if (!MANUAL_WAIVERS.has(adj.type)) {
    throw httpError(409, "Concessions are managed from the student's concessions; change the concession and recalculate the bill instead.");
  }
  const c: any = adj.feeCharge;
  if (c && (c.status === "CANCELLED" || c.status === "VOID")) throw httpError(409, "The bill this waiver was on has been cancelled");

  await prisma.$transaction(async (tx: any) => {
    if (c) {
      const fresh = await tx.feeCharge.findUnique({ where: { id: c.id } });
      const amount = num(adj.amount);
      const lateFee = adj.type === "LATE_FEE_WAIVER" ? num(fresh.lateFeeAmount) + amount : num(fresh.lateFeeAmount);
      const discount = adj.type === "LATE_FEE_WAIVER" ? num(fresh.discountAmount) : Math.max(0, num(fresh.discountAmount) - amount);
      const net = Math.max(0, num(fresh.baseAmount) - discount + lateFee);
      await tx.feeCharge.update({
        where: { id: fresh.id },
        data: { lateFeeAmount: lateFee, discountAmount: discount, netAmount: net, status: statusFor(num(fresh.paidAmount), net) },
      });
    }
    await tx.feeAdjustment.update({ where: { id: adjustmentId }, data: { reversedAt: new Date(), reversedByUserId: actor.id, reverseReason: reason } });
    if (c) await syncMonthInvoice(tx, adj.student, c.sessionId, c.billingMonth, c.billingYear);
  });

  await createAuditLog({
    action: "REVERSE_WAIVER",
    entityType: "FeeAdjustment",
    entityId: adjustmentId,
    userId: actor.id,
    oldValues: { type: adj.type, amount: num(adj.amount), reason: adj.reason },
    newValues: { reversed: true, reason },
  });
  return { adjustmentId };
};
