import { prisma } from "../../config/prisma";
import { Gender, StudentCategory } from "../../generated/prisma/enums";
import { assertSuperAdmin, httpError } from "../../utils/httpError";
import type { Role } from "../../generated/prisma/enums";

// An "admission" is the Student record the office registers — there is no separate
// admission entity. The admission date is Student.admissionDate, falling back to the
// record's createdAt when it was never filled in, so older records still show up in
// date/session based reports.
//
// Session filtering is by admission date (within the session's start/end), NOT by the
// student's current class section — otherwise a student promoted into next session's
// class would be counted as a fresh admission again.

type Actor = { id: number; role: Role };

export interface AdmissionReportFilters {
  sessionId?: number;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  className?: string;
  section?: string;
  gender?: Gender | "UNSPECIFIED";
  category?: StudentCategory | "UNSPECIFIED";
  status?: "active" | "inactive" | "all";
  search?: string;
  sortBy?: "admissionDate" | "name" | "admissionNo" | "className";
  sortOrder?: "asc" | "desc";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SORT_FIELDS = ["admissionDate", "name", "admissionNo", "className"] as const;

const parseDay = (value: string, field: string) => {
  if (!DATE_RE.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw httpError(400, `${field} must be a valid date (YYYY-MM-DD)`);
  }
  return new Date(value); // UTC midnight — matches how admission dates are stored
};

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

// Validates raw query-string values into typed filters. Kept separate from the DB code
// so it can be unit tested without a database.
export const parseAdmissionFilters = (query: Record<string, unknown>): AdmissionReportFilters => {
  const str = (key: string) => {
    const v = query[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };

  const filters: AdmissionReportFilters = {};

  const sessionId = str("sessionId");
  if (sessionId) {
    if (!/^\d+$/.test(sessionId)) throw httpError(400, "sessionId must be a number");
    filters.sessionId = Number(sessionId);
  }

  const from = str("from");
  const to = str("to");
  if (from) parseDay(from, "from");
  if (to) parseDay(to, "to");
  if (from && to && from > to) throw httpError(400, "from date cannot be after to date");
  filters.from = from;
  filters.to = to;

  filters.className = str("className");
  filters.section = str("section");

  const gender = str("gender");
  if (gender) {
    if (gender !== "UNSPECIFIED" && !Object.values(Gender).includes(gender as Gender)) {
      throw httpError(400, `Invalid gender "${gender}"`);
    }
    filters.gender = gender as AdmissionReportFilters["gender"];
  }

  const category = str("category");
  if (category) {
    if (category !== "UNSPECIFIED" && !Object.values(StudentCategory).includes(category as StudentCategory)) {
      throw httpError(400, `Invalid category "${category}"`);
    }
    filters.category = category as AdmissionReportFilters["category"];
  }

  const status = str("status") ?? "all";
  if (!["active", "inactive", "all"].includes(status)) throw httpError(400, `Invalid status "${status}"`);
  filters.status = status as AdmissionReportFilters["status"];

  filters.search = str("search");

  const sortBy = str("sortBy") ?? "admissionDate";
  if (!SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])) {
    throw httpError(400, `Invalid sortBy "${sortBy}"`);
  }
  filters.sortBy = sortBy as AdmissionReportFilters["sortBy"];

  const sortOrder = str("sortOrder") ?? "desc";
  if (sortOrder !== "asc" && sortOrder !== "desc") throw httpError(400, `Invalid sortOrder "${sortOrder}"`);
  filters.sortOrder = sortOrder;

  return filters;
};

// Matches students whose effective admission date (admissionDate ?? createdAt) falls in
// [start, endExclusive).
const admissionDateWhere = (start?: Date, endExclusive?: Date) => {
  if (!start && !endExclusive) return undefined;
  const range = { ...(start ? { gte: start } : {}), ...(endExclusive ? { lt: endExclusive } : {}) };
  return { OR: [{ admissionDate: range }, { admissionDate: null, createdAt: range }] };
};

