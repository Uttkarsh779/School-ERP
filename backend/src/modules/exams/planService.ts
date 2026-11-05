import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";
import { isTeacherAssignedToSubject } from "../subjects/service";
import { assertCoordinator, isCoordinator } from "./permissions";
import { schemeForClass } from "./schemeService";
import { assertExamTermOpen } from "./resultService";

// Exam planning. The exam coordinator sets up a term exam or periodic test once for many
// classes (one Exam row per class, sharing groupKey), with max marks per subject. Subject
// teachers create their own class tests (progress only). The class teacher confirms when all
// marks are in ("ready") before the coordinator locks and the Principal publishes.

type Actor = { id: number; role: string };
export const EXAM_TYPES = ["TERM_EXAM", "PERIODIC_TEST", "CLASS_TEST"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
const DEFAULT_PT_MAX = 20;

const deadlineOf = (v: unknown) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw httpError(400, "Pick a valid marks deadline");
  return new Date(`${s}T23:59:59+05:30`); // end of that day, India time
};

// Every exam of the session grouped as the coordinator planned them (class tests excluded).
export const listPlan = async (actor: Actor, sessionId?: number) => {
  await assertCoordinator(actor);
  const session = sessionId ?? (await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id;
  const exams = await prisma.exam.findMany({
    where: { sessionId: session, type: { not: "CLASS_TEST" } },
    include: {
      classSection: { select: { id: true, className: true, section: true } },
      _count: { select: { results: true } },
    },
    orderBy: [{ term: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const groups = new Map<string, any>();
  for (const e of exams) {
    const key = e.groupKey ?? `single:${e.id}`;
    if (!groups.has(key))
      groups.set(key, { groupKey: key, name: e.name, type: e.type, term: e.term, admitCard: e.admitCard, marksDeadline: e.marksDeadline, exams: [] as any[] });
    groups.get(key).exams.push({
      id: e.id,
      classSectionId: e.classSectionId,
      className: e.classSection.className,
      section: e.classSection.section,
      isLocked: e.isLocked,
      resultsPublished: e.resultsPublished,
      readyAt: e.readyAt,
      marksCount: e._count.results,
      hasDateSheet: Array.isArray((e.dateSheet as any)?.entries) && (e.dateSheet as any).entries.length > 0,
    });
  }
  return [...groups.values()];
};

// Max marks per subject for a new exam: the scheme's exam marks for a term exam, 20 for a
// periodic test (each subject teacher can change their own).
const seedSubjects = async (tx: any, examId: number, classSectionId: number, className: string, type: ExamType) => {
  const scheme = await schemeForClass(className);
  const subjects = await tx.subject.findMany({ where: { classSectionId }, select: { id: true } });
  const maxMarks = type === "TERM_EXAM" ? scheme.examMax : DEFAULT_PT_MAX;
  if (subjects.length) await tx.examSubject.createMany({ data: subjects.map((s: { id: number }) => ({ examId, subjectId: s.id, maxMarks })), skipDuplicates: true });
};

const classText = (c: { className: string; section: string }) => `${c.className}-${c.section}`;

// The term result reads one term exam per term (the "80"), so a second one in the same term
// would silently merge with the first.
const assertTermExamFree = async (classSectionIds: number[], term: number, exceptGroup?: string) => {
  const taken = await prisma.exam.findMany({
    where: { classSectionId: { in: classSectionIds }, type: "TERM_EXAM", term, ...(exceptGroup ? { NOT: { groupKey: exceptGroup } } : {}) },
    select: { name: true, classSection: { select: { className: true, section: true } } },
  });
  if (taken.length) throw httpError(409, `Term ${term} already has a term exam: ${taken.map((e) => `${e.name} (${classText(e.classSection)})`).join(", ")}`);
};

const assertNameFree = async (classSectionIds: number[], name: string, exceptGroup?: string) => {
  const clash = await prisma.exam.findMany({
    where: { classSectionId: { in: classSectionIds }, name: { equals: name, mode: "insensitive" }, ...(exceptGroup ? { NOT: { groupKey: exceptGroup } } : {}) },
    select: { classSection: { select: { className: true, section: true } } },
  });
  if (clash.length) throw httpError(409, `"${name}" already exists for ${clash.map((c) => classText(c.classSection)).join(", ")}`);
};

export const createPlannedExam = async (actor: Actor, body: any) => {
  await assertCoordinator(actor);
  const name = String(body?.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw httpError(400, "Enter the exam name");
  const type: ExamType = body?.type === "PERIODIC_TEST" ? "PERIODIC_TEST" : "TERM_EXAM";
  const term = Number(body?.term) === 2 ? 2 : 1;
  const ids: number[] = [...new Set<number>((Array.isArray(body?.classSectionIds) ? body.classSectionIds : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw httpError(400, "Pick at least one class");
  const classes = await prisma.classSection.findMany({ where: { id: { in: ids } }, select: { id: true, className: true, section: true, sessionId: true } });
  if (classes.length !== ids.length) throw httpError(404, "A selected class wasn't found");
  if (new Set(classes.map((c) => c.sessionId)).size > 1) throw httpError(400, "Pick classes from one session");
  await assertNameFree(ids, name);
  if (type === "TERM_EXAM") await assertTermExamFree(ids, term);

  const groupKey = randomUUID();
  const admitCard = typeof body?.admitCard === "boolean" ? body.admitCard : type === "TERM_EXAM";
  const marksDeadline = deadlineOf(body?.marksDeadline) ?? null;
  await prisma.$transaction(async (tx: any) => {
    for (const c of classes) {
      const exam = await tx.exam.create({
        data: { sessionId: c.sessionId, classSectionId: c.id, name, type, term, admitCard, marksDeadline, groupKey, createdByUserId: actor.id },
      });
      await seedSubjects(tx, exam.id, c.id, c.className, type);
    }
  });
  return { groupKey, created: classes.length };
};

// Change a planned exam for all its classes, or add more classes to it.
export const updatePlannedExam = async (actor: Actor, groupKey: string, body: any) => {
  await assertCoordinator(actor);
  const exams = await prisma.exam.findMany({ where: { groupKey }, include: { classSection: { select: { className: true } } } });
  if (!exams.length) throw httpError(404, "Exam not found");
  const data: Record<string, unknown> = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 80) throw httpError(400, "Enter the exam name");
    data.name = name;
  }
  if (body?.term !== undefined) data.term = Number(body.term) === 2 ? 2 : 1;
  if (typeof body?.admitCard === "boolean") data.admitCard = body.admitCard;
  const deadline = deadlineOf(body?.marksDeadline);
  if (deadline !== undefined) data.marksDeadline = deadline;

  const ownClasses = exams.map((e) => e.classSectionId);
  if (data.name && String(data.name).toLowerCase() !== exams[0].name.toLowerCase()) await assertNameFree(ownClasses, String(data.name), groupKey);
  // Moving an exam to another term moves its marks with it, so results must be still open.
  if (data.term !== undefined && data.term !== exams[0].term) {
    if (exams.some((e) => e.resultsPublished)) throw httpError(409, "Some classes have published marks for this exam. Unpublish them before changing its term.");
    for (const e of exams) await assertExamTermOpen(e);
    if (exams[0].type === "TERM_EXAM") await assertTermExamFree(ownClasses, data.term as number, groupKey);
  }

  const first = { ...exams[0], ...data } as any;
  const add: number[] = [...new Set<number>((Array.isArray(body?.addClassSectionIds) ? body.addClassSectionIds : []).map(Number))].filter((id) => !ownClasses.includes(id));
  const classes = add.length ? await prisma.classSection.findMany({ where: { id: { in: add }, sessionId: first.sessionId }, select: { id: true, className: true } }) : [];
  if (classes.length !== add.length) throw httpError(400, "Add classes from this exam's session only");
  if (classes.length) {
    await assertNameFree(add, first.name);
    if (first.type === "TERM_EXAM") await assertTermExamFree(add, first.term);
  }

  if (Object.keys(data).length) await prisma.exam.updateMany({ where: { groupKey }, data });
  if (classes.length) {
    await prisma.$transaction(async (tx: any) => {
      for (const c of classes) {
        const exam = await tx.exam.create({
          data: {
            sessionId: first.sessionId, classSectionId: c.id, name: first.name, type: first.type, term: first.term,
            admitCard: first.admitCard, marksDeadline: first.marksDeadline, groupKey, createdByUserId: actor.id,
          },
        });
        await seedSubjects(tx, exam.id, c.id, c.className, first.type);
      }
    });
  }
  return { updated: exams.length, added: classes.length };
};

// An exam for one class can be removed while no marks have been entered.
export const deleteExam = async (actor: Actor, examId: number) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { _count: { select: { results: true } } } });
  if (!exam) throw httpError(404, "Exam not found");
  if (exam.type === "CLASS_TEST") {
    const staff = await findStaffByUserId(actor.id);
    if (!(exam.createdByUserId === actor.id || (staff && exam.subjectId && (await isTeacherAssignedToSubject(staff.id, exam.subjectId))) || (await isCoordinator(actor))))
      throw httpError(403, "Only the subject teacher can delete this class test");
  } else await assertCoordinator(actor);
  if (exam.resultsPublished) throw httpError(409, "This exam's marks are published, so it can't be deleted");
  if (exam._count.results > 0 && exam.type !== "CLASS_TEST") throw httpError(409, "Marks have already been entered for this exam, so it can't be deleted");
  await prisma.$transaction([
    prisma.examResultAudit.deleteMany({ where: { examId } }),
    prisma.examResult.deleteMany({ where: { examId } }),
    prisma.examStudentRemark.deleteMany({ where: { examId } }),
    prisma.exam.delete({ where: { id: examId } }),
  ]);
};

// Subjects of an exam with their max marks. canEdit: the coordinator for any subject; a
// subject teacher for their own subject in a periodic test or class test (they decide its marks).
export interface ExamSubjectRow {
  subjectId: number;
  name: string;
  maxMarks: number | null;
  canEdit: boolean;
}

export const getExamSubjects = async (actor: Actor, examId: number): Promise<ExamSubjectRow[]> => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  const [subjects, set, coordinator, staff] = await Promise.all([
    prisma.subject.findMany({ where: { classSectionId: exam.classSectionId, ...(exam.subjectId ? { id: exam.subjectId } : {}) }, orderBy: { name: "asc" } }),
    prisma.examSubject.findMany({ where: { examId } }),
    isCoordinator(actor),
    actor.role === "TEACHER" ? findStaffByUserId(actor.id) : null,
  ]);
  const max = new Map(set.map((s) => [s.subjectId, s.maxMarks] as const));
  const mine = staff ? new Set((await prisma.teacherSubject.findMany({ where: { staffId: staff.id }, select: { subjectId: true } })).map((t) => t.subjectId)) : new Set<number>();
  return subjects.map((s) => ({
    subjectId: s.id,
    name: s.name,
    maxMarks: max.get(s.id) ?? null, // null: no paper in this exam
    canEdit: !exam.resultsPublished && !exam.isLocked && (coordinator || (exam.type !== "TERM_EXAM" && mine.has(s.id))),
  }));
};

export const saveExamSubjects = async (actor: Actor, examId: number, rows: unknown) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  if (exam.resultsPublished) throw httpError(409, "Results are published; unpublish first to change max marks");
  if (exam.isLocked) throw httpError(409, "Marks are locked; unlock the exam first to change max marks");
  await assertExamTermOpen(exam);
  if (!Array.isArray(rows)) throw httpError(400, "subjects must be a list");
  const allowed = new Map((await getExamSubjects(actor, examId)).map((s) => [s.subjectId, s] as const));
  // Check everything first so a bad row doesn't leave some subjects changed and others not.
  const writes: any[] = [];
  for (const r of rows as any[]) {
    const subjectId = Number(r?.subjectId);
    const s = allowed.get(subjectId);
    if (!s) throw httpError(400, "A subject isn't part of this class");
    if (!s.canEdit) throw httpError(403, `You can't change the marks for ${s.name}`);
    if (r.maxMarks === null || r.maxMarks === "") {
      if (await prisma.examResult.count({ where: { examId, subjectId } })) throw httpError(409, `${s.name} already has marks, so it can't be removed from the exam`);
      writes.push(prisma.examSubject.deleteMany({ where: { examId, subjectId } }));
      continue;
    }
    const maxMarks = Number(r.maxMarks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 500) throw httpError(400, `Max marks for ${s.name} must be between 1 and 500`);
    const over = await prisma.examResult.findFirst({ where: { examId, subjectId, marksObtained: { gt: maxMarks } } });
    if (over) throw httpError(409, `${s.name}: a student already has ${over.marksObtained}, more than ${maxMarks}`);
    writes.push(
      prisma.examSubject.upsert({ where: { examId_subjectId: { examId, subjectId } }, create: { examId, subjectId, maxMarks }, update: { maxMarks } }),
      prisma.examResult.updateMany({ where: { examId, subjectId }, data: { maxMarks } })
    );
  }
  await prisma.$transaction(writes);
  return getExamSubjects(actor, examId);
};

const lowerName = (s: { name: string }) => s.name.trim().toLowerCase();

// The other classes of a planned exam that can still take changes.
export const openSiblings = (exam: { id: number; groupKey: string | null }) =>
  exam.groupKey ? prisma.exam.findMany({ where: { groupKey: exam.groupKey, id: { not: exam.id }, isLocked: false, resultsPublished: false } }) : Promise.resolve([]);

// Coordinator: use this class's max marks for every other class of the exam. Subjects match by
// name (each class has its own subject rows); a class that has marks above the new max keeps
// what it had, and is reported.
export const copyExamSubjects = async (actor: Actor, examId: number) => {
  await assertCoordinator(actor);
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { subjects: { include: { subject: { select: { name: true } } } } } });
  if (!exam) throw httpError(404, "Exam not found");
  const maxByName = new Map(exam.subjects.map((s) => [lowerName(s.subject), s.maxMarks] as const));
  const siblings = await openSiblings(exam);
  const skipped: string[] = [];
  for (const sibling of siblings) {
    const [own, cs] = await Promise.all([
      prisma.subject.findMany({ where: { classSectionId: sibling.classSectionId }, select: { id: true, name: true } }),
      prisma.classSection.findUnique({ where: { id: sibling.classSectionId }, select: { className: true, section: true } }),
    ]);
    const writes: any[] = [];
    for (const s of own) {
      const maxMarks = maxByName.get(lowerName(s));
      if (maxMarks === undefined) continue;
      const over = await prisma.examResult.findFirst({ where: { examId: sibling.id, subjectId: s.id, marksObtained: { gt: maxMarks } }, select: { id: true } });
      if (over) {
        skipped.push(`${s.name} (${cs ? classText(cs) : sibling.classSectionId})`);
        continue;
      }
      writes.push(
        prisma.examSubject.upsert({ where: { examId_subjectId: { examId: sibling.id, subjectId: s.id } }, create: { examId: sibling.id, subjectId: s.id, maxMarks }, update: { maxMarks } }),
        prisma.examResult.updateMany({ where: { examId: sibling.id, subjectId: s.id }, data: { maxMarks } })
      );
    }
    if (writes.length) await prisma.$transaction(writes);
  }
  return { classes: siblings.length, skipped };
};

