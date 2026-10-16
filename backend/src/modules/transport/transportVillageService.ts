import { prisma } from "../../config/prisma";

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

export const createVillage = async (data: { name: string; monthlyFee: number }) => {
  const village = await prisma.transportVillage.create({
    data: {
      name: data.name,
      monthlyFee: data.monthlyFee,
      isActive: true,
    },
  });

  await prisma.villageFeeHistory.create({
    data: {
      villageId: village.id,
      monthlyFee: data.monthlyFee,
      effectiveDate: new Date(),
    },
  });

  return village;
};

export const updateVillageFee = async (
  villageId: number,
  data: { monthlyFee: number; effectiveDate?: Date }
) => {
  const effectiveDate = data.effectiveDate ?? new Date();

  await prisma.transportVillage.update({
    where: { id: villageId },
    data: { monthlyFee: data.monthlyFee },
  });

  await prisma.villageFeeHistory.create({
    data: {
      villageId,
      monthlyFee: data.monthlyFee,
      effectiveDate,
    },
  });

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
      student: { include: { classSection: true } },
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

  const village = await prisma.transportVillage.findUniqueOrThrow({ where: { id: villageId } });
  if (!village.isActive) {
    throw new Error("Cannot assign student to an inactive/soft-deleted village.");
  }

  // Backend Overlap Validation:
  // existing.startDate <= new.endDate AND existing.endDate >= new.startDate
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw new Error(`Student with ID ${studentId} does not exist`);
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
        `Overlapping transport assignment detected for student ID ${studentId} between ${exStart.toISOString().split("T")[0]} and ${exEnd.toISOString().split("T")[0]}`
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

export const calculateTransportFeeForPeriod = async (
  studentId: number,
  billingYear: number,
  billingMonth: number // 1-12
): Promise<number> => {
  const monthStart = new Date(billingYear, billingMonth - 1, 1);
  const monthEnd = new Date(billingYear, billingMonth, 0); // last day of month
  const daysInMonth = monthEnd.getDate();

  const assignments = await prisma.studentTransportAssignment.findMany({
    where: {
      studentId,
      startDate: { lte: monthEnd },
      OR: [
        { endDate: null },
        { endDate: { gte: monthStart } },
      ],
    },
    include: { village: true },
  });

  if (assignments.length === 0) return 0;

  let totalFee = 0;

  for (const assign of assignments) {
    const monthlyFee = await getEffectiveVillageFeeForDate(assign.villageId, monthEnd);
    const assignStart = new Date(assign.startDate);
    const assignEnd = assign.endDate ? new Date(assign.endDate) : new Date("2099-12-31");

    const policy = assign.policy;

    // Check if start is mid-month
    const isStartMidMonth = assignStart > monthStart && assignStart <= monthEnd;
    // Check if discontinuation is mid-month
    const isStopMidMonth = assignEnd >= monthStart && assignEnd < monthEnd;

    if (!isStartMidMonth && !isStopMidMonth) {
      // Full month active
      totalFee += monthlyFee;
    } else {
      if (policy === TransportBillingPolicy.FULL_MONTH) {
        totalFee += monthlyFee;
      } else if (policy === TransportBillingPolicy.NEXT_PERIOD) {
        if (isStartMidMonth) {
          // Mid-month start with NEXT_PERIOD -> 0 for current month
          totalFee += 0;
        } else if (isStopMidMonth) {
          // Mid-month stop with NEXT_PERIOD -> Full for current month, 0 next
          totalFee += monthlyFee;
        }
      } else if (policy === TransportBillingPolicy.PRORATED) {
        let activeStart = assignStart > monthStart ? assignStart.getDate() : 1;
        let activeEnd = assignEnd < monthEnd ? assignEnd.getDate() : daysInMonth;
        const activeDays = Math.max(0, activeEnd - activeStart + 1);
        totalFee += Math.round((monthlyFee * activeDays) / daysInMonth);
      }
    }
  }

  return totalFee;
};

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

export const deleteStudentTransportAssignment = async (assignmentId: number) => {
  return prisma.studentTransportAssignment.delete({ where: { id: assignmentId } });
};