const buildWhere = async (filters: AdmissionReportFilters) => {
  let start = filters.from ? new Date(filters.from) : undefined;
  let endExclusive = filters.to ? addDays(new Date(filters.to), 1) : undefined;

  let session: { id: number; name: string; startDate: Date; endDate: Date } | null = null;
  if (filters.sessionId) {
    session = await prisma.academicSession.findUnique({ where: { id: filters.sessionId } });
    if (!session) throw httpError(404, "Academic session not found");
    // Intersect the session window with any explicit date range.
    const sessionStart = new Date(session.startDate.toISOString().slice(0, 10));
    const sessionEnd = addDays(new Date(session.endDate.toISOString().slice(0, 10)), 1);
    start = !start || sessionStart > start ? sessionStart : start;
    endExclusive = !endExclusive || sessionEnd < endExclusive ? sessionEnd : endExclusive;
  }

  const and: Record<string, unknown>[] = [];
  const dateWhere = admissionDateWhere(start, endExclusive);
  if (dateWhere) and.push(dateWhere);

  if (filters.className || filters.section) {
    and.push({
      classSection: {
        ...(filters.className ? { className: filters.className } : {}),
        ...(filters.section ? { section: filters.section } : {}),
      },
    });
  }
  if (filters.gender) and.push({ gender: filters.gender === "UNSPECIFIED" ? null : filters.gender });
  if (filters.category) and.push({ category: filters.category === "UNSPECIFIED" ? null : filters.category });
  if (filters.status === "active") and.push({ isActive: true });
  if (filters.status === "inactive") and.push({ isActive: false });

  if (filters.search) {
    const contains = { contains: filters.search, mode: "insensitive" as const };
    and.push({
      OR: [
        { name: contains },
        { admissionNo: contains },
        { fatherName: contains },
        { motherName: contains },
        { contactNumber: contains },
        { fatherContact: contains },
        { motherContact: contains },
      ],
    });
  }

  return { where: and.length ? { AND: and } : {}, session };
};

const orderByFor = (filters: AdmissionReportFilters) => {
  const dir = filters.sortOrder ?? "desc";
  switch (filters.sortBy) {
    case "name":
      return [{ name: dir }];
    case "admissionNo":
      return [{ admissionNo: dir }];
    case "className":
      return [{ classSection: { className: dir } }, { classSection: { section: dir } }, { rollNo: "asc" }];
    default:
      // Nulls (no admissionDate recorded) are re-sorted in JS below by createdAt fallback.
      return [{ admissionDate: { sort: dir, nulls: "last" } }, { createdAt: dir }];
  }
};

type ReportRow = {
  id: number;
  admissionNo: string;
  name: string;
  admissionDate: string;
  admissionDateRecorded: boolean;
  rollNo: string;
  className: string | null;
  section: string | null;
  sessionName: string | null;
  gender: Gender | null;
  category: StudentCategory | null;
  dob: string | null;
  fatherName: string | null;
  motherName: string | null;
  contact: string | null;
  previousSchool: string | null;
  isActive: boolean;
};

const summarise = (rows: ReportRow[]) => {
  const byGender: Record<string, number> = { MALE: 0, FEMALE: 0, OTHER: 0, UNSPECIFIED: 0 };
  const byCategory: Record<string, number> = { GENERAL: 0, OBC: 0, SC: 0, ST: 0, EWS: 0, UNSPECIFIED: 0 };
  const byClass = new Map<string, { className: string; total: number; male: number; female: number }>();
  const byMonth = new Map<string, number>();
  let active = 0;

  for (const r of rows) {
    byGender[r.gender ?? "UNSPECIFIED"] += 1;
    byCategory[r.category ?? "UNSPECIFIED"] += 1;
    if (r.isActive) active += 1;

    const cls = r.className ?? "Unassigned";
    const entry = byClass.get(cls) ?? { className: cls, total: 0, male: 0, female: 0 };
    entry.total += 1;
    if (r.gender === "MALE") entry.male += 1;
    if (r.gender === "FEMALE") entry.female += 1;
    byClass.set(cls, entry);

    const month = r.admissionDate.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }

  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    byGender,
    byCategory,
    byClass: [...byClass.values()].sort((a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true })
    ),
    monthlyTrend: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  };
};

