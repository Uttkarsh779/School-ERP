import { prisma } from "../../config/prisma";
import { ChargeStatus, FeeFrequency, JoiningPolicy } from "../../generated/prisma/enums";
import { calculateTransportFeeForPeriod } from "../transport/transportVillageService";

export const getOrCreateTransportFeeHead = async () => {
  let feeHead = await prisma.feeHead.findUnique({ where: { name: "Transport Fee" } });
  if (!feeHead) {
    feeHead = await prisma.feeHead.create({
      data: {
        name: "Transport Fee",
        code: "TRANSPORT",
        description: "Village-based student transportation fee",
        isRecurring: true,
        allowPartialPayment: true,
      },
    });
  }
  return feeHead;
};

export const generateChargesForClassSection = async (data: {
  sessionId: number;
  classSectionId: number;
  billingMonth: number; // 1-12
  billingYear: number;  // e.g. 2026
}) => {
  const { sessionId, classSectionId, billingMonth, billingYear } = data;

  // 1. Fetch class students
  const students = await prisma.student.findMany({
    where: { classSectionId, isActive: true },
    include: { feeAssignments: true },
  });

  // 2. Fetch fee structures for this class section (or global session structure)
  const structures = await prisma.feeStructure.findMany({
    where: {
      sessionId,
      OR: [{ classSectionId }, { classSectionId: null }],
    },
    include: {
      items: {
        include: {
          feeHead: true,
        },
      },
    },
  });

  const transportHead = await getOrCreateTransportFeeHead();

  let generatedCount = 0;
  let skippedCount = 0;

  for (const student of students) {
    const admissionMonth = student.admissionDate ? new Date(student.admissionDate).getMonth() + 1 : null;
    const admissionYear = student.admissionDate ? new Date(student.admissionDate).getFullYear() : null;

    // 3. Prepare Base Line Items for Concession Calculation
    const lineItems: Array<{ feeHeadId: number; headName: string; code: string; amount: number }> = [];

    for (const structure of structures) {
      for (const item of structure.items) {
        if (!item.applicableMonths.includes(billingMonth)) continue;
        let baseAmount = Number(item.amount);
        if (admissionMonth && admissionYear && admissionYear === billingYear && admissionMonth === billingMonth) {
          const assignment = student.feeAssignments.find((a: any) => a.feeStructureId === structure.id);
          const policy = assignment?.joiningDatePolicy ?? JoiningPolicy.FULL_MONTH;
          if (policy === JoiningPolicy.NEXT_MONTH) continue;
          if (policy === JoiningPolicy.PRORATED && student.admissionDate) {
            const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
            const joinDay = new Date(student.admissionDate).getDate();
            const activeDays = Math.max(1, daysInMonth - joinDay + 1);
            baseAmount = Math.round((Number(item.amount) / daysInMonth) * activeDays);
          }
        }
        lineItems.push({
          feeHeadId: item.feeHeadId,
          headName: item.feeHead?.name || "Fee",
          code: item.feeHead?.code || "FEE",
          amount: baseAmount,
        });
      }
    }

    const transportAmount = await calculateTransportFeeForPeriod(student.id, billingYear, billingMonth);
    if (transportAmount > 0) {
      lineItems.push({
        feeHeadId: transportHead.id,
        headName: "Transport Fee",
        code: "TRANSPORT",
        amount: transportAmount,
      });
    }

    // 4. Calculate Concessions for these items
    const { calculateConcessionsForStudent } = await import("../concessions/concessionCalculationService");
    const appliedConcessions = await calculateConcessionsForStudent(student.id, billingMonth, billingYear, lineItems);

    // Group concessions by headId
    const concessionsByHead = appliedConcessions.reduce((acc, c) => {
      if (!acc[c.feeHeadId]) acc[c.feeHeadId] = [];
      acc[c.feeHeadId].push(c);
      return acc;
    }, {} as Record<number, typeof appliedConcessions>);

    // 5. Create Charges and Adjustments
    const dueDate = new Date(billingYear, billingMonth - 1, 10);
    const systemUserId = 1; // Assuming super admin user id is 1, ideally should be passed from context

    for (const item of lineItems) {
      const existingCharge = await prisma.feeCharge.findUnique({
        where: {
          studentId_feeHeadId_sessionId_billingYear_billingMonth: {
            studentId: student.id,
            feeHeadId: item.feeHeadId,
            sessionId,
            billingYear,
            billingMonth,
          },
        },
      });

      if (!existingCharge) {
        try {
          const concessions = concessionsByHead[item.feeHeadId] || [];
          const totalDiscount = concessions.reduce((sum, c) => sum + c.amount, 0);
          const netAmount = Math.max(0, item.amount - totalDiscount);

          const feeStructureItemId = structures.flatMap(s => s.items).find(i => i.feeHeadId === item.feeHeadId)?.id;

          await prisma.$transaction(async (tx) => {
            const charge = await tx.feeCharge.create({
              data: {
                studentId: student.id,
                feeHeadId: item.feeHeadId,
                feeStructureItemId: feeStructureItemId || null,
                sessionId,
                billingMonth,
                billingYear,
                dueDate,
                baseAmount: item.amount,
                discountAmount: totalDiscount,
                lateFeeAmount: 0,
                netAmount: netAmount,
                paidAmount: 0,
                status: ChargeStatus.UNPAID,
              },
            });

            for (const c of concessions) {
              await tx.feeAdjustment.create({
                data: {
                  studentId: student.id,
                  feeChargeId: charge.id,
                  studentConcessionId: c.studentConcessionId || null,
                  type: c.type,
                  calculationType: "FIXED_AMOUNT", // Resolves all dynamic logic at this point
                  value: c.amount,
                  amount: c.amount,
                  reason: c.reason,
                  appliedByUserId: systemUserId,
                }
              });
            }
          });
          generatedCount++;
        } catch (err) {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }
  }

  return {
    success: true,
    generatedCount,
    skippedCount,
    message: `Generated ${generatedCount} fee charges for ${students.length} students.`,
  };
};

export const getStudentDueSummary = async (studentId: number) => {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      classSection: true,
      feeCharges: {
        where: {
          status: { in: [ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID] },
        },
        include: {
          feeHead: true,
          feeStructureItem: true,
        },
        orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
      },
      advances: {
        where: { status: "AVAILABLE" },
      },
    },
  });

  const now = new Date();
  const chargesWithLateFee = student.feeCharges.map((charge: any) => {
    let lateFee = Number(charge.lateFeeAmount);
    if (now > charge.dueDate && charge.status !== ChargeStatus.PAID) {
      const daysOverdue = Math.floor((now.getTime() - charge.dueDate.getTime()) / (1000 * 3600 * 24));
      if (daysOverdue > 0 && lateFee === 0) {
        if (daysOverdue <= 10) lateFee = 100;
        else if (daysOverdue <= 20) lateFee = 250;
        else lateFee = 500;
      }
    }

    const netAmount = Math.max(0, Number(charge.baseAmount) - Number(charge.discountAmount) + lateFee);
    const outstanding = Math.max(0, netAmount - Number(charge.paidAmount));

    return {
      ...charge,
      baseAmount: Number(charge.baseAmount),
      discountAmount: Number(charge.discountAmount),
      paidAmount: Number(charge.paidAmount),
      calculatedLateFee: lateFee,
      netAmount,
      outstandingAmount: outstanding,
    };
  });

  let totalOutstanding = chargesWithLateFee.reduce((sum: number, c: any) => sum + c.outstandingAmount, 0);

  if (totalOutstanding === 0) {
    const studentInvoices = await prisma.invoice.findMany({
      where: {
        studentId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
    });

    for (const inv of studentInvoices) {
      const dueAmt = Math.max(0, Number(inv.totalAmount) - Number(inv.paidAmount || 0));
      totalOutstanding += dueAmt;
    }
  }

  const totalAdvanceAvailable = student.advances.reduce((sum: number, a: any) => sum + Number(a.remainingAmount), 0);

  return {
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      classSection: `${student.classSection.className} - ${student.classSection.section}`,
    },
    charges: chargesWithLateFee,
    totalOutstanding,
    totalAdvanceAvailable,
    netPayable: Math.max(0, totalOutstanding - totalAdvanceAvailable),
  };
};
