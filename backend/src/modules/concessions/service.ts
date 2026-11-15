import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

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

// Sibling discounts store sibling ids; add their names and classes for display.
type Sibling = { id: number; name: string; admissionNo: string; className: string };
const withSiblings = async <T extends { siblingStudentIds: number[] }>(rows: T[]): Promise<Array<T & { siblings: Sibling[] }>> => {
  const ids = [...new Set(rows.flatMap((r) => r.siblingStudentIds ?? []))];
  const students = ids.length
    ? await prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, admissionNo: true, classSection: { select: { className: true, section: true } } },
      })
    : [];
  const byId = new Map<number, Sibling>(
    students.map((s) => [s.id, { id: s.id, name: s.name, admissionNo: s.admissionNo, className: `${s.classSection.className} - ${s.classSection.section}` }])
  );
  return rows.map((r) => ({ ...r, siblings: (r.siblingStudentIds ?? []).flatMap((id) => byId.get(id) ?? []) }));
};

export const getStudentConcessions = async (studentId: number) => {
  return withSiblings(
    await prisma.studentConcession.findMany({
      where: { studentId },
      include: { concessionScheme: true, staff: true, approvedByUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" }
    })
  );
};

export const getAllConcessions = async () => {
  return withSiblings(await prisma.studentConcession.findMany({
    include: { 
      student: { select: { name: true, classSection: { select: { className: true, section: true } } } },
      concessionScheme: true,
      staff: true,
      approvedByUser: { select: { name: true } }
    },
    orderBy: { createdAt: "desc" }
  }));
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

// A sibling discount names at least one brother or sister studying in the school.
const parseSiblings = async (data: any): Promise<number[]> => {
  if (data.type !== "SIBLING_DISCOUNT") return [];
  const raw = Array.isArray(data.siblingStudentIds) ? data.siblingStudentIds : [];
  const ids: number[] = [...new Set<number>(raw.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw httpError(400, "Choose the brother(s) or sister(s) studying in the school");
  if (ids.includes(Number(data.studentId))) throw httpError(400, "A student can't be their own sibling");
  if (ids.length > 6) throw httpError(400, "Choose at most 6 siblings");
  const found = await prisma.student.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw httpError(400, "One of the chosen siblings wasn't found");
  return ids;
};

export const assignStudentConcession = async (data: any, approvedByUserId: number) => {
  const siblingStudentIds = await parseSiblings(data);
  if (data.type === "STAFF_CHILD" || data.staffId) {
    if (!data.staffId) throw new Error("Staff Member is required for Staff Child Discount");
    
    const staffObj = await prisma.staff.findUnique({ where: { id: data.staffId } });
    if (!staffObj) throw new Error("Staff Member not found");
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
      siblingStudentIds,
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