// Returns every matching row plus a summary computed from the same row set, so the
// numbers on the report page always agree with the table underneath them.
export const getAdmissionReport = async (actor: Actor, filters: AdmissionReportFilters) => {
  assertSuperAdmin(actor);
  const { where, session } = await buildWhere(filters);

  const students = await prisma.student.findMany({
    where,
    orderBy: orderByFor(filters),
    select: {
      id: true,
      admissionNo: true,
      name: true,
      admissionDate: true,
      createdAt: true,
      rollNo: true,
      gender: true,
      category: true,
      dob: true,
      fatherName: true,
      motherName: true,
      fatherContact: true,
      motherContact: true,
      contactNumber: true,
      previousSchool: true,
      isActive: true,
      classSection: { select: { className: true, section: true, session: { select: { name: true } } } },
    },
  });

  const rows: ReportRow[] = students.map((s: any) => ({
    id: s.id,
    admissionNo: s.admissionNo,
    name: s.name,
    admissionDate: (s.admissionDate ?? s.createdAt).toISOString(),
    admissionDateRecorded: !!s.admissionDate,
    rollNo: s.rollNo,
    className: s.classSection?.className ?? null,
    section: s.classSection?.section ?? null,
    sessionName: s.classSection?.session?.name ?? null,
    gender: s.gender,
    category: s.category,
    dob: s.dob ? s.dob.toISOString() : null,
    fatherName: s.fatherName,
    motherName: s.motherName,
    contact: s.contactNumber || s.fatherContact || s.motherContact || null,
    previousSchool: s.previousSchool,
    isActive: s.isActive,
  }));

  if (!filters.sortBy || filters.sortBy === "admissionDate") {
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    rows.sort((a, b) => (a.admissionDate < b.admissionDate ? -dir : a.admissionDate > b.admissionDate ? dir : 0));
  }

  return {
    session: session ? { id: session.id, name: session.name } : null,
    summary: summarise(rows),
    rows,
  };
};

// Distinct class names/sections across all sessions — for the report's filter dropdowns.
export const getAdmissionFilterOptions = async (actor: Actor) => {
  assertSuperAdmin(actor);
  const sections = await prisma.classSection.findMany({
    select: { className: true, section: true },
    distinct: ["className", "section"],
  });
  const collator = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return {
    classNames: [...new Set<string>(sections.map((s: any) => s.className))].sort(collator),
    sections: [...new Set<string>(sections.map((s: any) => s.section))].sort(collator),
  };
};

// Dashboard widget data: totals for the current session and month, gender split and
// the website enquiry funnel.
export const getAdmissionOverview = async (actor: Actor) => {
  assertSuperAdmin(actor);
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

  const currentSession = await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const sessionWhere = currentSession
    ? admissionDateWhere(
        new Date(currentSession.startDate.toISOString().slice(0, 10)),
        addDays(new Date(currentSession.endDate.toISOString().slice(0, 10)), 1)
      )
    : null;

  const [totalStudents, activeStudents, thisMonth, sessionStudents] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { isActive: true } }),
    prisma.student.count({ where: admissionDateWhere(monthStart, nextMonthStart) }),
    sessionWhere
      ? prisma.student.findMany({ where: sessionWhere, select: { gender: true } })
      : Promise.resolve([] as { gender: Gender | null }[]),
  ]);

  const sessionByGender: Record<string, number> = { MALE: 0, FEMALE: 0, OTHER: 0, UNSPECIFIED: 0 };
  for (const s of sessionStudents as { gender: Gender | null }[]) sessionByGender[s.gender ?? "UNSPECIFIED"] += 1;

  // AdmissionInquiry is created lazily by the CMS module; if it isn't there yet the
  // dashboard should still render, just without the funnel.
  let enquiries: Record<string, number> | null = null;
  try {
    const grouped = await prisma.admissionInquiry.groupBy({ by: ["status"], _count: { _all: true } });
    enquiries = { NEW: 0, CONTACTED: 0, ADMITTED: 0, REJECTED: 0 };
    for (const g of grouped as { status: string; _count: { _all: number } }[]) {
      enquiries[g.status] = (enquiries[g.status] ?? 0) + g._count._all;
    }
  } catch {
    enquiries = null;
  }

  return {
    currentSession: currentSession ? { id: currentSession.id, name: currentSession.name } : null,
    totalStudents,
    activeStudents,
    currentSessionAdmissions: sessionStudents.length,
    currentMonthAdmissions: thisMonth,
    currentSessionByGender: sessionByGender,
    enquiries,
  };
};