// A subject teacher's own test for one subject and class: progress only, marks visible at once.
export const createClassTest = async (actor: Actor, body: any) => {
  const classSectionId = Number(body?.classSectionId);
  const subjectId = Number(body?.subjectId);
  const name = String(body?.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw httpError(400, "Enter a name for the test");
  const maxMarks = Number(body?.maxMarks);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 500) throw httpError(400, "Max marks must be between 1 and 500");
  const testDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.testDate ?? "")) ? new Date(`${body.testDate}T00:00:00Z`) : null;
  if (!testDate) throw httpError(400, "Pick the test date");
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, include: { classSection: { select: { id: true, sessionId: true } } } });
  if (!subject || subject.classSectionId !== classSectionId) throw httpError(400, "That subject isn't taught in this class");
  const staff = actor.role === "TEACHER" ? await findStaffByUserId(actor.id) : null;
  if (!staff || !(await isTeacherAssignedToSubject(staff.id, subjectId))) throw httpError(403, "Only the subject's teacher can create a class test");
  const exam = await prisma.exam.create({
    data: {
      sessionId: subject.classSection.sessionId, classSectionId, name, type: "CLASS_TEST", term: Number(body?.term) === 2 ? 2 : 1,
      subjectId, testDate, createdByUserId: actor.id, groupKey: randomUUID(),
      subjects: { create: [{ subjectId, maxMarks }] },
    },
  });
  return exam;
};

