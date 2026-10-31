import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";
import { findStaffByUserId } from "../staff/service";
import { isClassTeacherOfSection } from "../classSections/service";
import { isTeacherAssignedToSubject } from "../subjects/service";
import { assertPublisher, canPublish, isCoordinator } from "./permissions";
import { gradeFor, schemeForClass, type PaComponent, type Scheme } from "./schemeService";
import { onTermResultPublished } from "../notifications/events";

// Term and final results, following the class's assessment scheme:
//   term result per subject = periodic assessment (out of paMax, e.g. 20) + term exam
//   (scaled to examMax, e.g. 80). The periodic assessment is suggested from its parts
//   (periodic tests averaged or best-of, notebook, enrichment... entered by the teacher) and
//   the subject teacher can adjust the final figure until the result is published.
//   final result (two-term schemes) = term percentages combined by the weightage chosen when
//   publishing. Class tests never count. Published results are frozen as snapshots.
// One-term schemes (Class 10): the latest term's term exam is the exam (the 80); term exams
// of earlier terms (Half Yearly) count as periodic tests, as CBSE schools usually do.

type Actor = { id: number; role: string };
const r1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (obtained: number, max: number) => (max > 0 ? obtained / max : 0);

export const CO_KEYS = ["workEducation", "artEducation", "healthPhysical", "discipline"] as const;

const loadClass = async (classSectionId: number) => {
  const cs = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: { session: { select: { id: true, name: true } }, classTeacher: { select: { user: { select: { name: true } } } } },
  });
  if (!cs) throw httpError(404, "Class not found");
  return cs;
};

// --- Who may see / change what ---------------------------------------------------------

const staffFor = (actor: Actor) => (actor.role === "TEACHER" ? findStaffByUserId(actor.id) : Promise.resolve(null));

// The whole class's results: coordinator, publisher and the class teacher.
export const assertCanViewClassResults = async (actor: Actor, classSectionId: number) => {
  if ((await isCoordinator(actor)) || (await canPublish(actor))) return;
  const staff = await staffFor(actor);
  if (staff && (await isClassTeacherOfSection(staff.id, classSectionId))) return;
  throw httpError(403, "Only the class teacher and the exam coordinator see the whole class's results");
};

const assertSubjectTeacher = async (actor: Actor, subjectId: number) => {
  const staff = await staffFor(actor);
  if (!staff || !(await isTeacherAssignedToSubject(staff.id, subjectId))) throw httpError(403, "Only the subject's teacher can enter these marks");
};

const publication = (classSectionId: number, term: number) =>
  prisma.resultPublication.findUnique({ where: { classSectionId_term: { classSectionId, term } } });

const assertNotPublished = async (classSectionId: number, term: number) => {
  if (await publication(classSectionId, term)) throw httpError(409, "This term's result is published. The Super Admin or Principal must unpublish it before marks can change.");
  if (await publication(classSectionId, 0)) throw httpError(409, "The final result is published. The Super Admin or Principal must unpublish it before marks can change.");
};

// --- Calculation -------------------------------------------------------------------------

type ExamRow = { id: number; name: string; type: string; term: number; subjects: Map<number, number> };

// Which exams of the class feed a term: [the term exam(s), the periodic tests].
const examsForTerm = (scheme: Scheme, exams: ExamRow[], term: number) => {
  const counted = exams.filter((e) => e.type !== "CLASS_TEST");
  if (scheme.terms === 1) {
    const termExams = counted.filter((e) => e.type === "TERM_EXAM");
    const last = Math.max(0, ...termExams.map((e) => e.term));
    return {
      termExams: termExams.filter((e) => e.term === last),
      tests: [...counted.filter((e) => e.type === "PERIODIC_TEST"), ...termExams.filter((e) => e.term !== last)],
    };
  }
  return {
    termExams: counted.filter((e) => e.type === "TERM_EXAM" && e.term === term),
    tests: counted.filter((e) => e.type === "PERIODIC_TEST" && e.term === term),
  };
};

