import { prisma } from "../../config/prisma";
import { AdjustmentType, CalculationType, StaffCategory } from "../../generated/prisma/enums";

export interface IAppliedConcession {
  type: AdjustmentType;
  concessionSchemeId?: number;
  studentConcessionId?: number;
  staffId?: number;
  feeHeadId: number;
  amount: number;
  reason: string;
}

export const calculateConcessionsForStudent = async (
  studentId: number,
  billingMonth: number,
  billingYear: number,
  lineItems: Array<{ feeHeadId: number; headName: string; code: string; amount: number }>
): Promise<IAppliedConcession[]> => {
  const appliedConcessions: IAppliedConcession[] = [];
  const billingDate = new Date(billingYear, billingMonth - 1, 1);

  // 1. Fetch Student & Relationships
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parents: {
        where: { isPrimary: true },
        include: {
          parent: {
            include: { user: true }
          }
        }
      }
    }
  });

  if (!student) return appliedConcessions;

  // 2. Fetch Active Student-Specific Concessions
  const activeStudentConcessions = await prisma.studentConcession.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      OR: [
        { startsFrom: null },
        { startsFrom: { lte: billingDate } }
      ],
      AND: [
        { OR: [{ endsOn: null }, { endsOn: { gte: billingDate } }] }
      ]
    },
    include: {
      concessionScheme: true
    }
  });

  // 3. Fetch Global Active Schemes (Family & Staff)
  const globalSchemes = await prisma.concessionScheme.findMany({
    where: {
      isActive: true,
      OR: [
        { type: AdjustmentType.SIBLING_DISCOUNT },
        { type: AdjustmentType.STAFF_CHILD }
      ],
      AND: [
        { OR: [{ startsFrom: null }, { startsFrom: { lte: billingDate } }] },
        { OR: [{ endsOn: null }, { endsOn: { gte: billingDate } }] }
      ]
    }
  });

  // Track remaining base amounts per head to prevent negative fees
  const remainingAmounts: Record<number, number> = {};
  for (const item of lineItems) {
    remainingAmounts[item.feeHeadId] = item.amount;
  }

  const applyDiscount = (headId: number, maxAmount: number, percentage: number | null, fixedAmt: number | null): number => {
    let discount = 0;
    if (percentage !== null) {
      discount = (maxAmount * percentage) / 100;
    } else if (fixedAmt !== null) {
      discount = fixedAmt;
    }
    const actualRemaining = remainingAmounts[headId] || 0;
    const finalDiscount = Math.min(discount, actualRemaining); // Never exceed remaining
    if (finalDiscount > 0) {
      remainingAmounts[headId] -= finalDiscount;
    }
    return finalDiscount;
  };

  // ORDER 1: SCHOLARSHIPS (From StudentConcession)
  const scholarships = activeStudentConcessions.filter(c => c.type === AdjustmentType.SCHOLARSHIP);
  for (const conc of scholarships) {
    for (const headId of conc.applicableHeads) {
      if (remainingAmounts[headId] > 0) {
        const val = Number(conc.value);
        const isPct = conc.calculationType === CalculationType.PERCENTAGE;
        const discount = applyDiscount(headId, lineItems.find(i => i.feeHeadId === headId)?.amount || 0, isPct ? val : null, isPct ? null : val);
        if (discount > 0) {
          appliedConcessions.push({
            type: AdjustmentType.SCHOLARSHIP,
            studentConcessionId: conc.id,
            concessionSchemeId: conc.concessionSchemeId || undefined,
            feeHeadId: headId,
            amount: discount,
            reason: conc.reason || conc.concessionScheme?.name || "Scholarship"
          });
        }
      }
    }
  }

  // ORDER 2: SIBLING DISCOUNTS (Global Scheme evaluation)
  const siblingScheme = globalSchemes.find(s => s.type === AdjustmentType.SIBLING_DISCOUNT);
  if (siblingScheme && siblingScheme.configJson) {
    const parentRelation = student.parents[0];
    if (parentRelation && parentRelation.siblingOrder > 1) {
      let config: any = {};
      try { config = JSON.parse(siblingScheme.configJson); } catch (e) {}
      
      const siblingConfig = config[parentRelation.siblingOrder.toString()];
      if (siblingConfig) {
        const val = Number(siblingConfig.value || siblingScheme.value);
        const isPct = (siblingConfig.calculationType || siblingScheme.calculationType) === CalculationType.PERCENTAGE;
        
        for (const headId of siblingScheme.applicableHeads) {
          if (remainingAmounts[headId] > 0) {
            const discount = applyDiscount(headId, lineItems.find(i => i.feeHeadId === headId)?.amount || 0, isPct ? val : null, isPct ? null : val);
            if (discount > 0) {
              appliedConcessions.push({
                type: AdjustmentType.SIBLING_DISCOUNT,
                concessionSchemeId: siblingScheme.id,
                feeHeadId: headId,
                amount: discount,
                reason: siblingScheme.name
              });
            }
          }
        }
      }
    }
  }

  // ORDER 3: STAFF CHILD DISCOUNTS (Global Scheme evaluated against Student -> Parent -> Staff)
  const staffScheme = globalSchemes.find(s => s.type === AdjustmentType.STAFF_CHILD);
  if (staffScheme && staffScheme.configJson) {
    const parentRelation = student.parents[0];
    if (parentRelation && parentRelation.parent?.userId) {
      const staffMember = await prisma.staff.findUnique({ where: { userId: parentRelation.parent.userId } });
      // Only apply if staff is active (User.isActive) - we already filtered active students, but check staff
      if (staffMember && parentRelation.parent.user?.isActive) {
        let config: any = {};
        try { config = JSON.parse(staffScheme.configJson); } catch (e) {}

        const catConfig = config[staffMember.staffCategory];
        if (catConfig) {
          const val = Number(catConfig.value);
          const isPct = catConfig.calculationType === CalculationType.PERCENTAGE;

          for (const headId of staffScheme.applicableHeads) {
            if (remainingAmounts[headId] > 0) {
              const discount = applyDiscount(headId, lineItems.find(i => i.feeHeadId === headId)?.amount || 0, isPct ? val : null, isPct ? null : val);
              if (discount > 0) {
                appliedConcessions.push({
                  type: AdjustmentType.STAFF_CHILD,
                  concessionSchemeId: staffScheme.id,
                  staffId: staffMember.id,
                  feeHeadId: headId,
                  amount: discount,
                  reason: `Staff Child Concession (${staffMember.staffCategory})`
                });
              }
            }
          }
        }
      }
    }
  }

  // ORDER 4: CUSTOM STUDENT CONCESSIONS (Transport, Special, Other)
  const otherConcessions = activeStudentConcessions.filter(c => c.type !== AdjustmentType.SCHOLARSHIP);
  for (const conc of otherConcessions) {
    for (const headId of conc.applicableHeads) {
      if (remainingAmounts[headId] > 0) {
        const val = Number(conc.value);
        const isPct = conc.calculationType === CalculationType.PERCENTAGE;
        const discount = applyDiscount(headId, lineItems.find(i => i.feeHeadId === headId)?.amount || 0, isPct ? val : null, isPct ? null : val);
        if (discount > 0) {
          appliedConcessions.push({
            type: conc.type,
            studentConcessionId: conc.id,
            concessionSchemeId: conc.concessionSchemeId || undefined,
            feeHeadId: headId,
            amount: discount,
            reason: conc.reason || conc.concessionScheme?.name || "Custom Concession"
          });
        }
      }
    }
  }

  return appliedConcessions;
};
