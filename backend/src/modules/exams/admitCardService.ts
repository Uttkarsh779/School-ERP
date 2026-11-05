import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { getDefaultersReport } from "../fees/ledgerService";
import { getExamSettings } from "./schemeService";
import { onDateSheetChanged, onDateSheetPublished } from "../notifications/events";
import { offDays } from "../calendar/service";
import { assertCoordinator } from "./permissions";
import { openSiblings } from "./planService";

// Exam admit cards: the exam's date sheet (date and time of each subject's paper, plus
// instructions for students) is saved on the exam, and printed on one admit card per
// student of the class (prisma/exam_date_sheet.sql).

export interface DateSheetEntry {
  subjectId: number;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface DateSheet {
  entries: DateSheetEntry[];
  instructions: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const parseDateSheet = (body: any, subjectIds: number[], names: Map<number, string> = new Map()): DateSheet => {
  const nameOf = (id: number) => names.get(id) ?? "A subject";
  if (!Array.isArray(body?.entries)) throw httpError(400, "entries must be a list");
  const entries: DateSheetEntry[] = [];
  const seen = new Set<number>();
  for (const e of body.entries) {
    const subjectId = Number(e?.subjectId);
    if (!subjectIds.includes(subjectId)) throw httpError(400, "A subject in the date sheet isn't taught in this class");
    if (seen.has(subjectId)) throw httpError(400, "Each subject can appear only once");
    seen.add(subjectId);
    const date = String(e?.date ?? "");
    const start = String(e?.start ?? "");
    const end = String(e?.end ?? "");
    if (!date && !start && !end) continue; // subject without a paper in this exam
    if (!DATE_RE.test(date)) throw httpError(400, `${nameOf(subjectId)}: pick a date, or leave its row empty if there's no paper`);
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) throw httpError(400, `${nameOf(subjectId)}: enter the start and end time`);
    if (end <= start) throw httpError(400, `${nameOf(subjectId)}: the paper must end after it starts`);
    entries.push({ subjectId, date, start, end });
  }
  entries.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  // A student sits every paper of the class, so two can't run at once.
  for (let i = 1; i < entries.length; i++) {
    const [a, b] = [entries[i - 1], entries[i]];
    if (a.date === b.date && b.start < a.end) throw httpError(400, `${nameOf(a.subjectId)} and ${nameOf(b.subjectId)} overlap on ${a.date}`);
  }
  const instructions = typeof body?.instructions === "string" && body.instructions.trim() ? body.instructions.trim().slice(0, 2000) : null;
  return { entries, instructions };
};

// Papers set on a Sunday, a weekly off or a holiday: allowed (schools do sometimes), but the
// coordinator should see it.
const dayOffWarnings = async (entries: DateSheetEntry[]) => {
  if (!entries.length) return [];
  const dates = entries.map((e) => e.date).sort();
  const off = await offDays(new Date(`${dates[0]}T00:00:00.000Z`), new Date(`${dates[dates.length - 1]}T00:00:00.000Z`), "STUDENTS");
  return [...new Set(dates)].filter((d) => off.has(d)).map((d) => `${d} is a day off (${off.get(d)})`);
};

// Students hear about a new date sheet, and about any change to one they've already seen.
const announce = (examId: number, before: DateSheet | null, after: DateSheet) => {
  const key = (s: DateSheet | null) => JSON.stringify(s?.entries ?? []);
  if (!(before?.entries ?? []).length) {
    if (after.entries.length) onDateSheetPublished(examId);
  } else if (key(before) !== key(after)) onDateSheetChanged(examId);
};

export const saveDateSheet = async (examId: number, body: unknown) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { classSectionId: true, dateSheet: true } });
  if (!exam) throw httpError(404, "Exam not found");
  const subjects = await prisma.subject.findMany({ where: { classSectionId: exam.classSectionId }, select: { id: true, name: true } });
  const sheet = parseDateSheet(body, subjects.map((s) => s.id), new Map(subjects.map((s) => [s.id, s.name])));
  await prisma.exam.update({ where: { id: examId }, data: { dateSheet: sheet as any } });
  announce(examId, exam.dateSheet as DateSheet | null, sheet);
  return { ...sheet, warnings: await dayOffWarnings(sheet.entries) };
};