export const computeTerm = async (classSectionId: number, term: number) => {
  const cs = await loadClass(classSectionId);
  const scheme = await schemeForClass(cs.className);
  if (term < 1 || term > scheme.terms) throw httpError(400, `${cs.className} has ${scheme.terms === 1 ? "one result for the year" : "two terms"}`);

  const [students, subjects, examRows, marks, adjustments, remarks, enrollments] = await Promise.all([
    prisma.student.findMany({
      where: { classSectionId, isActive: true },
      select: { id: true, name: true, admissionNo: true, rollNo: true, dob: true, gender: true, fatherName: true, motherName: true, photoUrl: true },
    }),
    prisma.subject.findMany({ where: { classSectionId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.exam.findMany({ where: { classSectionId }, include: { subjects: true } }),
    prisma.assessmentMark.findMany({ where: { classSectionId, term } }),
    prisma.periodicAdjustment.findMany({ where: { classSectionId, term } }),
    prisma.termRemark.findMany({ where: { classSectionId, term } }),
    prisma.studentEnrollment.findMany({ where: { classSectionId }, select: { studentId: true, rollNo: true } }),
  ]);
  const exams: ExamRow[] = examRows.map((e) => ({ id: e.id, name: e.name, type: e.type, term: e.term, subjects: new Map(e.subjects.map((s) => [s.subjectId, s.maxMarks])) }));
  const { termExams, tests } = examsForTerm(scheme, exams, term);
  const examIds = [...termExams, ...tests].map((e) => e.id);
  const results = examIds.length ? await prisma.examResult.findMany({ where: { examId: { in: examIds } } }) : [];
  const resultOf = new Map<string, { isAbsent: boolean; marksObtained: number; maxMarks: number }>(results.map((r) => [`${r.examId}:${r.studentId}:${r.subjectId}`, r]));
  const markOf = new Map<string, number>(marks.map((m) => [`${m.studentId}:${m.subjectId}:${m.component}`, m.marks]));
  const adjOf = new Map<string, number>(adjustments.map((a) => [`${a.studentId}:${a.subjectId}`, a.marks]));
  const remarkOf = new Map<number, any>(remarks.map((r) => [r.studentId, r]));
  const rollOf = new Map<number, string>(enrollments.filter((e) => e.rollNo).map((e) => [e.studentId, e.rollNo]));

  // A component's score out of its max, or null when nothing is recorded yet.
  const componentScore = (c: PaComponent, studentId: number, subjectId: number) => {
    if (c.source === "MARKS") {
      const v = markOf.get(`${studentId}:${subjectId}:${c.key}`);
      return v === undefined ? null : v;
    }
    const ratios = tests
      .filter((t) => t.subjects.has(subjectId))
      .map((t) => resultOf.get(`${t.id}:${studentId}:${subjectId}`))
      .filter(Boolean)
      .map((r) => ratio(r!.isAbsent ? 0 : r!.marksObtained, r!.maxMarks));
    if (!ratios.length) return null;
    const used = c.rule === "BEST" ? [...ratios].sort((a, b) => b - a).slice(0, c.best ?? 2) : ratios;
    return r1((used.reduce((a, b) => a + b, 0) / used.length) * c.max);
  };

  const rows = students.map((s) => {
    const subjectRows = subjects.map((sub) => {
      const components = scheme.paComponents.map((c) => ({ key: c.key, label: c.label, max: c.max, score: componentScore(c, s.id, sub.id) }));
      const suggested = r1(components.reduce((a, c) => a + (c.score ?? 0), 0));
      const adjusted = adjOf.get(`${s.id}:${sub.id}`);
      const pa = scheme.paMax > 0 ? (adjusted ?? suggested) : 0;

      const papers = termExams.filter((e) => e.subjects.has(sub.id));
      const entered = papers.map((e) => resultOf.get(`${e.id}:${s.id}:${sub.id}`)).filter(Boolean);
      const absent = entered.length > 0 && entered.every((r) => r!.isAbsent);
      const exam =
        entered.length === 0 ? null : r1(ratio(entered.reduce((a, r) => a + (r!.isAbsent ? 0 : r!.marksObtained), 0), entered.reduce((a, r) => a + r!.maxMarks, 0)) * scheme.examMax);
      const max = scheme.paMax + scheme.examMax;
      const total = exam === null ? null : r1(pa + exam);
      const percentage = total === null ? null : r1(ratio(total, max) * 100);
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        components,
        paSuggested: suggested,
        paAdjusted: adjusted ?? null,
        pa: r1(pa),
        exam,
        examAbsent: absent,
        hasPaper: papers.length > 0,
        total,
        max,
        percentage,
        grade: percentage === null ? null : gradeFor(scheme, percentage),
        passed: percentage === null ? null : percentage >= scheme.passPercentage,
        complete: exam !== null && components.every((c) => c.score !== null),
      };
    });
    const counted = subjectRows.filter((x) => x.hasPaper);
    const done = counted.filter((x) => x.total !== null);
    const total = r1(done.reduce((a, x) => a + (x.total ?? 0), 0));
    const maxTotal = done.reduce((a, x) => a + x.max, 0);
    const percentage = maxTotal ? r1((total / maxTotal) * 100) : null;
    const failed = done.filter((x) => x.passed === false).map((x) => x.subjectName);
    const remark = remarkOf.get(s.id);
    return {
      student: { ...s, rollNo: rollOf.get(s.id) ?? s.rollNo },
      subjects: subjectRows,
      total,
      maxTotal,
      percentage,
      grade: percentage === null ? null : gradeFor(scheme, percentage),
      result: done.length === 0 ? "PENDING" : done.length < counted.length ? "INCOMPLETE" : failed.length ? "NEEDS_IMPROVEMENT" : "PASS",
      failedSubjects: failed,
      complete: counted.length > 0 && counted.every((x) => x.complete),
      remark: remark?.remark ?? null,
      coScholastic: Object.fromEntries(CO_KEYS.map((k) => [k, (remark as any)?.[k] ?? null])),
    };
  });
  rows.sort((a, b) => String(a.student.rollNo).localeCompare(String(b.student.rollNo), undefined, { numeric: true }) || a.student.name.localeCompare(b.student.name));

  return {
    kind: "TERM" as const,
    term,
    classSection: { id: cs.id, className: cs.className, section: cs.section },
    session: cs.session.name,
    classTeacher: cs.classTeacher?.user.name ?? null,
    scheme: { name: scheme.name, terms: scheme.terms, paMax: scheme.paMax, examMax: scheme.examMax, passPercentage: scheme.passPercentage, coScale: scheme.coScale, paComponents: scheme.paComponents, gradeScale: scheme.gradeScale },
    exams: { termExams: termExams.map((e) => e.name), tests: tests.map((e) => e.name) },
    subjects,
    students: rows,
  };
};

export type TermResult = Awaited<ReturnType<typeof computeTerm>>;

// Final result of a two-term scheme: each subject's term percentages combined by weight.
export const computeFinal = async (classSectionId: number, weightsIn?: number[]) => {
  const cs = await loadClass(classSectionId);
  const scheme = await schemeForClass(cs.className);
  if (scheme.terms === 1) {
    const t = await computeTerm(classSectionId, 1);
    return { ...t, kind: "FINAL" as const, weights: [100], terms: [t] };
  }
  const weights = weightsIn && weightsIn.length === 2 ? weightsIn : scheme.finalWeights;
  if (weights.some((w) => !Number.isFinite(w) || w < 0) || weights[0] + weights[1] !== 100) throw httpError(400, "Term 1 and Term 2 weightage must add up to 100");
  // A published term is used as published, otherwise the live calculation.
  const termData = async (term: number): Promise<TermResult> => ((await publication(classSectionId, term))?.snapshot as any) ?? computeTerm(classSectionId, term);
  const [t1, t2] = await Promise.all([termData(1), termData(2)]);
  const rowOf = (t: TermResult, studentId: number) => t.students.find((x) => x.student.id === studentId);

  const students = t2.students.map((s2) => {
    const s1 = rowOf(t1, s2.student.id);
    const subjects = t2.subjects.map((sub) => {
      const a = s1?.subjects.find((x) => x.subjectId === sub.id);
      const b = s2.subjects.find((x) => x.subjectId === sub.id);
      const parts = [
        { p: a?.percentage ?? null, w: weights[0] },
        { p: b?.percentage ?? null, w: weights[1] },
      ].filter((x) => x.p !== null);
      const weightUsed = parts.reduce((s, x) => s + x.w, 0);
      const percentage = parts.length && weightUsed ? r1(parts.reduce((s, x) => s + (x.p as number) * x.w, 0) / weightUsed) : null;
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        term1: a ? { total: a.total, max: a.max, percentage: a.percentage, grade: a.grade } : null,
        term2: b ? { total: b.total, max: b.max, percentage: b.percentage, grade: b.grade } : null,
        percentage,
        grade: percentage === null ? null : gradeFor(scheme, percentage),
        passed: percentage === null ? null : percentage >= scheme.passPercentage,
        complete: parts.length === 2,
      };
    });
    const done = subjects.filter((x) => x.percentage !== null);
    const percentage = done.length ? r1(done.reduce((s, x) => s + (x.percentage as number), 0) / done.length) : null;
    const failed = done.filter((x) => x.passed === false).map((x) => x.subjectName);
    return {
      student: s2.student,
      subjects,
      term1: s1 ? { percentage: s1.percentage, grade: s1.grade } : null,
      term2: { percentage: s2.percentage, grade: s2.grade },
      percentage,
      grade: percentage === null ? null : gradeFor(scheme, percentage),
      result: done.length === 0 ? "PENDING" : done.some((x) => !x.complete) ? "INCOMPLETE" : failed.length ? "NEEDS_IMPROVEMENT" : "PASS",
      failedSubjects: failed,
      complete: subjects.every((x) => x.complete),
      remark: s2.remark,
      coScholastic: s2.coScholastic,
      term1CoScholastic: s1?.coScholastic ?? null,
      term1Remark: s1?.remark ?? null,
    };
  });
  return {
    kind: "FINAL" as const,
    classSection: t2.classSection,
    session: t2.session,
    classTeacher: t2.classTeacher,
    scheme: t2.scheme,
    weights,
    subjects: t2.subjects,
    students,
  };
};

// --- Staff views and publishing ----------------------------------------------------------

const attendanceFor = async (classSectionId: number) => {
  const rows = await prisma.attendance.groupBy({ by: ["studentId", "status"], where: { classSectionId }, _count: { _all: true } });
  const out: Record<number, { present: number; workingDays: number }> = {};
  for (const a of rows as any[]) {
    const x = (out[a.studentId] ??= { present: 0, workingDays: 0 });
    x.workingDays += a._count._all;
    if (a.status === "PRESENT" || a.status === "LATE") x.present += a._count._all;
  }
  return out;
};

// term 1/2 = a term; term 0 = the final result.
export const getClassResult = async (actor: Actor, classSectionId: number, term: number, weights?: number[]) => {
  await assertCanViewClassResults(actor, classSectionId);
  const pub = await publication(classSectionId, term);
  const data = pub ? (pub.snapshot as any) : term === 0 ? await computeFinal(classSectionId, weights) : await computeTerm(classSectionId, term);
  const scheme = await schemeForClass((await loadClass(classSectionId)).className);
  return {
    ...data,
    termsInScheme: scheme.terms,
    defaultWeights: scheme.finalWeights,
    published: pub ? { at: pub.publishedAt, weights: pub.weights } : null,
    canPublish: await canPublish(actor),
  };
};

export const publishResult = async (actor: Actor, body: any) => {
  await assertPublisher(actor);
  const term = Number(body?.term);
  if (![0, 1, 2].includes(term)) throw httpError(400, "Pick a term or the final result");
  const ids: number[] = (Array.isArray(body?.classSectionIds) ? body.classSectionIds : [body?.classSectionId]).map(Number).filter(Number.isInteger);
  if (!ids.length) throw httpError(400, "Pick a class");
  const weights = Array.isArray(body?.weights) ? body.weights.map(Number) : undefined;
  const done: number[] = [];
  for (const classSectionId of ids) {
    const snapshot: any = term === 0 ? await computeFinal(classSectionId, weights) : await computeTerm(classSectionId, term);
    snapshot.attendance = await attendanceFor(classSectionId);
    await prisma.resultPublication.upsert({
      where: { classSectionId_term: { classSectionId, term } },
      create: { classSectionId, term, weights: snapshot.weights ?? [], snapshot, publishedByUserId: actor.id },
      update: { weights: snapshot.weights ?? [], snapshot, publishedByUserId: actor.id, publishedAt: new Date() },
    });
    done.push(classSectionId);
    onTermResultPublished(classSectionId, term);
  }
  return { published: done.length };
};

export const unpublishResult = async (actor: Actor, classSectionId: number, term: number) => {
  await assertPublisher(actor);
  if (term !== 0 && (await publication(classSectionId, 0))) throw httpError(409, "Unpublish the final result first");
  await prisma.resultPublication.deleteMany({ where: { classSectionId, term } });
};

// Every class's publication status for the coordinator's overview.
export const listPublications = async (actor: Actor, sessionId?: number) => {
  if (!(await isCoordinator(actor)) && !(await canPublish(actor))) throw httpError(403, "Forbidden");
  const session = sessionId ?? (await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))?.id;
  const classes = await prisma.classSection.findMany({ where: { sessionId: session }, select: { id: true, className: true, section: true }, orderBy: [{ className: "asc" }, { section: "asc" }] });
  const pubs = await prisma.resultPublication.findMany({ where: { classSectionId: { in: classes.map((c) => c.id) } }, select: { classSectionId: true, term: true, publishedAt: true } });
  // School order: Nursery, LKG, UKG, then Class 1, 2 … 10 (not "1, 10, 2").
  const PRE = ["nursery", "lkg", "ukg"];
  const order = (name: string) => {
    const n = name.toLowerCase().replace(/^class\s*/, "");
    return PRE.includes(n) ? PRE.indexOf(n) - 10 : parseInt(n, 10) || 100;
  };
  classes.sort((a, b) => order(a.className) - order(b.className) || a.section.localeCompare(b.section));
  const out: any[] = [];
  for (const c of classes) {
    const scheme = await schemeForClass(c.className);
    out.push({ ...c, scheme: scheme.name, terms: scheme.terms, published: pubs.filter((p) => p.classSectionId === c.id).map((p) => ({ term: p.term, at: p.publishedAt })) });
  }
  return out;
};

