import { prisma } from "../../config/prisma";
import type { FeeFrequency, LateFeeType } from "../../generated/prisma/enums";
import { calculateTransportFeeForPeriod } from "../transport/transportVillageService";

export const listFeeHeads = async () => {
  return prisma.feeHead.findMany({
    orderBy: { name: "asc" },
  });
};

export const createFeeHead = async (data: {
  name: string;
  code: string;
  description?: string;
  isRecurring?: boolean;
  allowPartialPayment?: boolean;
}) => {
  return prisma.feeHead.create({
    data: {
      name: data.name,
      code: data.code.toUpperCase(),
      description: data.description,
      isRecurring: data.isRecurring ?? true,
      allowPartialPayment: data.allowPartialPayment ?? true,
    },
  });
};

export const updateFeeHead = async (
  id: number,
  data: {
    name?: string;
    code?: string;
    description?: string;
  }
) => {
  return prisma.feeHead.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.code && { code: data.code.toUpperCase() }),
      ...(data.description !== undefined && { description: data.description }),
    },
  });
};

export const deleteFeeHead = async (id: number) => {
  const chargeCount = await prisma.feeCharge.count({ where: { feeHeadId: id } });
  if (chargeCount > 0) {
    throw new Error(
      `Cannot delete this fee head because ${chargeCount} student fee charges are linked to it. Please edit/rename the fee head instead to preserve historical financial records.`
    );
  }

  await prisma.feeStructureItem.deleteMany({
    where: { feeHeadId: id },
  });

  return prisma.feeHead.delete({
    where: { id },
  });
};

