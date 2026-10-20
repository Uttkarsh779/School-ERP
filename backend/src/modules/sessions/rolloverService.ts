// New academic session setup ("year-end rollover"), the way school ERPs do it:
//  1. copy last year's setup into the new session — class sections (+ class teachers),
//     subjects, teacher allocations, the weekly timetable, fee structures (optionally with
//     a % increase) and the late-fee rule. Idempotent: anything already in the new session
//     is left alone, so it can be re-run after adding a class.
//  2. promote students class by class — promote / detain / passed out / left — with roll
//     numbers reassigned. The year-end outcome is kept in StudentEnrollment, and leavers are
//     marked inactive (no more billing) and taken off transport.
// Nothing in the old session is changed or deleted: attendance, marks, fees and receipts stay
// as history, and unpaid fees remain payable as previous-session dues.

import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

const TX = { timeout: 120_000, maxWait: 20_000 };

// ---------- Class ordering (Nursery < LKG < UKG < Class 1 < … < Class 12) ----------

const PRE_PRIMARY: Array<[RegExp, number]> = [
  [/play\s*group|pre[\s-]*nursery|toddler/i, 1],
  [/nursery/i, 2],
  [/\blkg\b|lower\s*kg|kg\s*-?\s*1|\bjr\.?\s*kg/i, 3],
  [/\bukg\b|upper\s*kg|kg\s*-?\s*2|\bsr\.?\s*kg/i, 4],
  [/\bkg\b|kinder/i, 4],
  [/\bprep\b/i, 5],
];
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

// Sort rank of a class name; null when it can't be placed (custom names).
export const classRank = (name: string): number | null => {
  const digits = name.match(/\d+/);
  if (digits && !/kg/i.test(name)) return 100 + Number(digits[0]);
  const roman = name.toUpperCase().match(/\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/);
  if (roman && /class|grade|std|standard/i.test(name)) return 100 + ROMAN[roman[1]];
  for (const [re, rank] of PRE_PRIMARY) if (re.test(name)) return rank;
  if (digits) return 100 + Number(digits[0]);
  return null;
};

const byClassOrder = (a: { className: string; section: string }, b: { className: string; section: string }) => {
  const ra = classRank(a.className) ?? 999;
  const rb = classRank(b.className) ?? 999;
  return ra - rb || a.className.localeCompare(b.className) || a.section.localeCompare(b.section);
};

const roundTo = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : Math.round(n * 100) / 100);

const getSessionPair = async (fromSessionId: number, toSessionId: number) => {
  if (!fromSessionId || !toSessionId) throw httpError(400, "Choose both the previous and the new session.");
  if (fromSessionId === toSessionId) throw httpError(400, "The new session must be different from the previous one.");
  const [from, to] = await Promise.all([
    prisma.academicSession.findUnique({ where: { id: fromSessionId } }),
    prisma.academicSession.findUnique({ where: { id: toSessionId } }),
  ]);
  if (!from || !to) throw httpError(404, "Academic session not found.");
  return { from, to };
};

// ---------- Overview (wizard checklist) ----------

export const getRolloverOverview = async (fromSessionId: number, toSessionId: number) => {
  const { from, to } = await getSessionPair(fromSessionId, toSessionId);
  const sessionCounts = async (sessionId: number) => {
    const [classes, subjects, allocations, slots, feeStructures, lateFeeRules, students] = await Promise.all([
      prisma.classSection.count({ where: { sessionId } }),
      prisma.subject.count({ where: { classSection: { sessionId } } }),
      prisma.teacherSubject.count({ where: { subject: { classSection: { sessionId } } } }),
      prisma.timetableSlot.count({ where: { classSection: { sessionId } } }),
      prisma.feeStructure.count({ where: { sessionId } }),
      prisma.lateFeeRule.count({ where: { sessionId } }),
      prisma.student.count({ where: { isActive: true, classSection: { sessionId } } }),
    ]);
    return { classes, subjects, allocations, slots, feeStructures, lateFeeRules, students };
  };
  const [fromCounts, toCounts, examsInFrom] = await Promise.all([
    sessionCounts(from.id),
    sessionCounts(to.id),
    prisma.exam.count({ where: { sessionId: from.id } }),
  ]);
  return { from, to, fromCounts, toCounts, examsInFrom };
};