// --- Student's own published results ------------------------------------------------------

export const getMyResults = async (studentId: number) => {
  const enrollments = await prisma.studentEnrollment.findMany({ where: { studentId }, select: { classSectionId: true } });
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { classSectionId: true } });
  const classIds = [...new Set([student?.classSectionId, ...enrollments.map((e) => e.classSectionId)].filter((x): x is number => !!x))];
  const pubs = await prisma.resultPublication.findMany({ where: { classSectionId: { in: classIds } }, orderBy: [{ publishedAt: "desc" }] });
  return pubs
    .map((p) => {
      const snap: any = p.snapshot;
      const row = snap.students?.find((s: any) => s.student.id === studentId);
      if (!row) return null;
      return {
        classSectionId: p.classSectionId,
        term: p.term,
        publishedAt: p.publishedAt,
        kind: snap.kind,
        session: snap.session,
        classSection: snap.classSection,
        classTeacher: snap.classTeacher,
        scheme: snap.scheme,
        weights: snap.weights ?? null,
        subjects: snap.subjects,
        attendance: snap.attendance?.[studentId] ?? null,
        row,
      };
    })
    .filter(Boolean);
};

// --- Periodic assessment entry (subject teacher) -------------------------------------------

export const getAssessmentSheet = async (actor: Actor, classSectionId: number, term: number, subjectId: number) => {
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.classSectionId !== classSectionId) throw httpError(400, "That subject isn't taught in this class");
  if (!(await isCoordinator(actor))) {
    const staff = await staffFor(actor);
    const ok = staff && ((await isTeacherAssignedToSubject(staff.id, subjectId)) || (await isClassTeacherOfSection(staff.id, classSectionId)));
    if (!ok) throw httpError(403, "Only the subject's teacher can see these marks");
  }
  const result = await computeTerm(classSectionId, term);
  const published = !!(await publication(classSectionId, term)) || !!(await publication(classSectionId, 0));
  return {
    term,
    classSection: result.classSection,
    subject: { id: subject.id, name: subject.name },
    scheme: result.scheme,
    exams: result.exams,
    published,
    canEdit: !published && actor.role === "TEACHER" && !!(await staffFor(actor)) && (await isTeacherAssignedToSubject((await staffFor(actor))!.id, subjectId)),
    students: result.students.map((s) => {
      const sub = s.subjects.find((x) => x.subjectId === subjectId)!;
      return { student: { id: s.student.id, name: s.student.name, rollNo: s.student.rollNo }, components: sub.components, paSuggested: sub.paSuggested, paAdjusted: sub.paAdjusted, pa: sub.pa, exam: sub.exam, total: sub.total, grade: sub.grade };
    }),
  };
};

