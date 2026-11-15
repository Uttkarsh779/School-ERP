import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

export type TransportAssignmentStatus = "ACTIVE" | "DISCONTINUED";
export const TransportAssignmentStatus = {
  ACTIVE: "ACTIVE" as const,
  DISCONTINUED: "DISCONTINUED" as const,
};

export type TransportBillingPolicy = "FULL_MONTH" | "PRORATED" | "NEXT_PERIOD";
export const TransportBillingPolicy = {
  FULL_MONTH: "FULL_MONTH" as const,
  PRORATED: "PRORATED" as const,
  NEXT_PERIOD: "NEXT_PERIOD" as const,
};

export const seedDefaultVillages = async () => {
  const totalCount = await prisma.transportVillage.count();
  if (totalCount > 0) return;

  const dummyVillages = [
    { name: "Rampur", monthlyFee: 1200 },
    { name: "Lakshmipur", monthlyFee: 1500 },
    { name: "Haripur", monthlyFee: 1800 },
    { name: "Madhopur", monthlyFee: 2000 },
    { name: "Shivnagar", monthlyFee: 2200 },
    { name: "Rajapur", monthlyFee: 2500 },
    { name: "Chandipur", monthlyFee: 1700 },
    { name: "Sultanpur", monthlyFee: 2800 },
  ];

  for (const item of dummyVillages) {
    const existing = await prisma.transportVillage.findUnique({ where: { name: item.name } });
    if (!existing) {
      const village = await prisma.transportVillage.create({
        data: {
          name: item.name,
          monthlyFee: item.monthlyFee,
          isActive: true,
        },
      });
      await prisma.villageFeeHistory.create({
        data: {
          villageId: village.id,
          monthlyFee: item.monthlyFee,
          effectiveDate: new Date(),
        },
      });
    }
  }
};

