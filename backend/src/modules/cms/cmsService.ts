import { prisma } from "../../config/prisma";
import { httpError } from "../../utils/httpError";

// Public school website content (CMS).
//  - One settings row (school identity, home/about/contact copy, images, stats, socials).
//  - Content collections (facilities, gallery, notices, testimonials, FAQs) share one
//    config-driven CRUD with strict per-field validation — request bodies are never spread
//    into Prisma, so only the listed fields can ever be written.
//  - Admission enquiries from the public form.

const DEFAULT_SETTINGS = {
  id: 1,
  schoolName: "RRS International School",
  tagline: "Empowering Minds, Inspiring Excellence",
  heroTitle: "Where Curious Minds Grow Into Confident Leaders",
  heroSubtitle: "A caring, future-ready school offering strong academics, sports, arts and values from Nursery to Class XII.",
  aboutText:
    "Our school is committed to academic excellence, character development and the joy of learning. Every child is known, valued and encouraged to discover their strengths in a safe, modern campus.",
  principalName: "Dr. S. K. Sharma",
  principalMessage:
    "Education is not just about marks; it is about curiosity, empathy and resilience. We help every student dream boldly, think critically and lead with compassion. We warmly invite you to be a part of our school family.",
  affiliationNo: "2130892",
  establishedYear: 1998,
  phone: "+91 98765 43210",
  email: "info@school.edu.in",
  address: "Sector 14, Knowledge Park, New Delhi - 110001",
  admissionsOpen: true,
  admissionNotice: "Admissions open for Nursery to Class XI. Visit the admissions office or send an online enquiry.",
  heroCtaText: "Apply for Admission",
  heroCtaLink: "/admissions",
};

const DEFAULT_FACILITIES = [
  { title: "Smart Classrooms", description: "Interactive panels and well-ventilated, well-lit rooms designed for engaging, visual learning.", iconName: "building", order: 1 },
  { title: "Science & Computer Labs", description: "Fully equipped physics, chemistry, biology and computer labs for hands-on experiments and coding.", iconName: "layers", order: 2 },
  { title: "Sports & Playgrounds", description: "Large playground, courts for basketball and badminton, and trained coaches for athletics and games.", iconName: "star", order: 3 },
  { title: "Library", description: "Thousands of books, magazines and reference titles with a quiet reading area for every age group.", iconName: "graduationCap", order: 4 },
  { title: "Safe Transport", description: "GPS-tracked school buses with trained drivers and attendants covering nearby villages and towns.", iconName: "bus", order: 5 },
  { title: "Music, Art & Dance", description: "Dedicated rooms for music, dance and fine arts, plus a stage for annual functions and assemblies.", iconName: "users", order: 6 },
];

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

type FieldSpec =
  | { type: "text"; max: number; required?: boolean; min?: number }
  | { type: "url"; required?: boolean }
  | { type: "int"; min?: number; max?: number }
  | { type: "bool" }
  | { type: "date" }
  | { type: "enum"; values: readonly string[] };

const URL_RE = /^https?:\/\/[^\s<>"']+$/i;

export const ICON_NAMES = ["building", "layers", "graduationCap", "bus", "users", "calendar", "star", "globe", "clipboardCheck", "bell", "fileText", "dashboard"] as const;

const label = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/ Url$/, " link");

