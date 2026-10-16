import { prisma } from "../../config/prisma";

export const getConcessionSchemes = async () => {
  return prisma.concessionScheme.findMany({
    orderBy: { createdAt: "desc" }
  });
};

export const createConcessionScheme = async (data: any) => {
  return prisma.concessionScheme.create({
    data: {
      name: data.name,
      type: data.type,
      calculationType: data.calculationType,
      value: data.value,
      applicableHeads: data.applicableHeads || [],
      startsFrom: data.startsFrom ? new Date(data.startsFrom) : null,
      endsOn: data.endsOn ? new Date(data.endsOn) : null,
      configJson: data.configJson || null,
      isActive: data.isActive !== undefined ? data.isActive : true
    }
  });
};

export const getStudentConcessions = async (studentId: number) => {
  return prisma.studentConcession.findMany({
    where: { studentId },
    include: { concessionScheme: true, staff: true, approvedByUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" }
  });
};

export const getAllConcessions = async () => {
  return prisma.studentConcession.findMany({
    include: { 
      student: { select: { name: true, classSection: { select: { className: true, section: true } } } },
      concessionScheme: true,
      staff: true,
      approvedByUser: { select: { name: true } } 
    },
    orderBy: { createdAt: "desc" }
  });
};

export const endStudentConcession = async (id: number, effectiveDate: Date) => {
  return prisma.studentConcession.update({
    where: { id },
    data: {
      status: "CANCELLED",
      endsOn: effectiveDate
    }
  });
};

export const assignStudentConcession = async (data: any, approvedByUserId: number) => {
  if (data.type === "STAFF_CHILD" || data.staffId) {
    if (!data.staffId) throw new Error("Staff Member is required for Staff Child Discount");
    
    const staffObj = await prisma.staff.findUnique({ 
      where: { id: data.staffId }, 
      include: { user: { include: { parent: true } } } 
    });
    if (!staffObj) throw new Error("Staff Member not found");

    // Automatically create ParentGuardian profile for Staff member's user if not present
    let parentObj = staffObj.user?.parent;
    if (!parentObj) {
      parentObj = await prisma.parentGuardian.create({
        data: {
          userId: staffObj.userId,
          name: staffObj.user?.name || "Staff Parent",
          email: staffObj.user?.email?.endsWith(".internal") ? null : staffObj.user?.email,
          contact: staffObj.contact,
        },
      });
    }

    // Automatically create ParentStudent link if not present
    const existingLink = await prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId: parentObj.id, studentId: data.studentId } },
    });
    if (!existingLink) {
      await prisma.parentStudent.create({
        data: {
          parentId: parentObj.id,
          studentId: data.studentId,
          relationshipType: "Staff Parent",
          isPrimary: false,
        },
      });
    }
  }

  const existing = await prisma.studentConcession.findMany({
    where: { studentId: data.studentId, type: data.type, status: "ACTIVE" }
  });

  const hasOverlap = existing.some(ex => {
    const newStart = data.startsFrom ? new Date(data.startsFrom) : new Date(0);
    const newEnd = data.endsOn ? new Date(data.endsOn) : new Date(8640000000000000);
    const exStart = ex.startsFrom ? new Date(ex.startsFrom) : new Date(0);
    const exEnd = ex.endsOn ? new Date(ex.endsOn) : new Date(8640000000000000);
    const datesOverlap = newStart <= exEnd && exStart <= newEnd;
    
    const newHeads = data.applicableHeads || [];
    const exHeads = ex.applicableHeads || [];
    const headsOverlap = newHeads.some((h: number) => exHeads.includes(h)) || (newHeads.length === 0 && exHeads.length === 0);
    return datesOverlap && headsOverlap;
  });

  if (hasOverlap) {
    throw new Error("Validation Error: The student already has an active, overlapping concession of this type for the specified fee heads.");
  }

  return prisma.studentConcession.create({
    data: {
      studentId: data.studentId,
      concessionSchemeId: data.concessionSchemeId,
      staffId: data.staffId,
      type: data.type,
      calculationType: data.calculationType,
      value: data.value,
      applicableHeads: data.applicableHeads || [],
      startsFrom: data.startsFrom ? new Date(data.startsFrom) : null,
      endsOn: data.endsOn ? new Date(data.endsOn) : null,
      reason: data.reason,
      notes: data.notes,
      approvedByUserId
    }
  });
};