// Class teacher: all marks are in for this exam (or take it back).
export const setExamReady = async (actor: Actor, examId: number, ready: boolean) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  const staff = actor.role === "TEACHER" ? await findStaffByUserId(actor.id) : null;
  if (!staff || !(await isClassTeacherOfSection(staff.id, exam.classSectionId))) throw httpError(403, "Only the class teacher can mark the class ready");
  if (exam.isLocked) throw httpError(409, "Marks are already locked");
  if (exam.type === "CLASS_TEST") throw httpError(400, "Class tests don't need this step");
  if (ready) {
    const [papers, students, counts] = await Promise.all([
      prisma.examSubject.findMany({ where: { examId }, include: { subject: { select: { name: true } } } }),
      prisma.student.count({ where: { classSectionId: exam.classSectionId, isActive: true } }),
      prisma.examResult.groupBy({ by: ["subjectId"], where: { examId, student: { classSectionId: exam.classSectionId, isActive: true } }, _count: { _all: true } }),
    ]);
    const entered = new Map<number, number>(counts.map((c: any) => [c.subjectId, c._count._all]));
    const short = papers.filter((p) => (entered.get(p.subjectId) ?? 0) < students);
    if (short.length) throw httpError(409, `Marks are still missing in ${short.map((p) => `${p.subject.name} (${students - (entered.get(p.subjectId) ?? 0)})`).join(", ")}`);
  }
  return prisma.exam.update({ where: { id: examId }, data: ready ? { readyAt: new Date(), readyByUserId: actor.id } : { readyAt: null, readyByUserId: null } });
};