// ---------- Step 1: copy the setup ----------

export interface CopySetupInput {
  fromSessionId: number;
  toSessionId: number;
  classTeachers?: boolean;
  subjects?: boolean;
  teacherAllocations?: boolean;
  timetable?: boolean;
  feeStructures?: boolean;
  lateFeeRule?: boolean;
  feeIncreasePercent?: number;
  roundFeesTo?: number; // 0 = paise, 1, 10, 50, 100
}

export const copySessionSetup = async (input: CopySetupInput) => {
  const { from, to } = await getSessionPair(Number(input.fromSessionId), Number(input.toSessionId));
  const pct = Number(input.feeIncreasePercent ?? 0);
  if (!Number.isFinite(pct) || pct < -50 || pct > 100) throw httpError(400, "Fee change must be between -50% and 100%.");
  const step = [0, 1, 10, 50, 100].includes(Number(input.roundFeesTo)) ? Number(input.roundFeesTo) : 1;
  const opt = {
    classTeachers: input.classTeachers !== false,
    subjects: input.subjects !== false,
    teacherAllocations: input.teacherAllocations !== false && input.subjects !== false,
    timetable: input.timetable !== false,
    feeStructures: input.feeStructures !== false,
    lateFeeRule: input.lateFeeRule !== false,
  };

  const activeStaff = new Set(
    (await prisma.staff.findMany({ where: { isActive: true }, select: { id: true } })).map((s: any) => s.id)
  );
  const fromClasses = await prisma.classSection.findMany({
    where: { sessionId: from.id },
    include: { subjects: { include: { teacherSubjects: true } }, timetableSlots: true },
  });

  const counts = { classesCreated: 0, classesExisting: 0, classTeachers: 0, subjects: 0, allocations: 0, timetableSlots: 0, timetableSkipped: 0, feeStructures: 0, feeStructuresSkipped: 0, lateFeeRule: false };
  const classMap = new Map<number, number>(); // old class id -> new class id

  // One transaction per class keeps each well inside the interactive-transaction timeout.
  for (const fc of fromClasses.sort(byClassOrder)) {
    await prisma.$transaction(async (tx: any) => {
      let target = await tx.classSection.findUnique({
        where: { sessionId_className_section: { sessionId: to.id, className: fc.className, section: fc.section } },
        include: { _count: { select: { timetableSlots: true } } },
      });
      const teacherId = opt.classTeachers && fc.classTeacherId && activeStaff.has(fc.classTeacherId) ? fc.classTeacherId : null;
      if (!target) {
        target = await tx.classSection.create({
          data: { sessionId: to.id, className: fc.className, section: fc.section, classTeacherId: teacherId },
          include: { _count: { select: { timetableSlots: true } } },
        });
        counts.classesCreated++;
        if (teacherId) counts.classTeachers++;
      } else {
        counts.classesExisting++;
        if (teacherId && !target.classTeacherId) {
          await tx.classSection.update({ where: { id: target.id }, data: { classTeacherId: teacherId } });
          counts.classTeachers++;
        }
      }
      classMap.set(fc.id, target.id);

      const subjectMap = new Map<number, number>();
      if (opt.subjects) {
        for (const subj of fc.subjects) {
          const existing = await tx.subject.findUnique({ where: { classSectionId_name: { classSectionId: target.id, name: subj.name } } });
          const ns = existing ?? (await tx.subject.create({ data: { classSectionId: target.id, name: subj.name } }));
          if (!existing) counts.subjects++;
          subjectMap.set(subj.id, ns.id);
          if (opt.teacherAllocations) {
            const rows = subj.teacherSubjects.filter((t: any) => activeStaff.has(t.staffId)).map((t: any) => ({ staffId: t.staffId, subjectId: ns.id }));
            if (rows.length) counts.allocations += (await tx.teacherSubject.createMany({ data: rows, skipDuplicates: true })).count;
          }
        }
      }

      if (opt.timetable && fc.timetableSlots.length) {
        if (target._count.timetableSlots > 0) counts.timetableSkipped++;
        else {
          const slots = fc.timetableSlots.map((sl: any) => ({
            classSectionId: target.id,
            dayOfWeek: sl.dayOfWeek,
            periodNumber: sl.periodNumber,
            subjectId: sl.subjectId ? subjectMap.get(sl.subjectId) ?? null : null,
            staffId: sl.staffId && activeStaff.has(sl.staffId) ? sl.staffId : null,
            room: sl.room,
          }));
          counts.timetableSlots += (await tx.timetableSlot.createMany({ data: slots, skipDuplicates: true })).count;
        }
      }
    }, TX);
  }

  if (opt.feeStructures) {
    const structures = await prisma.feeStructure.findMany({ where: { sessionId: from.id }, include: { items: true } });
    const existing = await prisma.feeStructure.findMany({ where: { sessionId: to.id }, select: { classSectionId: true, name: true } });
    for (const st of structures) {
      const targetClassId = st.classSectionId ? classMap.get(st.classSectionId) ?? null : null;
      if (st.classSectionId && !targetClassId) continue; // its class wasn't copied
      const clash = existing.some((e: any) => (targetClassId ? e.classSectionId === targetClassId : e.classSectionId === null && e.name === st.name));
      if (clash) {
        counts.feeStructuresSkipped++;
        continue;
      }
      await prisma.feeStructure.create({
        data: {
          sessionId: to.id,
          classSectionId: targetClassId,
          name: st.name,
          description: st.description,
          items: {
            create: st.items.map((it: any) => ({
              feeHeadId: it.feeHeadId,
              amount: roundTo(Number(it.amount) * (1 + pct / 100), step),
              frequency: it.frequency,
              applicableMonths: it.applicableMonths,
              dueDateDay: it.dueDateDay,
              allowPartialPayment: it.allowPartialPayment,
              effectiveFrom: to.startDate,
            })),
          },
        },
      });
      existing.push({ classSectionId: targetClassId, name: st.name });
      counts.feeStructures++;
    }
  }

  if (opt.lateFeeRule && (await prisma.lateFeeRule.count({ where: { sessionId: to.id } })) === 0) {
    const rule = await prisma.lateFeeRule.findFirst({ where: { sessionId: from.id }, orderBy: { id: "desc" } });
    if (rule) {
      await prisma.lateFeeRule.create({
        data: { sessionId: to.id, gracePeriodDays: rule.gracePeriodDays, feeType: rule.feeType, amount: rule.amount, slabsJson: rule.slabsJson },
      });
      counts.lateFeeRule = true;
    }
  }

  return counts;
};