// Marks for the scheme's entered parts (notebook, enrichment...), each out of the part's max.
export const saveAssessmentMarks = async (actor: Actor, body: any) => {
  const classSectionId = Number(body?.classSectionId);
  const term = Number(body?.term);
  const subjectId = Number(body?.subjectId);
  await assertSubjectTeacher(actor, subjectId);
  await assertNotPublished(classSectionId, term);
  const cs = await loadClass(classSectionId);
  const scheme = await schemeForClass(cs.className);
  const parts = new Map(scheme.paComponents.filter((c) => c.source === "MARKS").map((c) => [c.key, c]));
  const studentIds = new Set((await prisma.student.findMany({ where: { classSectionId }, select: { id: true } })).map((s) => s.id));
  let saved = 0;
  for (const r of Array.isArray(body?.rows) ? body.rows : []) {
    const studentId = Number(r?.studentId);
    const part = parts.get(String(r?.component));
    if (!studentIds.has(studentId) || !part) throw httpError(400, "A row doesn't match this class or scheme");
    const key = { studentId_subjectId_term_component: { studentId, subjectId, term, component: part.key } };
    const old = await prisma.assessmentMark.findUnique({ where: key });
    if (r.marks === null || r.marks === "") {
      if (old) {
        await prisma.assessmentMark.delete({ where: key });
        await prisma.assessmentAudit.create({ data: { kind: "MARK", classSectionId, studentId, subjectId, term, component: part.key, oldMarks: old.marks, newMarks: null, changedByUserId: actor.id } });
      }
      continue;
    }
    const marks = Number(r.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > part.max) throw httpError(400, `${part.label} marks must be between 0 and ${part.max}`);
    if (old?.marks === marks) continue;
    await prisma.assessmentMark.upsert({ where: key, create: { classSectionId, studentId, subjectId, term, component: part.key, marks, updatedByUserId: actor.id }, update: { marks, updatedByUserId: actor.id, updatedAt: new Date() } });
    await prisma.assessmentAudit.create({ data: { kind: "MARK", classSectionId, studentId, subjectId, term, component: part.key, oldMarks: old?.marks ?? null, newMarks: marks, changedByUserId: actor.id } });
    saved++;
  }
  return { saved };
};