export const listFeeStructures = async (classSectionId?: number, sessionId?: number) => {
  return prisma.feeStructure.findMany({
    where: {
      classSectionId: classSectionId ?? undefined,
      sessionId: sessionId ?? undefined,
    },
    include: {
      session: true,
      classSection: true,
      items: {
        include: {
          feeHead: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getFeeStructureById = async (id: number) => {
  return prisma.feeStructure.findUnique({
    where: { id },
    include: {
      session: true,
      classSection: true,
      items: {
        include: {
          feeHead: true,
        },
      },
    },
  });
};

export const createFeeStructureWithItems = async (data: {
  sessionId: number;
  classSectionId?: number;
  name: string;
  description?: string;
  items: Array<{
    feeHeadId: number;
    amount: number;
    frequency: FeeFrequency;
    applicableMonths: number[]; // 1-12
    dueDateDay?: number;
    allowPartialPayment?: boolean;
    effectiveFrom?: Date;
    effectiveTo?: Date;
  }>;
}) => {
  return prisma.feeStructure.create({
    data: {
      sessionId: data.sessionId,
      classSectionId: data.classSectionId,
      name: data.name,
      description: data.description,
      items: {
        create: data.items.map((item: any) => ({
          feeHeadId: item.feeHeadId,
          amount: item.amount,
          frequency: item.frequency,
          applicableMonths: item.applicableMonths,
          dueDateDay: item.dueDateDay ?? 10,
          allowPartialPayment: item.allowPartialPayment ?? true,
          effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : new Date(),
          effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
        })),
      },
    },
    include: {
      items: {
        include: {
          feeHead: true,
        },
      },
    },
  });
};

export const updateFeeStructure = async (
  id: number,
  data: {
    name?: string;
    description?: string;
    items?: Array<{
      id?: number;
      feeHeadId: number;
      amount: number;
      frequency: FeeFrequency;
      applicableMonths: number[];
      dueDateDay?: number;
      allowPartialPayment?: boolean;
      effectiveFrom?: Date;
      effectiveTo?: Date;
    }>;
  }
) => {
  // Items are matched by fee head and updated in place (one transaction), so items that
  // already have bills keep their link; a removed item is deleted only if it was never billed.
  return prisma.$transaction(async (tx: any) => {
    if (data.items) {
      const existing = await tx.feeStructureItem.findMany({
        where: { feeStructureId: id },
        include: { feeHead: { select: { name: true } }, _count: { select: { charges: true } } },
      });
      const byHead = new Map<number, any>(existing.map((e: any) => [e.feeHeadId, e]));
      const incomingHeads = new Set(data.items.map((i: any) => Number(i.feeHeadId)));

      for (const old of existing) {
        if (!incomingHeads.has(old.feeHeadId)) {
          if (old._count.charges > 0) {
            throw Object.assign(
              new Error(`"${old.feeHead.name}" has already been billed and can't be removed. Change its amount instead.`),
              { statusCode: 409 }
            );
          }
          await tx.feeStructureItem.delete({ where: { id: old.id } });
        }
      }

      for (const item of data.items as any[]) {
        const fields = {
          amount: item.amount,
          frequency: item.frequency,
          applicableMonths: item.applicableMonths,
          dueDateDay: item.dueDateDay ?? 10,
          allowPartialPayment: item.allowPartialPayment ?? true,
        };
        const match = byHead.get(Number(item.feeHeadId));
        if (match) {
          await tx.feeStructureItem.update({ where: { id: match.id }, data: fields });
        } else {
          await tx.feeStructureItem.create({
            data: {
              feeStructureId: id,
              feeHeadId: Number(item.feeHeadId),
              ...fields,
              effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : new Date(),
              effectiveTo: item.effectiveTo ? new Date(item.effectiveTo) : null,
            },
          });
        }
      }
    }

    return tx.feeStructure.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
    },
    include: {
      items: {
        include: {
          feeHead: true,
        },
      },
    },
  });
  });
};

export const deleteFeeStructure = async (id: number) => {
  await prisma.feeStructureItem.deleteMany({
    where: { feeStructureId: id },
  });
  await prisma.studentFeeAssignment.deleteMany({
    where: { feeStructureId: id },
  });
  await prisma.feePayment.updateMany({
    where: { feeStructureId: id },
    data: { feeStructureId: null },
  });

  return prisma.feeStructure.delete({
    where: { id },
  });
};

export const duplicateFeeStructure = async (data: {
  sourceStructureId: number;
  targetSessionId: number;
  targetClassSectionId?: number;
  name?: string;
}) => {
  const source = await getFeeStructureById(data.sourceStructureId);
  if (!source) throw new Error("Source fee structure not found");

  return createFeeStructureWithItems({
    sessionId: data.targetSessionId,
    classSectionId: data.targetClassSectionId ?? source.classSectionId ?? undefined,
    name: data.name ?? `${source.name} (Copy)`,
    description: source.description ?? undefined,
    items: source.items.map((item: any) => ({
      feeHeadId: item.feeHeadId,
      amount: Number(item.amount),
      frequency: item.frequency,
      applicableMonths: item.applicableMonths,
      dueDateDay: item.dueDateDay,
      allowPartialPayment: item.allowPartialPayment,
      effectiveFrom: new Date(),
    })),
  });
};

export const getBillingCalendar = async (classSectionId: number, sessionId: number) => {
  const structures = await prisma.feeStructure.findMany({
    where: {
      sessionId,
      OR: [{ classSectionId }, { classSectionId: null }],
    },
    include: {
      items: {
        include: { feeHead: true },
      },
    },
  });

  const monthNames = [
    "June", "July", "August", "September", "October", "November",
    "December", "January", "February", "March", "April", "May"
  ];
  const monthOrder = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];

  const calendarRows: Array<{
    month: string;
    billingMonth: number;
    feeHead: string;
    coverage: string;
    amount: number;
    collectionDate: string;
    dueDate: string;
  }> = [];

  for (const m of monthOrder) {
    const monthName = monthNames[monthOrder.indexOf(m)];
    for (const s of structures) {
      for (const item of s.items) {
        if (item.applicableMonths.includes(m)) {
          calendarRows.push({
            month: monthName,
            billingMonth: m,
            feeHead: item.feeHead.name,
            coverage: `${monthName} Coverage`,
            amount: Number(item.amount),
            collectionDate: `01-${monthName.slice(0, 3)}`,
            dueDate: `${item.dueDateDay.toString().padStart(2, "0")}-${monthName.slice(0, 3)}`,
          });
        }
      }
    }
  }

  return {
    classSectionId,
    sessionId,
    calendar: calendarRows,
  };
};

export const simulateStudentFees = async (data: {
  sessionId: number;
  classSectionId: number;
  studentId?: number;
  billingYear?: number;
}) => {
  const { sessionId, classSectionId, studentId, billingYear = 2026 } = data;

  const structures = await prisma.feeStructure.findMany({
    where: {
      sessionId,
      OR: [{ classSectionId }, { classSectionId: null }],
    },
    include: {
      items: { include: { feeHead: true } },
    },
  });

  const monthOrder = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
  const monthNames = [
    "June", "July", "August", "September", "October", "November",
    "December", "January", "February", "March", "April", "May"
  ];

  let studentDiscount = 0;
  if (studentId) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { feeAdjustments: true },
    });
    if (student) {
      studentDiscount = student.feeAdjustments.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    }
  }

  const monthlyBreakdown: Array<{
    monthName: string;
    billingMonth: number;
    billingYear: number;
    baseFees: Array<{ feeHead: string; amount: number }>;
    transportFee: number;
    discount: number;
    expectedTotal: number;
    dueDate: string;
  }> = [];

  let annualTuition = 0;
  let annualFeeTotal = 0;
  let annualExamTotal = 0;
  let annualTransportTotal = 0;

  for (let i = 0; i < monthOrder.length; i++) {
    const m = monthOrder[i];
    const monthName = monthNames[i];
    const year = m >= 6 ? billingYear : billingYear + 1;

    const baseFees: Array<{ feeHead: string; amount: number }> = [];
    let monthBaseTotal = 0;

    for (const s of structures) {
      for (const item of s.items) {
        if (item.applicableMonths.includes(m)) {
          const amt = Number(item.amount);
          baseFees.push({ feeHead: item.feeHead.name, amount: amt });
          monthBaseTotal += amt;

          if (item.feeHead.name.toLowerCase().includes("tuition")) annualTuition += amt;
          else if (item.feeHead.name.toLowerCase().includes("annual")) annualFeeTotal += amt;
          else if (item.feeHead.name.toLowerCase().includes("exam")) annualExamTotal += amt;
        }
      }
    }

    let transportFee = 0;
    if (studentId) {
      transportFee = await calculateTransportFeeForPeriod(studentId, year, m);
    }
    annualTransportTotal += transportFee;

    const expectedTotal = Math.max(0, monthBaseTotal + transportFee - studentDiscount);

    monthlyBreakdown.push({
      monthName,
      billingMonth: m,
      billingYear: year,
      baseFees,
      transportFee,
      discount: studentDiscount,
      expectedTotal,
      dueDate: `10-${monthName.slice(0, 3)}-${year}`,
    });
  }

  const annualSummary = {
    tuition: annualTuition,
    annualFee: annualFeeTotal,
    examFees: annualExamTotal,
    transport: annualTransportTotal,
    discounts: studentDiscount * 12,
    expectedAnnualTotal: monthlyBreakdown.reduce((sum, m) => sum + m.expectedTotal, 0),
  };

  return {
    isSimulation: true,
    annualSummary,
    monthlyBreakdown,
  };
};