// ---------- Step 2: promotion plan ----------

export type PromotionAction = "PROMOTE" | "DETAIN" | "PASSED_OUT" | "LEFT";

export const getPromotionPlan = async (fromSessionId: number, toSessionId: number) => {
  const { from, to } = await getSessionPair(fromSessionId, toSessionId);
  const [fromClasses, toClasses] = await Promise.all([
    prisma.classSection.findMany({
      where: { sessionId: from.id },
      include: {
        students: { where: { isActive: true }, select: { id: true, name: true, admissionNo: true, rollNo: true }, orderBy: { name: "asc" } },
      },
    }),
    prisma.classSection.findMany({ where: { sessionId: to.id }, include: { _count: { select: { students: true } } } }),
  ]);
  fromClasses.sort(byClassOrder);
  toClasses.sort(byClassOrder);

  const maxFromRank = Math.max(...fromClasses.map((c: any) => classRank(c.className) ?? -1), -1);
  const pick = (className: string | undefined, section: string) => {
    if (!className) return null;
    const same = toClasses.filter((c: any) => c.className === className);
    return same.find((c: any) => c.section === section) ?? same[0] ?? null;
  };
  const nextClassName = (className: string) => {
    const rank = classRank(className);
    if (rank === null) return undefined;
    const above = toClasses.filter((c: any) => (classRank(c.className) ?? -1) > rank).sort(byClassOrder);
    return above[0]?.className;
  };

  // Already-moved students (re-runs) — counted so the wizard can show progress.
  const promotedAlready = await prisma.studentEnrollment.groupBy({
    by: ["outcome"],
    where: { sessionId: from.id, outcome: { not: null } },
    _count: { _all: true },
  });

  return {
    from,
    to,
    toClasses: toClasses.map((c: any) => ({ id: c.id, className: c.className, section: c.section, students: c._count.students })),
    processed: Object.fromEntries(promotedAlready.map((r: any) => [r.outcome, r._count._all])),
    classes: fromClasses.map((c: any) => {
      const next = nextClassName(c.className);
      const promoteTo = pick(next, c.section);
      const detainTo = pick(c.className, c.section);
      const rank = classRank(c.className);
      const isFinalClass = !promoteTo && rank !== null && rank >= maxFromRank;
      return {
        id: c.id,
        className: c.className,
        section: c.section,
        students: c.students,
        suggestedPromoteToId: promoteTo?.id ?? null,
        suggestedDetainToId: detainTo?.id ?? null,
        isFinalClass,
        defaultAction: (isFinalClass ? "PASSED_OUT" : "PROMOTE") as PromotionAction,
      };
    }),
  };
};