export const listVillages = async (includeInactive = false) => {
  return prisma.transportVillage.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: {
      feeHistory: {
        orderBy: { effectiveDate: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });
};

const assertFee = (fee: number) => {
  if (!Number.isFinite(fee) || fee < 0) throw httpError(400, "Enter a monthly fee of 0 or more");
};

export const createVillage = async (data: { name: string; monthlyFee: number }) => {
  const name = String(data.name ?? "").trim();
  if (!name) throw httpError(400, "Enter the location's name");
  assertFee(data.monthlyFee);
  if (await prisma.transportVillage.findUnique({ where: { name } })) throw httpError(409, `"${name}" already exists`);

  return prisma.transportVillage.create({
    data: {
      name,
      monthlyFee: data.monthlyFee,
      isActive: true,
      feeHistory: { create: { monthlyFee: data.monthlyFee, effectiveDate: new Date() } },
    },
  });
};

export const updateVillageFee = async (
  villageId: number,
  data: { monthlyFee: number; effectiveDate?: Date }
) => {
  assertFee(data.monthlyFee);
  const effectiveDate = data.effectiveDate ?? new Date();
  if (Number.isNaN(effectiveDate.getTime())) throw httpError(400, "Pick a valid effective date");

  // The fee history decides what's billed. The location's own fee is what it costs today, so a
  // new fee starting later waits for its date instead of changing today's figure.
  const startsNow = effectiveDate <= new Date();
  await prisma.$transaction([
    ...(startsNow ? [prisma.transportVillage.update({ where: { id: villageId }, data: { monthlyFee: data.monthlyFee } })] : []),
    prisma.villageFeeHistory.create({ data: { villageId, monthlyFee: data.monthlyFee, effectiveDate } }),
  ]);

  return prisma.transportVillage.findUnique({
    where: { id: villageId },
    include: { feeHistory: { orderBy: { effectiveDate: "desc" } } },
  });
};

export const toggleVillageStatus = async (villageId: number, isActive: boolean) => {
  return prisma.transportVillage.update({
    where: { id: villageId },
    data: { isActive },
  });
};

export const listStudentTransportAssignments = async (studentId?: number) => {
  return prisma.studentTransportAssignment.findMany({
    where: studentId ? { studentId } : undefined,
    include: {
      village: true,
      // Only what the roster shows, not the whole student record.
      student: { select: { id: true, name: true, admissionNo: true, classSection: { select: { className: true, section: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const assignStudentTransport = async (data: {
  studentId: number;
  villageId: number;
  startDate: Date;
  endDate?: Date;
  policy?: TransportBillingPolicy;
}) => {
  const { studentId, villageId, startDate, endDate, policy = TransportBillingPolicy.FULL_MONTH } = data;
  if (Number.isNaN(new Date(startDate).getTime())) throw httpError(400, "Pick the start date");

  const village = await prisma.transportVillage.findUnique({ where: { id: villageId } });
  if (!village) throw httpError(404, "Transport location not found");
  if (!village.isActive) {
    throw new Error("This location is inactive. Choose another one or make it active first.");
  }

  // Backend Overlap Validation:
  // existing.startDate <= new.endDate AND existing.endDate >= new.startDate
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw httpError(404, "Student not found");
  }

  const existingAssignments = await prisma.studentTransportAssignment.findMany({
    where: {
      studentId,
      status: TransportAssignmentStatus.ACTIVE,
    },
  });

  const newStart = new Date(startDate);
  const newEnd = endDate ? new Date(endDate) : new Date("2099-12-31");

  for (const ex of existingAssignments) {
    const exStart = new Date(ex.startDate);
    const exEnd = ex.endDate ? new Date(ex.endDate) : new Date("2099-12-31");

    if (exStart <= newEnd && exEnd >= newStart) {
      throw new Error(
        `Overlapping transport assignment: ${student.name} already has transport from ${exStart.toISOString().split("T")[0]}${ex.endDate ? ` to ${exEnd.toISOString().split("T")[0]}` : ""}. End it first.`
      );
    }
  }

  return prisma.studentTransportAssignment.create({
    data: {
      studentId,
      villageId,
      monthlyFee: village.monthlyFee,
      startDate: newStart,
      endDate: endDate ? new Date(endDate) : null,
      status: TransportAssignmentStatus.ACTIVE,
      policy,
    },
    include: { village: true, student: true },
  });
};

export const discontinueStudentTransport = async (data: {
  assignmentId: number;
  discontinuedAt: Date;
  reason?: string;
  policy?: TransportBillingPolicy;
}) => {
  const { assignmentId, discontinuedAt, reason, policy } = data;

  const assignment = await prisma.studentTransportAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
  });

  return prisma.studentTransportAssignment.update({
    where: { id: assignmentId },
    data: {
      status: TransportAssignmentStatus.DISCONTINUED,
      endDate: new Date(discontinuedAt),
      discontinuedAt: new Date(discontinuedAt),
      discontinueReason: reason,
      policy: policy ?? assignment.policy,
    },
    include: { village: true, student: true },
  });
};

export const getEffectiveVillageFeeForDate = async (villageId: number, targetDate: Date): Promise<number> => {
  const history = await prisma.villageFeeHistory.findMany({
    where: {
      villageId,
      effectiveDate: { lte: targetDate },
    },
    orderBy: { effectiveDate: "desc" },
    take: 1,
  });

  if (history.length > 0) {
    return Number(history[0].monthlyFee);
  }

  const village = await prisma.transportVillage.findUniqueOrThrow({ where: { id: villageId } });
  return Number(village.monthlyFee);
};

// A student's transport assignments with their villages' fee history, loaded once so the
// fee for many months can be worked out without more queries (transportFeeForMonth).
export const loadTransportContext = async (db: any, studentId: number) =>
  db.studentTransportAssignment.findMany({
    where: { studentId },
    include: { village: { include: { feeHistory: { orderBy: { effectiveDate: "desc" } } } } },
  });

// Village fee in force on a date: latest history entry on/before it, else the village's fee.
const villageFeeOn = (village: any, date: Date) => {
  const entry = (village.feeHistory ?? []).find((h: any) => new Date(h.effectiveDate) <= date);
  return Number(entry ? entry.monthlyFee : village.monthlyFee);
};

// Dates are stored at midnight UTC, which is 5:30 AM in India: compare whole days, or the 1st
// of a month looks like "mid-month" on a server running on Indian time.
const wholeDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const transportFeeForMonth = (assignments: any[], billingYear: number, billingMonth: number): number => {
  const monthStart = new Date(billingYear, billingMonth - 1, 1);
  const monthEnd = new Date(billingYear, billingMonth, 0); // last day of month
  const daysInMonth = monthEnd.getDate();

  let totalFee = 0;
  for (const assign of assignments) {
    const assignStart = wholeDay(new Date(assign.startDate));
    const assignEnd = wholeDay(assign.endDate ? new Date(assign.endDate) : new Date("2099-12-31"));
    if (assignStart > monthEnd || assignEnd < monthStart) continue;

    const monthlyFee = villageFeeOn(assign.village, monthEnd);
    const policy = assign.policy;

    // Check if start is mid-month
    const isStartMidMonth = assignStart > monthStart && assignStart <= monthEnd;
    // Check if discontinuation is mid-month
    const isStopMidMonth = assignEnd >= monthStart && assignEnd < monthEnd;

    if (!isStartMidMonth && !isStopMidMonth) {
      // Full month active
      totalFee += monthlyFee;
    } else if (policy === TransportBillingPolicy.FULL_MONTH) {
      totalFee += monthlyFee;
    } else if (policy === TransportBillingPolicy.NEXT_PERIOD) {
      // Mid-month start -> 0 for current month; mid-month stop -> full for current month
      totalFee += isStartMidMonth ? 0 : monthlyFee;
    } else if (policy === TransportBillingPolicy.PRORATED) {
      const activeStart = assignStart > monthStart ? assignStart.getDate() : 1;
      const activeEnd = assignEnd < monthEnd ? assignEnd.getDate() : daysInMonth;
      const activeDays = Math.max(0, activeEnd - activeStart + 1);
      totalFee += Math.round((monthlyFee * activeDays) / daysInMonth);
    }
  }
  return totalFee;
};

export const calculateTransportFeeForPeriod = async (
  studentId: number,
  billingYear: number,
  billingMonth: number // 1-12
): Promise<number> =>
  transportFeeForMonth(await loadTransportContext(prisma, studentId), billingYear, billingMonth);

export const deleteVillage = async (villageId: number) => {
  const count = await prisma.studentTransportAssignment.count({
    where: { villageId },
  });
  if (count > 0) {
    throw new Error("Cannot delete: students are assigned to this location.");
  }
  await prisma.villageFeeHistory.deleteMany({ where: { villageId } });
  return prisma.transportVillage.delete({ where: { id: villageId } });
};

// Deleting is for an assignment made by mistake. Bills read the assignments, so once a transport
// bill exists for its months the record has to stay: End transport handles that case.
export const deleteStudentTransportAssignment = async (assignmentId: number) => {
  const assignment = await prisma.studentTransportAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw httpError(404, "This transport assignment no longer exists");
  const head = await prisma.feeHead.findUnique({ where: { name: "Transport Fee" } });
  if (head) {
    const start = new Date(assignment.startDate);
    const end = assignment.endDate ? new Date(assignment.endDate) : new Date("2099-12-31");
    const key = (year: number, month: number) => year * 12 + month;
    const charges = await prisma.feeCharge.findMany({
      where: { studentId: assignment.studentId, feeHeadId: head.id, status: { notIn: ["CANCELLED", "VOID"] } },
      select: { billingYear: true, billingMonth: true },
    });
    const billed = charges.some((c: { billingYear: number; billingMonth: number }) => {
      const month = key(c.billingYear, c.billingMonth);
      return month >= key(start.getFullYear(), start.getMonth() + 1) && month <= key(end.getFullYear(), end.getMonth() + 1);
    });
    if (billed) throw httpError(409, "Transport has already been billed for this student, so this record can't be deleted. Use End transport instead.");
  }
  return prisma.studentTransportAssignment.delete({ where: { id: assignmentId } });
};