export const listLateFeeRules = async (sessionId: number) => {
  return prisma.lateFeeRule.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });
};

export const createLateFeeRule = async (data: {
  sessionId: number;
  gracePeriodDays?: number;
  feeType: LateFeeType;
  amount: number;
  slabsJson?: string;
}) => {
  return prisma.lateFeeRule.create({
    data: {
      sessionId: data.sessionId,
      gracePeriodDays: data.gracePeriodDays ?? 10,
      feeType: data.feeType,
      amount: data.amount,
      slabsJson: data.slabsJson,
    },
  });
};

export const previewBulkUpdateFeeStructures = async (data: {
  feeStructureIds: number[];
  feeHeadId: number;
  newAmount: number;
  effectiveFrom: string;
}) => {
  const structures = await prisma.feeStructure.findMany({
    where: { id: { in: data.feeStructureIds } },
    include: {
      classSection: true,
      items: { where: { feeHeadId: data.feeHeadId } },
    },
  });

  const classSectionIds = structures
    .map((s) => s.classSectionId)
    .filter((id): id is number => id !== null);

  const studentsCount = await prisma.student.count({
    where: { classSectionId: { in: classSectionIds }, isActive: true },
  });

  const selectedClasses = structures.map(
    (s) => (s.classSection ? `${s.classSection.className}-${s.classSection.section}` : s.name)
  );

  const currentAmounts = structures
    .flatMap((s) => s.items)
    .map((i) => Number(i.amount));
  const currentAvg = currentAmounts.length > 0
    ? currentAmounts.reduce((a, b) => a + b, 0) / currentAmounts.length
    : 0;

  return {
    selectedClasses,
    feeStructureCount: structures.length,
    currentAmount: currentAvg,
    newAmount: data.newAmount,
    effectiveFrom: data.effectiveFrom,
    studentsAffected: studentsCount,
    invoicesAffected: 0,
    futureBillingPeriods: `From ${new Date(data.effectiveFrom).toLocaleDateString("en-IN")}`,
  };
};