// ---------- Step 2: execute promotion ----------

export interface PromotionDecision {
  studentId: number;
  action: PromotionAction;
  toClassSectionId?: number | null;
  remarks?: string;
}

export interface PromotionInput {
  fromSessionId: number;
  toSessionId: number;
  rollNumbering?: "ALPHABETICAL" | "KEEP";
  decisions: PromotionDecision[];
}

const OUTCOME: Record<PromotionAction, "PROMOTED" | "DETAINED" | "PASSED_OUT" | "LEFT"> = {
  PROMOTE: "PROMOTED",
  DETAIN: "DETAINED",
  PASSED_OUT: "PASSED_OUT",
  LEFT: "LEFT",
};

// Gives every student in the class a roll number: alphabetical 1..n, or (KEEP) moved
// students keep their old number when it's free and the rest get the next numbers.
const assignRollNumbers = async (tx: any, classSectionId: number, mode: "ALPHABETICAL" | "KEEP", wanted: Map<number, string>) => {
  const students = await tx.student.findMany({ where: { classSectionId }, select: { id: true, name: true, rollNo: true }, orderBy: { name: "asc" } });
  const finalRoll = new Map<number, string>();
  if (mode === "ALPHABETICAL") {
    const active = students; // everyone in the class, so numbering has no gaps
    active.forEach((s: any, i: number) => finalRoll.set(s.id, String(i + 1)));
  } else {
    const taken = new Set<string>();
    for (const s of students) if (!wanted.has(s.id) && !String(s.rollNo).startsWith("TMP-")) taken.add(String(s.rollNo));
    for (const s of students) if (!wanted.has(s.id) && !String(s.rollNo).startsWith("TMP-")) finalRoll.set(s.id, String(s.rollNo));
    let next = Math.max(0, ...[...taken].map((r) => Number(r)).filter((n) => Number.isFinite(n))) + 1;
    for (const s of students) {
      if (finalRoll.has(s.id)) continue;
      const w = wanted.get(s.id);
      if (w && !taken.has(w)) {
        finalRoll.set(s.id, w);
        taken.add(w);
      } else {
        while (taken.has(String(next))) next++;
        finalRoll.set(s.id, String(next));
        taken.add(String(next++));
      }
    }
  }
  // Two passes so the (classSectionId, rollNo) unique index never sees a duplicate.
  for (const s of students) await tx.student.update({ where: { id: s.id }, data: { rollNo: `TMP-${s.id}` } });
  for (const s of students) await tx.student.update({ where: { id: s.id }, data: { rollNo: finalRoll.get(s.id)! } });
  return finalRoll;
};