// Coordinator: use this class's date sheet for every other class of the exam. Subjects match by
// name; a subject with no paper in the other class is left out and reported.
export const copyDateSheet = async (actor: { id: number; role: string }, examId: number) => {
  await assertCoordinator(actor);
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw httpError(404, "Exam not found");
  const sheet = (exam.dateSheet as DateSheet | null) ?? { entries: [], instructions: null };
  if (!sheet.entries.length) throw httpError(400, "Save this class's date sheet first");
  const names = new Map<number, string>((await prisma.subject.findMany({ where: { classSectionId: exam.classSectionId }, select: { id: true, name: true } })).map((s: { id: number; name: string }) => [s.id, s.name.trim().toLowerCase()]));
  const siblings = await openSiblings(exam);
  let classes = 0;
  const notMatched = new Set<string>();
  for (const sibling of siblings) {
    const own = await prisma.subject.findMany({ where: { classSectionId: sibling.classSectionId, examSubjects: { some: { examId: sibling.id } } }, select: { id: true, name: true } });
    const idByName = new Map<string, number>(own.map((s: { id: number; name: string }) => [s.name.trim().toLowerCase(), s.id]));
    const entries = sheet.entries.flatMap((e): DateSheetEntry[] => {
      const id = idByName.get(names.get(e.subjectId) ?? "");
      return id ? [{ ...e, subjectId: id }] : [];
    });
    for (const s of own) if (!entries.some((e) => e.subjectId === s.id)) notMatched.add(s.name);
    if (!entries.length) continue;
    const next: DateSheet = { entries, instructions: sheet.instructions };
    await prisma.exam.update({ where: { id: sibling.id }, data: { dateSheet: next as any } });
    announce(sibling.id, sibling.dateSheet as DateSheet | null, next);
    classes++;
  }
  return { classes, notMatched: [...notMatched] };
};

// Date sheets students and staff can see: the term exams and periodic tests of the given
// classes (current session) that have papers scheduled, earliest first, with subject names.
export const listDateSheets = async (classSectionIds: number[]) => {
  if (!classSectionIds.length) return [];
  const exams = await prisma.exam.findMany({
    where: { classSectionId: { in: classSectionIds }, type: { not: "CLASS_TEST" }, session: { isCurrent: true } },
    include: { classSection: { select: { className: true, section: true } } },
  });
  const subjectIds = [...new Set(exams.flatMap((e) => ((e.dateSheet as DateSheet | null)?.entries ?? []).map((x) => x.subjectId)))];
  const names = new Map((await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name] as const));
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return exams
    .map((e) => {
      const sheet = (e.dateSheet as DateSheet | null) ?? { entries: [], instructions: null };
      const entries = sheet.entries.filter((x) => names.has(x.subjectId)).map((x) => ({ ...x, subjectName: names.get(x.subjectId)! }));
      return {
        examId: e.id,
        name: e.name,
        type: e.type,
        term: e.term,
        classSection: e.classSection,
        instructions: sheet.instructions,
        entries,
        firstDate: entries[0]?.date ?? null,
        lastDate: entries[entries.length - 1]?.date ?? null,
        finished: entries.length > 0 && entries[entries.length - 1].date < today,
      };
    })
    .filter((e) => e.entries.length > 0)
    .sort((a, b) => (a.firstDate ?? "").localeCompare(b.firstDate ?? ""));
};

// Everything the printed admit cards need. Only students currently studying are included.
export const getAdmitCards = async (examId: number) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      session: { select: { name: true } },
      classSection: { select: { id: true, className: true, section: true, classTeacher: { select: { user: { select: { name: true } } } } } },
    },
  });
  if (!exam) throw httpError(404, "Exam not found");
  const [subjects, students, settings, defaulters] = await Promise.all([
    prisma.subject.findMany({ where: { classSectionId: exam.classSectionId, examSubjects: { some: { examId } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.student.findMany({
      where: { classSectionId: exam.classSectionId, isActive: true },
      select: { id: true, name: true, admissionNo: true, rollNo: true, dob: true, fatherName: true, photoUrl: true },
    }),
    getExamSettings(),
    getDefaultersReport(exam.classSectionId),
  ]);
  // Students with overdue fees are held back unless the Super Admin allows cards for everyone.
  const dues = new Map(defaulters.map((d: any) => [d.studentId as number, d.totalDue as number] as const));
  const held = settings.admitCardsForDefaulters ? [] : students.filter((s) => dues.has(s.id));
  const issued = students.filter((s) => !held.includes(s));
  const byRoll = (a: { rollNo: string; name: string }, b: { rollNo: string; name: string }) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }) || a.name.localeCompare(b.name);
  const names = new Map(subjects.map((s) => [s.id, s.name]));
  const sheet = (exam.dateSheet as DateSheet | null) ?? { entries: [], instructions: null };
  return {
    exam: { id: exam.id, name: exam.name, session: exam.session?.name ?? null },
    // The date sheet is set for every exam; admit cards are printed only when switched on.
    admitCard: exam.admitCard,
    classSection: { className: exam.classSection.className, section: exam.classSection.section },
    classTeacher: exam.classSection.classTeacher?.user.name ?? null,
    subjects,
    dateSheet: {
      instructions: sheet.instructions,
      entries: sheet.entries.filter((e) => names.has(e.subjectId)).map((e) => ({ ...e, subjectName: names.get(e.subjectId)! })),
    },
    students: issued.sort(byRoll),
    heldBack: held.sort(byRoll).map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo, due: dues.get(s.id) ?? 0 })),
    allowDefaulters: settings.admitCardsForDefaulters,
  };
};