export const bulkUpdateFeeStructures = async (data: {
  feeStructureIds: number[];
  feeHeadId: number;
  newAmount: number;
  effectiveFrom: Date;
  userId: number;
}) => {
  const effectiveFromDate = new Date(data.effectiveFrom);
  const effectiveToForPrevious = new Date(effectiveFromDate.getTime() - 86400000);

  return prisma.$transaction(async (tx) => {
    const structures = await tx.feeStructure.findMany({
      where: { id: { in: data.feeStructureIds } },
      include: { items: true },
    });

    for (const st of structures) {
      const existingItem = st.items.find((i) => i.feeHeadId === data.feeHeadId);

      if (existingItem) {
        // Set previous version's end date
        await tx.feeStructureItem.update({
          where: { id: existingItem.id },
          data: { effectiveTo: effectiveToForPrevious },
        });

        // Create new version item
        await tx.feeStructureItem.create({
          data: {
            feeStructureId: st.id,
            feeHeadId: data.feeHeadId,
            amount: data.newAmount,
            frequency: existingItem.frequency,
            applicableMonths: existingItem.applicableMonths,
            dueDateDay: existingItem.dueDateDay,
            allowPartialPayment: existingItem.allowPartialPayment,
            effectiveFrom: effectiveFromDate,
            effectiveTo: null,
          },
        });
      } else {
        // Create initial version item
        await tx.feeStructureItem.create({
          data: {
            feeStructureId: st.id,
            feeHeadId: data.feeHeadId,
            amount: data.newAmount,
            frequency: "MONTHLY",
            applicableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            dueDateDay: 10,
            allowPartialPayment: true,
            effectiveFrom: effectiveFromDate,
            effectiveTo: null,
          },
        });
      }

      await tx.feeStructure.update({
        where: { id: st.id },
        data: { updatedAt: new Date() },
      });
    }

    await tx.feeAuditLog.create({
      data: {
        action: "BULK_UPDATE_FEE_STRUCTURES",
        entityType: "FeeStructure",
        entityId: data.feeStructureIds[0] || 0,
        userId: data.userId,
        newValues: JSON.stringify({
          feeStructureIds: data.feeStructureIds,
          feeHeadId: data.feeHeadId,
          newAmount: data.newAmount,
          effectiveFrom: data.effectiveFrom,
        }),
      },
    });

    return { updatedCount: structures.length };
  });
};