const parseField = (key: string, spec: FieldSpec, raw: unknown): unknown => {
  const name = label(key);
  switch (spec.type) {
    case "text": {
      if (raw === null || raw === undefined || raw === "") {
        if (spec.required) throw httpError(400, `${name} is required`);
        return null;
      }
      if (typeof raw !== "string" && typeof raw !== "number") throw httpError(400, `${name} must be text`);
      const t = String(raw).trim();
      if (spec.required && !t) throw httpError(400, `${name} is required`);
      if (spec.min && t.length < spec.min) throw httpError(400, `${name} must be at least ${spec.min} characters`);
      if (t.length > spec.max) throw httpError(400, `${name} must be at most ${spec.max} characters`);
      return t || null;
    }
    case "url": {
      if (raw === null || raw === undefined || raw === "") {
        if (spec.required) throw httpError(400, `${name} is required`);
        return null;
      }
      const t = String(raw).trim();
      if (t.length > 1000 || !URL_RE.test(t)) throw httpError(400, `${name} must be a valid http(s) link`);
      return t;
    }
    case "int": {
      const n = raw === "" || raw === null || raw === undefined ? 0 : Number(raw);
      if (!Number.isInteger(n)) throw httpError(400, `${name} must be a whole number`);
      if (spec.min !== undefined && n < spec.min) throw httpError(400, `${name} must be at least ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw httpError(400, `${name} must be at most ${spec.max}`);
      return n;
    }
    case "bool":
      if (typeof raw === "boolean") return raw;
      if (raw === "true" || raw === 1 || raw === "1") return true;
      if (raw === "false" || raw === 0 || raw === "0") return false;
      throw httpError(400, `${name} must be true or false`);
    case "date": {
      const d = new Date(String(raw));
      if (!raw || Number.isNaN(d.getTime())) throw httpError(400, `${name} must be a valid date`);
      return d;
    }
    case "enum":
      if (!spec.values.includes(String(raw))) throw httpError(400, `${name} is not a valid option`);
      return String(raw);
  }
};

// partial=true (updates): only the fields present in the body are validated and written.
const parseFields = (specs: Record<string, FieldSpec>, body: Record<string, unknown>, partial: boolean) => {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (body[key] === undefined) {
      if (!partial && "required" in spec && spec.required) throw httpError(400, `${label(key)} is required`);
      continue;
    }
    out[key] = parseField(key, spec, body[key]);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_FIELDS: Record<string, FieldSpec> = {
  schoolName: { type: "text", max: 120, required: true, min: 2 },
  tagline: { type: "text", max: 160, required: true },
  boardName: { type: "text", max: 60, required: true },
  affiliationNo: { type: "text", max: 60, required: true },
  schoolCode: { type: "text", max: 60 },
  establishedYear: { type: "int", min: 1800, max: 2100 },
  academicSession: { type: "text", max: 20 },
  logoUrl: { type: "url" },
  heroTitle: { type: "text", max: 160, required: true },
  heroSubtitle: { type: "text", max: 400, required: true },
  heroCtaText: { type: "text", max: 40, required: true },
  heroCtaLink: { type: "text", max: 300, required: true },
  heroImageUrl: { type: "url" },
  admissionsOpen: { type: "bool" },
  admissionNotice: { type: "text", max: 400 },
  aboutText: { type: "text", max: 4000, required: true },
  aboutImageUrl: { type: "url" },
  vision: { type: "text", max: 1000 },
  mission: { type: "text", max: 1500 },
  principalName: { type: "text", max: 80, required: true },
  principalTitle: { type: "text", max: 80, required: true },
  principalMessage: { type: "text", max: 3000, required: true },
  principalPhotoUrl: { type: "url" },
  phone: { type: "text", max: 40, required: true },
  whatsapp: { type: "text", max: 20 },
  email: { type: "text", max: 120, required: true },
  address: { type: "text", max: 300, required: true },
  officeHours: { type: "text", max: 120 },
  facebookUrl: { type: "url" },
  instagramUrl: { type: "url" },
  youtubeUrl: { type: "url" },
  twitterUrl: { type: "url" },
};

// Admins usually paste the whole <iframe> Google gives them — keep only the embed URL,
// and only from Google Maps, so the public site never frames arbitrary pages.
export const parseMapEmbed = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const text = String(raw).trim();
  const src = /src\s*=\s*["']([^"']+)["']/i.exec(text)?.[1] ?? text;
  let url: URL;
  try {
    url = new URL(src.replace(/&amp;/g, "&"));
  } catch {
    throw httpError(400, "Map must be a Google Maps embed link");
  }
  const okHost = url.hostname === "www.google.com" || url.hostname === "maps.google.com" || url.hostname === "google.com";
  if (url.protocol !== "https:" || !okHost || !url.pathname.startsWith("/maps")) {
    throw httpError(400, "Map must be a Google Maps embed link (Share → Embed a map → copy HTML)");
  }
  return url.toString();
};

export const parseStats = (raw: unknown) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!Array.isArray(raw)) throw httpError(400, "Stats must be a list");
  if (raw.length > 6) throw httpError(400, "Add at most 6 stats");
  return raw
    .map((s: any) => ({ value: String(s?.value ?? "").trim(), label: String(s?.label ?? "").trim() }))
    .filter((s) => s.value || s.label)
    .map((s) => {
      if (!s.value || !s.label) throw httpError(400, "Each stat needs a value and a label");
      if (s.value.length > 12 || s.label.length > 50) throw httpError(400, "Stat value max 12 and label max 50 characters");
      return s;
    });
};

export const parseSettingsUpdate = (body: Record<string, unknown>) => {
  const out = parseFields(SETTINGS_FIELDS, body, true);
  if (body.mapEmbedUrl !== undefined) out.mapEmbedUrl = parseMapEmbed(body.mapEmbedUrl);
  if (body.stats !== undefined) out.stats = parseStats(body.stats);
  if (typeof out.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw httpError(400, "Enter a valid email address");
  return out;
};

let tablesEnsured = false;
// Older installs created the base CMS tables lazily; kept so a fresh database still works.
export const ensureCmsTables = async () => {
  if (tablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WebsiteFacility" (
        "id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
        "iconName" TEXT NOT NULL DEFAULT 'building', "imageUrl" TEXT, "order" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "WebsitePublicNotice" (
        "id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'General', "fileUrl" TEXT, "isPinned" BOOLEAN NOT NULL DEFAULT false,
        "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "AdmissionInquiry" (
        "id" SERIAL PRIMARY KEY, "studentName" TEXT NOT NULL, "parentName" TEXT NOT NULL, "email" TEXT NOT NULL,
        "phone" TEXT NOT NULL, "gradeApplyingFor" TEXT NOT NULL, "currentSchool" TEXT, "message" TEXT,
        "status" TEXT NOT NULL DEFAULT 'NEW', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    tablesEnsured = true;
  } catch (e) {
    console.warn("[CMS] Table ensure notice:", (e as any)?.message);
  }
};

// The settings row is created (with starter facilities) only the very first time; after that
// whatever the school deletes stays deleted.
export const getWebsiteSettings = async () => {
  await ensureCmsTables();
  const existing = await prisma.websiteSetting.findFirst();
  if (existing) return existing;
  const created = await prisma.websiteSetting.create({ data: DEFAULT_SETTINGS });
  if ((await prisma.websiteFacility.count()) === 0) {
    await prisma.websiteFacility.createMany({ data: DEFAULT_FACILITIES });
  }
  return created;
};

export const updateWebsiteSettings = async (body: Record<string, unknown>) => {
  const data = parseSettingsUpdate(body ?? {});
  const existing = await getWebsiteSettings();
  return prisma.websiteSetting.update({ where: { id: existing.id }, data: data as any });
};

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

interface CollectionConfig {
  model: string;
  fields: Record<string, FieldSpec>;
  orderBy: Record<string, "asc" | "desc">[];
  publicLimit?: number;
  noun: string;
}

export const COLLECTIONS: Record<string, CollectionConfig> = {
  facilities: {
    model: "websiteFacility",
    noun: "Facility",
    fields: {
      title: { type: "text", max: 120, required: true, min: 2 },
      description: { type: "text", max: 1000, required: true },
      iconName: { type: "enum", values: ICON_NAMES },
      imageUrl: { type: "url" },
      order: { type: "int", min: 0, max: 9999 },
      isActive: { type: "bool" },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  },
  gallery: {
    model: "websiteGalleryItem",
    noun: "Photo",
    fields: {
      title: { type: "text", max: 120, required: true, min: 2 },
      category: { type: "text", max: 40, required: true },
      imageUrl: { type: "url", required: true },
      description: { type: "text", max: 500 },
      order: { type: "int", min: 0, max: 9999 },
      isActive: { type: "bool" },
    },
    orderBy: [{ order: "asc" }, { id: "desc" }],
    publicLimit: 60,
  },
  notices: {
    model: "websitePublicNotice",
    noun: "Notice",
    fields: {
      title: { type: "text", max: 160, required: true, min: 3 },
      content: { type: "text", max: 4000, required: true },
      category: { type: "text", max: 40, required: true },
      fileUrl: { type: "url" },
      isPinned: { type: "bool" },
      publishedAt: { type: "date" },
      isActive: { type: "bool" },
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    publicLimit: 30,
  },
  testimonials: {
    model: "websiteTestimonial",
    noun: "Testimonial",
    fields: {
      name: { type: "text", max: 80, required: true, min: 2 },
      relation: { type: "text", max: 120 },
      quote: { type: "text", max: 800, required: true, min: 10 },
      photoUrl: { type: "url" },
      order: { type: "int", min: 0, max: 9999 },
      isActive: { type: "bool" },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    publicLimit: 12,
  },
  faqs: {
    model: "websiteFaq",
    noun: "FAQ",
    fields: {
      question: { type: "text", max: 200, required: true, min: 5 },
      answer: { type: "text", max: 2000, required: true },
      order: { type: "int", min: 0, max: 9999 },
      isActive: { type: "bool" },
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    publicLimit: 30,
  },
};

const collection = (name: string) => {
  const cfg = COLLECTIONS[name];
  if (!cfg) throw httpError(404, "Unknown content type");
  return cfg;
};
const delegate = (cfg: CollectionConfig) => (prisma as any)[cfg.model];

export const parseCollectionInput = (name: string, body: Record<string, unknown>, partial: boolean) =>
  parseFields(collection(name).fields, body ?? {}, partial);

export const listCollection = async (name: string) => {
  const cfg = collection(name);
  await ensureCmsTables();
  return delegate(cfg).findMany({ orderBy: cfg.orderBy });
};

export const createCollectionItem = async (name: string, body: Record<string, unknown>) => {
  const cfg = collection(name);
  return delegate(cfg).create({ data: parseCollectionInput(name, body, false) });
};

export const updateCollectionItem = async (name: string, id: number, body: Record<string, unknown>) => {
  const cfg = collection(name);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  const data = parseCollectionInput(name, body, true);
  if (Object.keys(data).length === 0) throw httpError(400, "Nothing to update");
  const existing = await delegate(cfg).findUnique({ where: { id } });
  if (!existing) throw httpError(404, `${cfg.noun} not found`);
  return delegate(cfg).update({ where: { id }, data });
};

export const deleteCollectionItem = async (name: string, id: number) => {
  const cfg = collection(name);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  const existing = await delegate(cfg).findUnique({ where: { id } });
  if (!existing) throw httpError(404, `${cfg.noun} not found`);
  await delegate(cfg).delete({ where: { id } });
  return cfg.noun;
};

// A missing table (SQL not applied yet) must not take the whole website down.
const publicList = async (name: string) => {
  const cfg = collection(name);
  try {
    return await delegate(cfg).findMany({ where: { isActive: true }, orderBy: cfg.orderBy, take: cfg.publicLimit });
  } catch (e) {
    console.warn(`[CMS] ${name} unavailable:`, (e as any)?.message);
    return [];
  }
};

export const getPublicWebsiteData = async () => {
  let settings: any;
  try {
    settings = await getWebsiteSettings();
  } catch (e) {
    console.warn("[CMS] settings unavailable:", (e as any)?.message);
    settings = DEFAULT_SETTINGS;
  }
  const [facilities, notices, gallery, testimonials, faqs] = await Promise.all(
    ["facilities", "notices", "gallery", "testimonials", "faqs"].map(publicList)
  );
  return { settings, facilities, notices, gallery, testimonials, faqs };
};

// ---------------------------------------------------------------------------
// Admission enquiries
// ---------------------------------------------------------------------------

export const INQUIRY_STATUSES = ["NEW", "CONTACTED", "ADMITTED", "REJECTED"] as const;
const PHONE_RE = /^[+]?[\d\s-]{7,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseInquiry = (body: Record<string, unknown>) => {
  const data = parseFields(
    {
      studentName: { type: "text", max: 80, required: true, min: 2 },
      parentName: { type: "text", max: 80, required: true, min: 2 },
      phone: { type: "text", max: 20, required: true },
      email: { type: "text", max: 120 },
      gradeApplyingFor: { type: "text", max: 40, required: true },
      currentSchool: { type: "text", max: 120 },
      message: { type: "text", max: 1000 },
    },
    body ?? {},
    false
  ) as Record<string, string | null>;
  if (!PHONE_RE.test(data.phone!)) throw httpError(400, "Enter a valid phone number");
  if (data.email && !EMAIL_RE.test(data.email)) throw httpError(400, "Enter a valid email address");
  return data;
};

export const submitAdmissionInquiry = async (body: Record<string, unknown>) => {
  const data = parseInquiry(body);
  await ensureCmsTables();
  const created = await prisma.admissionInquiry.create({
    data: { ...data, email: data.email ?? "", status: "NEW" } as any,
  });
  return { id: created.id };
};

export const getAdmissionInquiries = async (status?: string) => {
  await ensureCmsTables();
  const where = status && status !== "ALL" ? { status } : {};
  return prisma.admissionInquiry.findMany({ where, orderBy: { createdAt: "desc" } });
};

export const updateInquiryStatus = async (id: number, status: unknown, notes?: unknown) => {
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, "Invalid id");
  if (!INQUIRY_STATUSES.includes(status as any)) throw httpError(400, "Invalid status");
  if (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 2000)) {
    throw httpError(400, "Notes must be text up to 2000 characters");
  }
  const existing = await prisma.admissionInquiry.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Enquiry not found");
  return prisma.admissionInquiry.update({
    where: { id },
    data: { status: status as string, ...(notes !== undefined ? { notes: (notes as string | null)?.trim() || null } : {}) },
  });
};