// The subject teacher's final periodic-assessment mark (null = use the calculated one).
export const saveAdjustments = async (actor: Actor, body: any) => {
  const classSectionId = Number(body?.classSectionId);
  const term = Number(body?.term);
  const subjectId = Number(body?.subjectId);
  await assertSubjectTeacher(actor, subjectId);
  await assertNotPublished(classSectionId, term);
  const scheme = await schemeForClass((await loadClass(classSectionId)).className);
  const studentIds = new Set((await prisma.student.findMany({ where: { classSectionId }, select: { id: true } })).map((s) => s.id));
  let saved = 0;
  for (const r of Array.isArray(body?.rows) ? body.rows : []) {
    const studentId = Number(r?.studentId);
    if (!studentIds.has(studentId)) throw httpError(400, "A student isn't in this class");
    const key = { studentId_subjectId_term: { studentId, subjectId, term } };
    const old = await prisma.periodicAdjustment.findUnique({ where: key });
    if (r.marks === null || r.marks === "") {
      if (old) {
        await prisma.periodicAdjustment.delete({ where: key });
        await prisma.assessmentAudit.create({ data: { kind: "ADJUSTMENT", classSectionId, studentId, subjectId, term, oldMarks: old.marks, newMarks: null, changedByUserId: actor.id } });
      }
      continue;
    }
    const marks = Number(r.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > scheme.paMax) throw httpError(400, `Periodic assessment must be between 0 and ${scheme.paMax}`);
    if (old?.marks === marks) continue;
    await prisma.periodicAdjustment.upsert({ where: key, create: { classSectionId, studentId, subjectId, term, marks, updatedByUserId: actor.id }, update: { marks, updatedByUserId: actor.id, updatedAt: new Date() } });
    await prisma.assessmentAudit.create({ data: { kind: "ADJUSTMENT", classSectionId, studentId, subjectId, term, oldMarks: old?.marks ?? null, newMarks: marks, changedByUserId: actor.id } });
    saved++;
  }
  return { saved };
};

