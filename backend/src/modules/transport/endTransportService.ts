import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { syncMonthInvoice } from "../fees/billingService";
import { loadTransportContext, transportFeeForMonth } from "./transportVillageService";

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// A student stops using school transport. `lastDay` is the last day they use the bus.
//  - Their active transport assignment(s) end on that day and the bus route is removed, so
//    no transport fee is billed for later months (billing reads the assignment's end date).
//  - Transport bills already issued for the end month or later are brought down to what is
//    now owed: the unpaid excess is waived (recorded as a fee waiver with the reason). Any
//    excess already paid is reported back so the office can refund or keep it as credit.
// policy: FULL_MONTH charges the whole end month; PRORATED charges only the days used.
export const endStudentTransport = async (data: {
  studentId: number;
  lastDay: Date;
  policy: "FULL_MONTH" | "PRORATED";
  reason?: string;
  appliedByUserId: number;
}) => {
  const { studentId, policy, appliedByUserId } = data;
  const lastDay = dayStart(data.lastDay);
  if (Number.isNaN(lastDay.getTime())) throw httpError(400, "Choose the last day of transport");

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, admissionNo: true, transportRouteId: true } });
  if (!student) throw httpError(404, "Student not found");
  const active = await prisma.studentTransportAssignment.findMany({ where: { studentId, status: "ACTIVE" } });
  if (active.length === 0 && !student.transportRouteId) throw httpError(400, "This student is not using school transport");
  const starts: Date[] = active.map((a: { startDate: Date }) => a.startDate);
  const earliestStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  if (earliestStart && lastDay < dayStart(earliestStart)) {
    throw httpError(400, `The last day can't be before transport started (${fmt(earliestStart)})`);
  }
  const reason = data.reason?.trim() || "Stopped using school transport";

  return prisma.$transaction(
    async (tx) => {
      if (active.length) {
        await tx.studentTransportAssignment.updateMany({
          where: { id: { in: active.map((a: { id: number }) => a.id) } },
          data: { status: "DISCONTINUED", endDate: lastDay, discontinuedAt: lastDay, discontinueReason: reason, policy },
        });
      }
      await tx.student.update({ where: { id: studentId }, data: { transportRouteId: null } });

      // Bills already issued for the end month onwards.
      const head = await tx.feeHead.findUnique({ where: { name: "Transport Fee" } });
      const waived: Array<{ month: number; year: number; amount: number }> = [];
      let alreadyPaid = 0;
      if (head) {
        const assignments = await loadTransportContext(tx, studentId);
        const fromKey = lastDay.getFullYear() * 12 + lastDay.getMonth();
        const charges = (
          await tx.feeCharge.findMany({
            where: { studentId, feeHeadId: head.id, status: { notIn: ["CANCELLED", "VOID"] } },
          })
        ).filter((c: { billingYear: number; billingMonth: number }) => c.billingYear * 12 + (c.billingMonth - 1) >= fromKey);

        for (const c of charges) {
          const owed = transportFeeForMonth(assignments, c.billingYear, c.billingMonth);
          const charged = Number(c.baseAmount) - Number(c.discountAmount);
          const excess = Math.max(0, charged - owed);
          if (excess <= 0) continue;
          const outstanding = Math.max(0, Number(c.netAmount) - Number(c.paidAmount));
          const waive = Math.min(excess, outstanding);
          alreadyPaid += excess - waive;
          if (waive <= 0) continue;
          const net = Number(c.netAmount) - waive;
          await tx.feeCharge.update({
            where: { id: c.id },
            data: {
              discountAmount: Number(c.discountAmount) + waive,
              netAmount: net,
              status: Number(c.paidAmount) >= net ? "PAID" : Number(c.paidAmount) > 0 ? "PARTIALLY_PAID" : c.status,
            },
          });
          await tx.feeAdjustment.create({
            data: {
              studentId,
              feeChargeId: c.id,
              type: "FEE_WAIVER",
              calculationType: "FIXED_AMOUNT",
              value: waive,
              amount: waive,
              reason: `Transport ended on ${fmt(lastDay)} — ${reason}`,
              appliedByUserId,
            },
          });
          await syncMonthInvoice(tx, student, c.sessionId, c.billingMonth, c.billingYear);
          waived.push({ month: c.billingMonth, year: c.billingYear, amount: waive });
        }
      }

      return {
        lastDay,
        endedAssignments: active.length,
        waivedTotal: waived.reduce((s, w) => s + w.amount, 0),
        waived,
        alreadyPaid,
      };
    },
    { timeout: 20000 }
  );
};