export const promoteStudents = async (input: PromotionInput) => {
  const { from, to } = await getSessionPair(Number(input.fromSessionId), Number(input.toSessionId));
  const mode = input.rollNumbering === "KEEP" ? "KEEP" : "ALPHABETICAL";
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  if (decisions.length === 0) throw httpError(400, "No students selected.");

  const toClassIds = new Set((await prisma.classSection.findMany({ where: { sessionId: to.id }, select: { id: true } })).map((c: any) => c.id));
  for (const d of decisions) {
    if (!OUTCOME[d.action]) throw httpError(400, `Unknown action "${d.action}".`);
    if ((d.action === "PROMOTE" || d.action === "DETAIN") && !toClassIds.has(Number(d.toClassSectionId))) {
      throw httpError(400, `Choose a ${to.name} class for every student being promoted or detained.`);
    }
  }

  const students = await prisma.student.findMany({
    where: { id: { in: decisions.map((d) => Number(d.studentId)) } },
    select: { id: true, rollNo: true, classSectionId: true, isActive: true, classSection: { select: { sessionId: true } } },
  });
  const byId = new Map(students.map((s: any) => [s.id, s]));

  // Group by the student's current class — one transaction per class.
  const groups = new Map<number, PromotionDecision[]>();
  const skipped: number[] = [];
  for (const d of decisions) {
    const s: any = byId.get(Number(d.studentId));
    if (!s || !s.isActive || s.classSection?.sessionId !== from.id) {
      skipped.push(Number(d.studentId)); // already moved, inactive, or not in the previous session
      continue;
    }
    groups.set(s.classSectionId, [...(groups.get(s.classSectionId) ?? []), d]);
  }

  const result = { promoted: 0, detained: 0, passedOut: 0, left: 0, skipped: skipped.length };
  const leaveDate = new Date(Math.min(Date.now(), new Date(from.endDate).getTime()));

  for (const [, group] of groups) {
    await prisma.$transaction(async (tx: any) => {
      const targets = new Map<number, Map<number, string>>(); // class -> (student -> wanted roll)
      for (const d of group) {
        const s: any = byId.get(Number(d.studentId));
        const remarks = d.remarks?.toString().trim().slice(0, 300) || null;
        await tx.studentEnrollment.upsert({
          where: { studentId_sessionId: { studentId: s.id, sessionId: from.id } },
          update: { classSectionId: s.classSectionId, rollNo: s.rollNo, outcome: OUTCOME[d.action], remarks },
          create: { studentId: s.id, sessionId: from.id, classSectionId: s.classSectionId, rollNo: s.rollNo, outcome: OUTCOME[d.action], remarks },
        });
        if (d.action === "PROMOTE" || d.action === "DETAIN") {
          const toId = Number(d.toClassSectionId);
          await tx.student.update({ where: { id: s.id }, data: { classSectionId: toId, rollNo: `TMP-${s.id}` } });
          if (!targets.has(toId)) targets.set(toId, new Map());
          targets.get(toId)!.set(s.id, String(s.rollNo));
          if (d.action === "PROMOTE") result.promoted++;
          else result.detained++;
        } else {
          // Leavers stay in their last class as history; no further billing or transport.
          await tx.student.update({ where: { id: s.id }, data: { isActive: false } });
          await tx.studentTransportAssignment.updateMany({
            where: { studentId: s.id, status: "ACTIVE" },
            data: { status: "DISCONTINUED", endDate: leaveDate, discontinuedAt: leaveDate, discontinueReason: d.action === "PASSED_OUT" ? "Passed out" : "Left school" },
          });
          if (d.action === "PASSED_OUT") result.passedOut++;
          else result.left++;
        }
      }
      for (const [classId, wanted] of targets) {
        const rolls = await assignRollNumbers(tx, classId, mode, wanted);
        for (const [studentId, rollNo] of rolls) {
          await tx.studentEnrollment.upsert({
            where: { studentId_sessionId: { studentId, sessionId: to.id } },
            update: { classSectionId: classId, rollNo },
            create: { studentId, sessionId: to.id, classSectionId: classId, rollNo },
          });
        }
      }
    }, { timeout: 300_000, maxWait: 20_000 });
  }

  return result;
};

// Students still sitting in a session's classes (not yet promoted) — shown before switching.
export const countPendingPromotion = (sessionId: number) =>
  prisma.student.count({ where: { isActive: true, classSection: { sessionId } } });