// --- Term remarks and co-scholastic grades (class teacher) ---------------------------------

const assertClassTeacher = async (actor: Actor, classSectionId: number) => {
  const staff = await staffFor(actor);
  if (!staff || !(await isClassTeacherOfSection(staff.id, classSectionId))) throw httpError(403, "Only the class teacher writes report-card remarks");
};

export const getTermRemarks = async (actor: Actor, classSectionId: number, term: number) => {
  await assertCanViewClassResults(actor, classSectionId);
  const cs = await loadClass(classSectionId);
  const scheme = await schemeForClass(cs.className);
  const [students, remarks, enrollments] = await Promise.all([
    prisma.student.findMany({ where: { classSectionId, isActive: true }, select: { id: true, name: true, rollNo: true } }),
    prisma.termRemark.findMany({ where: { classSectionId, term } }),
    prisma.studentEnrollment.findMany({ where: { classSectionId }, select: { studentId: true, rollNo: true } }),
  ]);
  const byStudent = new Map<number, any>(remarks.map((r) => [r.studentId, r]));
  const rollOf = new Map<number, string>(enrollments.filter((e) => e.rollNo).map((e) => [e.studentId, e.rollNo]));
  const staff = await staffFor(actor);
  return {
    term,
    classSection: { id: cs.id, className: cs.className, section: cs.section },
    coScale: scheme.coScale,
    grades: scheme.coScale === 5 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C"],
    canEdit: !!staff && (await isClassTeacherOfSection(staff.id, classSectionId)) && !(await publication(classSectionId, term)),
    students: students
      .map((s) => {
        const r = byStudent.get(s.id);
        return { studentId: s.id, name: s.name, rollNo: rollOf.get(s.id) ?? s.rollNo, remark: r?.remark ?? null, ...Object.fromEntries(CO_KEYS.map((k) => [k, (r as any)?.[k] ?? null])) };
      })
      .sort((a, b) => String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true })),
  };
};

