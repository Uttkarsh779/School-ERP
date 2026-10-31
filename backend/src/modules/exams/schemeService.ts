import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Assessment schemes: how a group of classes is assessed. Each term is the periodic
// assessment (paMax, e.g. 20, suggested from paComponents and adjustable by the subject
// teacher) plus the term exam (examMax, e.g. 80). Two-term schemes combine the terms with
// finalWeights (chosen again when the final result is published).

export interface PaComponent {
  key: string;
  label: string;
  max: number;
  source: "TESTS" | "MARKS"; // TESTS: from the term's periodic tests; MARKS: entered by the teacher
  rule?: "AVERAGE" | "BEST";
  best?: number;
}
export interface GradeBand {
  min: number;
  grade: string;
}
export interface Scheme {
  id: number;
  name: string;
  classNames: string[];
  terms: number;
  paMax: number;
  examMax: number;
  passPercentage: number;
  finalWeights: number[];
  paComponents: PaComponent[];
  gradeScale: GradeBand[];
  coScale: number;
}

const DEFAULT_GRADES: GradeBand[] = [
  { min: 91, grade: "A1" },
  { min: 81, grade: "A2" },
  { min: 71, grade: "B1" },
  { min: 61, grade: "B2" },
  { min: 51, grade: "C1" },
  { min: 41, grade: "C2" },
  { min: 33, grade: "D" },
  { min: 0, grade: "E" },
];

// Used when a class isn't in any scheme yet: CBSE two-term pattern.
export const FALLBACK_SCHEME: Scheme = {
  id: 0,
  name: "Default (two terms)",
  classNames: [],
  terms: 2,
  paMax: 20,
  examMax: 80,
  passPercentage: 33,
  finalWeights: [50, 50],
  paComponents: [
    { key: "PT", label: "Periodic tests", max: 10, source: "TESTS", rule: "AVERAGE" },
    { key: "NB", label: "Notebook", max: 5, source: "MARKS" },
    { key: "SEA", label: "Subject enrichment", max: 5, source: "MARKS" },
  ],
  gradeScale: DEFAULT_GRADES,
  coScale: 3,
};

const toScheme = (row: any): Scheme => ({
  ...row,
  paComponents: (row.paComponents as PaComponent[]) ?? [],
  gradeScale: ((row.gradeScale as GradeBand[]) ?? []).length ? (row.gradeScale as GradeBand[]) : DEFAULT_GRADES,
});

export const listSchemes = async () => (await prisma.assessmentScheme.findMany({ orderBy: { id: "asc" } })).map(toScheme);

export const schemeForClass = async (className: string): Promise<Scheme> => {
  const row = await prisma.assessmentScheme.findFirst({ where: { classNames: { has: className } }, orderBy: { id: "asc" } });
  return row ? toScheme(row) : FALLBACK_SCHEME;
};

export const gradeFor = (scheme: Scheme, percentage: number) => {
  const p = Math.round(percentage);
  return [...scheme.gradeScale].sort((a, b) => b.min - a.min).find((g) => p >= g.min)?.grade ?? "";
};

const num = (v: unknown, field: string, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `${field} must be between ${min} and ${max}`);
  return n;
};

// Validates a scheme from the editor. The components must add up to the periodic assessment.
export const parseScheme = (body: any) => {
  const name = String(body?.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw httpError(400, "Give the scheme a name");
  const classNames = Array.isArray(body?.classNames) ? [...new Set(body.classNames.map((c: unknown) => String(c).trim()).filter(Boolean))] as string[] : [];
  const terms = Number(body?.terms) === 1 ? 1 : 2;
  const paMax = num(body?.paMax, "Periodic assessment marks", 0, 100);
  const examMax = num(body?.examMax, "Term exam marks", 1, 200);
  const passPercentage = num(body?.passPercentage ?? 33, "Pass percentage", 0, 100);
  const finalWeights = terms === 1 ? [100] : (Array.isArray(body?.finalWeights) ? body.finalWeights : [50, 50]).slice(0, 2).map((w: unknown) => num(w, "Term weightage", 0, 100));
  if (terms === 2 && finalWeights[0] + finalWeights[1] !== 100) throw httpError(400, "Term 1 and Term 2 weightage must add up to 100");

  const comps: PaComponent[] = (Array.isArray(body?.paComponents) ? body.paComponents : []).map((c: any, i: number) => {
    const label = String(c?.label ?? "").trim();
    if (!label) throw httpError(400, "Every periodic-assessment part needs a name");
    const source = c?.source === "TESTS" ? "TESTS" : "MARKS";
    const rule = c?.rule === "BEST" ? "BEST" : "AVERAGE";
    return {
      key: String(c?.key || `C${i + 1}`).replace(/[^\w]/g, "").slice(0, 12) || `C${i + 1}`,
      label: label.slice(0, 40),
      max: num(c?.max, `${label} marks`, 0, 100),
      source,
      ...(source === "TESTS" ? { rule, ...(rule === "BEST" ? { best: Math.max(1, Math.round(num(c?.best ?? 2, "Best of", 1, 10))) } : {}) } : {}),
    };
  });
  if (new Set(comps.map((c) => c.key)).size !== comps.length) throw httpError(400, "Periodic-assessment parts need different names");
  const compTotal = comps.reduce((s, c) => s + c.max, 0);
  if (comps.length && Math.abs(compTotal - paMax) > 0.001) throw httpError(400, `The periodic-assessment parts add up to ${compTotal}, not ${paMax}`);

  const gradeScale: GradeBand[] = (Array.isArray(body?.gradeScale) && body.gradeScale.length ? body.gradeScale : DEFAULT_GRADES).map((g: any) => ({
    min: num(g?.min, "Grade cut-off", 0, 100),
    grade: String(g?.grade ?? "").trim().slice(0, 4) || "?",
  }));
  if (!gradeScale.some((g) => g.min === 0)) throw httpError(400, "The grade scale needs a grade starting at 0%");
  const coScale = Number(body?.coScale) === 5 ? 5 : 3;
  return { name, classNames, terms, paMax, examMax, passPercentage, finalWeights, paComponents: comps as any, gradeScale: gradeScale as any, coScale };
};

// A class can belong to only one scheme.
const assertClassesFree = async (classNames: string[], exceptId?: number) => {
  const others = await prisma.assessmentScheme.findMany({ where: { id: exceptId ? { not: exceptId } : undefined, classNames: { hasSome: classNames } } });
  const taken = others.flatMap((s) => s.classNames.filter((c) => classNames.includes(c)).map((c) => `${c} (${s.name})`));
  if (taken.length) throw httpError(409, `Already in another scheme: ${taken.join(", ")}`);
};

export const saveScheme = async (id: number | null, body: unknown) => {
  const data = parseScheme(body);
  await assertClassesFree(data.classNames, id ?? undefined);
  const row = id ? await prisma.assessmentScheme.update({ where: { id }, data }) : await prisma.assessmentScheme.create({ data });
  return toScheme(row);
};

export const deleteScheme = async (id: number) => {
  await prisma.assessmentScheme.delete({ where: { id } });
};

export const getExamSettings = async () =>
  (await prisma.examSetting.findUnique({ where: { id: 1 } })) ?? prisma.examSetting.create({ data: { id: 1 } });

export const updateExamSettings = async (body: any) => {
  await getExamSettings();
  if (typeof body?.admitCardsForDefaulters !== "boolean") throw httpError(400, "admitCardsForDefaulters must be true or false");
  return prisma.examSetting.update({ where: { id: 1 }, data: { admitCardsForDefaulters: body.admitCardsForDefaulters, updatedAt: new Date() } });
};
