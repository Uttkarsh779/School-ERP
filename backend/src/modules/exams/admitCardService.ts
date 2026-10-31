import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { getDefaultersReport } from "../fees/ledgerService";
import { getExamSettings } from "./schemeService";

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

export const parseDateSheet = (body: any, subjectIds: number[]): DateSheet => {
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
    if (!DATE_RE.test(date)) throw httpError(400, "Pick a date for every subject with a paper");
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) throw httpError(400, "Enter start and end times like 09:00");
    if (end <= start) throw httpError(400, "A paper's end time must be after its start time");
    entries.push({ subjectId, date, start, end });
  }
  entries.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const instructions = typeof body?.instructions === "string" && body.instructions.trim() ? body.instructions.trim().slice(0, 2000) : null;
  return { entries, instructions };
};

export const saveDateSheet = async (examId: number, body: unknown) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { classSectionId: true } });
  if (!exam) throw httpError(404, "Exam not found");
  const subjects = await prisma.subject.findMany({ where: { classSectionId: exam.classSectionId }, select: { id: true } });
  const sheet = parseDateSheet(body, subjects.map((s) => s.id));
  await prisma.exam.update({ where: { id: examId }, data: { dateSheet: sheet as any } });
  return sheet;
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
  if (!exam.admitCard) throw httpError(400, "Admit cards are switched off for this exam");
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