export const saveTermRemarks = async (actor: Actor, body: any) => {
  const classSectionId = Number(body?.classSectionId);
  const term = Number(body?.term);
  await assertClassTeacher(actor, classSectionId);
  if (await publication(classSectionId, term)) throw httpError(409, "This term's result is published; remarks can't change now");
  const scheme = await schemeForClass((await loadClass(classSectionId)).className);
  const allowed = new Set(scheme.coScale === 5 ? ["A", "B", "C", "D", "E"] : ["A", "B", "C"]);
  const studentIds = new Set((await prisma.student.findMany({ where: { classSectionId }, select: { id: true } })).map((s) => s.id));
  for (const r of Array.isArray(body?.rows) ? body.rows : []) {
    const studentId = Number(r?.studentId);
    if (!studentIds.has(studentId)) throw httpError(400, "A student isn't in this class");
    const remark = typeof r.remark === "string" && r.remark.trim() ? r.remark.trim().slice(0, 400) : null;
    const grades: Record<string, string | null> = {};
    for (const k of CO_KEYS) {
      const v = r[k] ? String(r[k]).toUpperCase() : null;
      if (v && !allowed.has(v)) throw httpError(400, `Co-scholastic grades must be ${[...allowed].join(", ")}`);
      grades[k] = v;
    }
    await prisma.termRemark.upsert({
      where: { classSectionId_studentId_term: { classSectionId, studentId, term } },
      create: { classSectionId, studentId, term, remark, ...grades, updatedByUserId: actor.id },
      update: { remark, ...grades, updatedByUserId: actor.id, updatedAt: new Date() },
    });
  }
  return { saved: true };
};
