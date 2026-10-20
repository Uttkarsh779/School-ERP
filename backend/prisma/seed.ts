// Demo data for manual testing — run with `npm run seed`. Safe to re-run: it wipes all
// operational data first (keeping the superadmin@/admin@ logins and the public website
// CMS content) and rebuilds one consistent 2026-27 session from scratch.
//
// The fee/exam/attendance rows are computed in memory and bulk-inserted instead of going
// through the services one record at a time (a remote Neon round trip is ~300 ms, so the
// per-record path would take over an hour). The calculations mirror the services:
// feeChargeService.generateChargesForClassSection (charges + concessions),
// multiMonthPaymentService.recordMultiMonthPayment (payments/allocations/invoices),
// transportVillageService.calculateTransportFeeForPeriod (FULL_MONTH policy).
//
// "Today" for the data is the day the seed runs; dates are laid out around 2026-27.

import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

// ---------------------------------------------------------------- helpers

// Deterministic RNG so every run produces the same dataset.
let rngState = 20260401;
const rand = () => {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// @db.Date columns are compared against UTC-midnight dates by the API.
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
// DateTime columns written by the services use server-local dates (e.g. due = 10th).
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodCode = (m: number, y: number) => `${MONTHS[m - 1].toUpperCase()}_${y}`;

// createManyAndReturn in chunks (Postgres caps bind parameters per statement).
const insertReturning = async (model: any, rows: any[], size = 500): Promise<any[]> => {
  const out: any[] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(...(await model.createManyAndReturn({ data: rows.slice(i, i + size) })));
  }
  return out;
};
const insert = async (model: any, rows: any[], size = 2000) => {
  for (let i = 0; i < rows.length; i += size) await model.createMany({ data: rows.slice(i, i + size) });
};

const step = (msg: string) => console.log(`• ${msg}`);

// ---------------------------------------------------------------- reference data

const SESSION = { name: "2026-27", startYear: 2026 };
const TODAY = new Date();
const TODAY_UTC = utcDay(TODAY.getFullYear(), TODAY.getMonth() + 1, TODAY.getDate());

// Months of the session that have been billed so far (April .. current month).
const billedMonths: Array<{ month: number; year: number }> = [];
for (let i = 0; i < 12; i++) {
  const month = ((3 + i) % 12) + 1;
  const year = month >= 4 ? SESSION.startYear : SESSION.startYear + 1;
  if (local(year, month, 1) > TODAY) break;
  billedMonths.push({ month, year });
}

type Level = "PRE" | "PRIMARY" | "MIDDLE" | "SECONDARY";
const CLASS_DEFS: Array<{ className: string; sections: string[]; level: Level; grade: number }> = [
  { className: "Nursery", sections: ["A"], level: "PRE", grade: -2 },
  { className: "LKG", sections: ["A"], level: "PRE", grade: -1 },
  { className: "UKG", sections: ["A"], level: "PRE", grade: 0 },
  ...Array.from({ length: 10 }, (_, i) => ({
    className: `Class ${i + 1}`,
    sections: i + 1 === 5 || i + 1 === 8 ? ["A", "B"] : ["A"],
    level: (i + 1 <= 5 ? "PRIMARY" : i + 1 <= 8 ? "MIDDLE" : "SECONDARY") as Level,
    grade: i + 1,
  })),
];
const STUDENTS_PER_SECTION = 8;

// Subject -> periods per week, by level.
const SUBJECTS: Record<Level, Array<[string, number]>> = {
  PRE: [["English", 8], ["Hindi", 8], ["Mathematics", 8], ["EVS", 6], ["Drawing", 4]],
  PRIMARY: [["English", 8], ["Hindi", 7], ["Mathematics", 8], ["EVS", 7], ["Computer", 4]],
  MIDDLE: [["English", 7], ["Hindi", 6], ["Sanskrit", 4], ["Mathematics", 8], ["Science", 8], ["Social Science", 7], ["Computer", 3]],
  SECONDARY: [["English", 8], ["Hindi", 6], ["Mathematics", 9], ["Science", 9], ["Social Science", 8], ["Computer Applications", 4]],
};

// Fee amounts by level (per month unless noted).
const FEES: Record<Level, { tuition: number; annual: number; exam: number; computer: number }> = {
  PRE: { tuition: 1500, annual: 5000, exam: 400, computer: 0 },
  PRIMARY: { tuition: 2000, annual: 6000, exam: 500, computer: 300 },
  MIDDLE: { tuition: 2500, annual: 7000, exam: 700, computer: 300 },
  SECONDARY: { tuition: 3000, annual: 8000, exam: 900, computer: 400 },
};

const TEACHERS: Array<{ name: string; phone: string; qual: string; subjects: string[]; levels: Level[] }> = [
  { name: "Rajesh Sharma", phone: "9876543210", qual: "M.Sc. Mathematics, B.Ed", subjects: ["Mathematics"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Suresh Pandey", phone: "9876543218", qual: "B.Tech, B.Ed", subjects: ["Mathematics"], levels: ["PRIMARY", "MIDDLE"] },
  { name: "Harish Chandra", phone: "9876543225", qual: "M.Sc. Mathematics, B.Ed", subjects: ["Mathematics"], levels: ["PRIMARY", "SECONDARY"] },
  { name: "Amit Gupta", phone: "9876543212", qual: "M.A. English, B.Ed", subjects: ["English"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Shalini Tripathi", phone: "9876543223", qual: "M.A. English, B.Ed", subjects: ["English"], levels: ["PRIMARY", "MIDDLE"] },
  { name: "Farah Khan", phone: "9876543226", qual: "B.A. English Hons, B.Ed", subjects: ["English"], levels: ["PRIMARY"] },
  { name: "Meenakshi Joshi", phone: "9876543217", qual: "M.A. Hindi Literature, B.Ed", subjects: ["Hindi", "Sanskrit"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Ramnaresh Tiwari", phone: "9876543227", qual: "M.A. Sanskrit, B.Ed", subjects: ["Hindi", "Sanskrit"], levels: ["PRIMARY", "MIDDLE"] },
  { name: "Priya Singh", phone: "9876543213", qual: "M.Sc. Physics, M.Ed", subjects: ["Science"], levels: ["SECONDARY", "MIDDLE"] },
  { name: "Vikram Malhotra", phone: "9876543214", qual: "M.Sc. Chemistry, B.Ed", subjects: ["Science"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Sunita Verma", phone: "9876543211", qual: "M.Sc. Botany, B.Ed", subjects: ["EVS", "Science"], levels: ["PRIMARY", "MIDDLE"] },
  { name: "Kavita Reddy", phone: "9876543219", qual: "M.Sc. Zoology, B.Ed", subjects: ["EVS"], levels: ["PRIMARY"] },
  { name: "Neha Kapoor", phone: "9876543215", qual: "M.A. History, B.Ed", subjects: ["Social Science"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Manoj Mishra", phone: "9876543222", qual: "M.A. Geography, M.Phil", subjects: ["Social Science"], levels: ["SECONDARY", "MIDDLE"] },
  { name: "Anil Kumar", phone: "9876543216", qual: "M.Tech CSE", subjects: ["Computer", "Computer Applications"], levels: ["MIDDLE", "SECONDARY"] },
  { name: "Nikhil Arora", phone: "9876543228", qual: "MCA", subjects: ["Computer"], levels: ["PRIMARY", "MIDDLE"] },
  { name: "Pooja Bhatt", phone: "9876543229", qual: "Diploma in Early Childhood Education", subjects: ["English", "Mathematics", "EVS"], levels: ["PRE"] },
  { name: "Rekha Iyer", phone: "9876543230", qual: "NTT, B.A.", subjects: ["Hindi", "English", "Mathematics", "EVS"], levels: ["PRE"] },
  { name: "Ritu Agarwal", phone: "9876543221", qual: "B.F.A. Fine Arts", subjects: ["Drawing"], levels: ["PRE"] },
  { name: "Deepak Saxena", phone: "9876543220", qual: "M.P.Ed", subjects: [], levels: [] },
];

const SUPPORT_STAFF: Array<{ name: string; phone: string; category: string; qual?: string; email?: string }> = [
  { name: "Dr. Alok Srivastava", phone: "9811000001", category: "PRINCIPAL", qual: "Ph.D. Education", email: "principal@school.com" },
  { name: "Seema Rawat", phone: "9811000002", category: "COORDINATOR", qual: "M.A., B.Ed", email: "coordinator@school.com" },
  { name: "Ramesh Yadav", phone: "9811000003", category: "OFFICE_STAFF", qual: "B.Com", email: "office@school.com" },
  { name: "Ramu Yadav", phone: "9811000004", category: "DRIVER", email: "driver.ramu@school.internal" },
  { name: "Balwinder Singh", phone: "9811000005", category: "DRIVER", email: "driver.balwinder@school.internal" },
  { name: "Mohan Lal", phone: "9811000006", category: "DRIVER", email: "driver.mohan@school.internal" },
  { name: "Shankar Prasad", phone: "9811000007", category: "GUARD", email: "guard.shankar@school.internal" },
  { name: "Kamla Devi", phone: "9811000008", category: "CLEANING_STAFF", email: "cleaning.kamla@school.internal" },
];

const BOY_NAMES = ["Aarav", "Vivaan", "Aditya", "Kabir", "Reyansh", "Arjun", "Sai", "Ishaan", "Krishna", "Rohan", "Dhruv", "Atharv", "Ayaan", "Shaurya", "Vihaan", "Laksh", "Rudra", "Yash", "Pranav", "Harsh", "Tanmay", "Om", "Dev", "Parth"];
const GIRL_NAMES = ["Ananya", "Diya", "Ishani", "Myra", "Saanvi", "Aadhya", "Kiara", "Pari", "Anika", "Navya", "Riya", "Sara", "Avni", "Kavya", "Meera", "Tanvi", "Prisha", "Siya", "Aarohi", "Nisha", "Jhanvi", "Khushi", "Mahi", "Vanya"];
const SURNAMES = ["Sharma", "Verma", "Gupta", "Singh", "Yadav", "Mishra", "Pandey", "Tiwari", "Chauhan", "Rajput", "Saxena", "Agarwal", "Kushwaha", "Maurya", "Patel", "Joshi", "Dubey", "Srivastava", "Rathore", "Thakur", "Khan", "Ansari", "Jaiswal", "Bansal", "Prajapati", "Nishad", "Gautam", "Rawat"];
const FATHER_NAMES = ["Ramesh", "Suresh", "Mahesh", "Rakesh", "Dinesh", "Sanjay", "Ajay", "Vijay", "Manoj", "Pankaj", "Anil", "Sunil", "Rajeev", "Alok", "Pradeep", "Naveen", "Vinod", "Ashok", "Santosh", "Deepak"];
const MOTHER_NAMES = ["Sunita", "Anita", "Kavita", "Rekha", "Pooja", "Neelam", "Seema", "Rita", "Geeta", "Mamta", "Suman", "Asha", "Usha", "Preeti", "Shalini", "Kiran", "Meena", "Sarita", "Nirmala", "Archana"];
const LOCALITIES = ["Civil Lines", "Station Road", "Gandhi Nagar", "Nehru Colony", "Shastri Nagar", "Ram Bagh", "Subhash Chowk", "Kalyanpur"];
const PREV_SCHOOLS = ["Saraswati Shishu Mandir", "St. Mary's Convent School", "Govt. Primary School, Rampur", "Little Flower Public School", "Kendriya Vidyalaya No. 2", "DAV Public School"];
const BLOOD_GROUPS = ["A+", "A+", "B+", "B+", "B+", "O+", "O+", "O+", "AB+", "A-", "B-", "O-"];

const VILLAGES = [
  { name: "Rampur", fee: 1200 },
  { name: "Lakshmipur", fee: 1500 },
  { name: "Haripur", fee: 1800 },
  { name: "Madhopur", fee: 2000 },
  { name: "Shivnagar", fee: 2200 },
  { name: "Rajapur", fee: 2500 },
  { name: "Chandipur", fee: 1700 },
  { name: "Sultanpur", fee: 2800 },
];

// ---------------------------------------------------------------- 1. wipe

async function wipe() {
  step("Wiping operational data (keeping superadmin/admin logins and website CMS content)...");
  const keep = new Set(["User", "_prisma_migrations"]);
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const toTruncate = tables.map((t) => t.tablename).filter((t) => !keep.has(t) && !t.startsWith("Website"));
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${toTruncate.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
  await prisma.user.deleteMany({ where: { email: { notIn: ["superadmin@school.com", "admin@school.com"] } } });
}

// ---------------------------------------------------------------- main

async function main() {
  const started = Date.now();
  await wipe();

  // ---------- admin accounts
  const [superAdminHash, adminHash, teacherHash, studentHash, staffHash] = await Promise.all([
    hashPassword("superadmin123"),
    hashPassword("admin123"),
    hashPassword("teacher123"),
    hashPassword("student123"),
    hashPassword("staff123"),
  ]);
  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@school.com" },
    update: { role: "SUPER_ADMIN", isActive: true },
    create: { email: "superadmin@school.com", passwordHash: superAdminHash, role: "SUPER_ADMIN", name: "System Super Admin" },
  });
  const admin = await prisma.user.upsert({
    where: { email: "admin@school.com" },
    update: { role: "ADMIN", isActive: true },
    create: { email: "admin@school.com", passwordHash: adminHash, role: "ADMIN", name: "School Admin" },
  });
  step(`Admin logins ready: ${superAdmin.email}, ${admin.email}`);

  // ---------- session
  const session = await prisma.academicSession.create({
    data: {
      name: SESSION.name,
      isCurrent: true,
      startDate: local(SESSION.startYear, 4, 1),
      endDate: local(SESSION.startYear + 1, 3, 31),
    },
  });
  await prisma.academicSession.create({
    data: { name: "2027-28", isCurrent: false, startDate: local(2027, 4, 1), endDate: local(2028, 3, 31) },
  });

  // ---------- staff
  const emailFor = (name: string) => `${name.toLowerCase().replace(/^dr\.\s*/, "").replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@school.com`;
  const accountRequired = new Set(["TEACHER", "PRINCIPAL", "VICE_PRINCIPAL", "COORDINATOR", "ADMIN_STAFF", "OFFICE_STAFF"]);

  const staffUsers = await insertReturning(prisma.user, [
    ...TEACHERS.map((t) => ({ email: emailFor(t.name), passwordHash: teacherHash, role: "TEACHER", name: t.name })),
    ...SUPPORT_STAFF.map((s) => ({
      email: s.email!,
      passwordHash: staffHash,
      role: s.category === "ADMIN_STAFF" ? "ADMIN" : "TEACHER",
      name: s.name,
      isActive: accountRequired.has(s.category), // mirrors staff/service.createStaff
    })),
  ]);
  const staffRows = await insertReturning(prisma.staff, [
    ...TEACHERS.map((t, i) => ({
      userId: staffUsers[i].id,
      staffCategory: "TEACHER",
      qualifications: t.qual,
      contact: t.phone,
      address: `${randInt(1, 200)}, ${pick(LOCALITIES)}, Sitapur`,
    })),
    ...SUPPORT_STAFF.map((s, i) => ({
      userId: staffUsers[TEACHERS.length + i].id,
      staffCategory: s.category,
      qualifications: s.qual ?? null,
      contact: s.phone,
      address: `${randInt(1, 200)}, ${pick(LOCALITIES)}, Sitapur`,
    })),
  ]);
  const teacherStaff = staffRows.slice(0, TEACHERS.length).map((row, i) => ({ ...row, def: TEACHERS[i], user: staffUsers[i] }));
  const supportStaff = staffRows.slice(TEACHERS.length).map((row, i) => ({ ...row, def: SUPPORT_STAFF[i], user: staffUsers[TEACHERS.length + i] }));
  const staffUserByStaffId = new Map<number, number>(staffRows.map((s) => [s.id, s.userId]));
  step(`Created ${teacherStaff.length} teachers and ${supportStaff.length} support staff`);

  // ---------- class sections (class teachers assigned round-robin)
  const sectionDefs = CLASS_DEFS.flatMap((c) => c.sections.map((section) => ({ ...c, section })));
  const classTeacherOrder = [16, 17, 5, 10, 11, 4, 1, 2, 7, 12, 13, 8, 9, 0, 3]; // indexes into TEACHERS
  const sections = await insertReturning(
    prisma.classSection,
    sectionDefs.map((d, i) => ({
      sessionId: session.id,
      className: d.className,
      section: d.section,
      classTeacherId: teacherStaff[classTeacherOrder[i % classTeacherOrder.length]].id,
    }))
  );
  const sectionInfo = sections.map((s, i) => ({ ...s, def: sectionDefs[i] }));
  step(`Created ${sections.length} class sections`);

  // ---------- subjects + teacher allocation (least-loaded eligible teacher)
  const load = new Map<number, number>(teacherStaff.map((t) => [t.id, 0]));
  const subjectRows = await insertReturning(
    prisma.subject,
    sectionInfo.flatMap((s) => SUBJECTS[s.def.level].map(([name]) => ({ name, classSectionId: s.id })))
  );
  const subjectTeacher = new Map<number, (typeof teacherStaff)[number]>(); // subjectId -> teacher
  for (const sub of subjectRows) {
    const sec = sectionInfo.find((s) => s.id === sub.classSectionId)!;
    const periods = SUBJECTS[sec.def.level].find(([n]) => n === sub.name)![1];
    const eligible = teacherStaff.filter((t) => t.def.subjects.includes(sub.name) && t.def.levels.includes(sec.def.level));
    const pool = eligible.length ? eligible : teacherStaff.filter((t) => t.def.subjects.includes(sub.name));
    const teacher = pool.sort((a, b) => load.get(a.id)! - load.get(b.id)!)[0];
    load.set(teacher.id, load.get(teacher.id)! + periods);
    subjectTeacher.set(sub.id, teacher);
  }
  await insert(
    prisma.teacherSubject,
    subjectRows.map((sub) => ({ staffId: subjectTeacher.get(sub.id)!.id, subjectId: sub.id }))
  );
  const subjectsBySection = new Map<number, any[]>();
  for (const sub of subjectRows) {
    if (!subjectsBySection.has(sub.classSectionId)) subjectsBySection.set(sub.classSectionId, []);
    subjectsBySection.get(sub.classSectionId)!.push(sub);
  }
  step(`Created ${subjectRows.length} subjects with teacher allocation`);

  // ---------- timetable: 6 days x 8 periods, no teacher double-booked, max 2 of a subject per day
  const busy = new Set<string>(); // staffId:day:period
  const slots: any[] = [];
  for (const sec of sectionInfo) {
    const subs = subjectsBySection.get(sec.id)!;
    const remaining = new Map<number, number>(
      subs.map((sub) => [sub.id, SUBJECTS[sec.def.level].find(([n]) => n === sub.name)![1]])
    );
    for (let day = 1; day <= 6; day++) {
      const perDay = new Map<number, number>();
      const periodsToday = day === 6 ? 6 : 8; // Saturday is a short day
      for (let period = 1; period <= periodsToday; period++) {
        const candidates = subs
          .filter((sub) => remaining.get(sub.id)! > 0 && (perDay.get(sub.id) ?? 0) < 2)
          .filter((sub) => !busy.has(`${subjectTeacher.get(sub.id)!.id}:${day}:${period}`))
          .sort((a, b) => remaining.get(b.id)! - remaining.get(a.id)! || (perDay.get(a.id) ?? 0) - (perDay.get(b.id) ?? 0));
        const chosen = candidates[(day + period) % Math.min(2, candidates.length || 1)] ?? candidates[0];
        if (!chosen) continue; // free period
        const teacher = subjectTeacher.get(chosen.id)!;
        busy.add(`${teacher.id}:${day}:${period}`);
        remaining.set(chosen.id, remaining.get(chosen.id)! - 1);
        perDay.set(chosen.id, (perDay.get(chosen.id) ?? 0) + 1);
        slots.push({
          classSectionId: sec.id,
          dayOfWeek: day,
          periodNumber: period,
          subjectId: chosen.id,
          staffId: teacher.id,
          room: chosen.name.startsWith("Computer") ? "Computer Lab" : chosen.name === "Science" && period >= 6 ? "Science Lab" : `Room ${100 + sec.id}`,
        });
      }
    }
  }
  await insert(prisma.timetableSlot, slots);
  step(`Created ${slots.length} timetable periods`);

  // ---------- families & students
  type Family = {
    idx: number;
    surname: string;
    father: string;
    mother: string;
    fatherContact: string;
    motherContact: string;
    address: string;
    category: string;
    staffParent?: (typeof supportStaff)[number] | (typeof teacherStaff)[number];
    relationship: string;
    kids: number;
  };
  const totalStudents = sectionInfo.length * STUDENTS_PER_SECTION;
  const families: Family[] = [];
  let kidsPlanned = 0;
  while (kidsPlanned < totalStudents) {
    const idx = families.length + 1;
    const kids = Math.min(totalStudents - kidsPlanned, idx % 9 === 0 ? 2 : idx === 20 || idx === 47 ? 3 : 1);
    const surname = pick(SURNAMES);
    families.push({
      idx,
      surname,
      father: `${pick(FATHER_NAMES)} ${surname}`,
      mother: `${pick(MOTHER_NAMES)} ${surname}`,
      fatherContact: `9${randInt(100000000, 999999999)}`,
      motherContact: `8${randInt(100000000, 999999999)}`,
      address: `House ${randInt(1, 350)}, ${pick(LOCALITIES)}, Sitapur, Uttar Pradesh - 261001`,
      category: pick(["GENERAL", "GENERAL", "GENERAL", "GENERAL", "OBC", "OBC", "OBC", "SC", "SC", "ST", "EWS"]),
      relationship: idx % 11 === 0 ? "Mother" : idx % 17 === 0 ? "Guardian" : "Father",
      kids,
    });
    kidsPlanned += kids;
  }
  // Two staff-child families: a teacher's children and a driver's child. Both get the
  // staff-child discount (it follows employment, not whether the staff member can log in).
  const teacherParent = teacherStaff.find((t) => t.def.name === "Suresh Pandey")!;
  const driverParent = supportStaff.find((s) => s.def.name === "Ramu Yadav")!;
  const f9 = families[8];
  Object.assign(f9, { surname: "Pandey", father: "Suresh Pandey", mother: "Anita Pandey", fatherContact: teacherParent.contact, staffParent: teacherParent });
  const f15 = families[14];
  Object.assign(f15, { surname: "Yadav", father: "Ramu Yadav", mother: "Geeta Yadav", fatherContact: driverParent.contact, staffParent: driverParent });

  // Spread kids over sections so siblings land in different classes.
  const seatsLeft = new Map<number, number>(sectionInfo.map((s) => [s.id, STUDENTS_PER_SECTION]));
  type Kid = { family: Family; sectionId: number; order: number; gender: "MALE" | "FEMALE" };
  const kids: Kid[] = [];
  for (const fam of [...families].sort((a, b) => b.kids - a.kids)) {
    const used = new Set<string>();
    for (let k = 0; k < fam.kids; k++) {
      const options = sectionInfo.filter((s) => seatsLeft.get(s.id)! > 0 && !used.has(s.def.className));
      const sec = options.length ? pick(options) : sectionInfo.find((s) => seatsLeft.get(s.id)! > 0)!;
      seatsLeft.set(sec.id, seatsLeft.get(sec.id)! - 1);
      used.add(sec.def.className);
      kids.push({ family: fam, sectionId: sec.id, order: 0, gender: chance(0.5) ? "MALE" : "FEMALE" });
    }
  }
  // Sibling order: eldest (highest grade) = 1.
  for (const fam of families) {
    const own = kids.filter((k) => k.family === fam);
    own.sort((a, b) => sectionInfo.find((s) => s.id === b.sectionId)!.def.grade - sectionInfo.find((s) => s.id === a.sectionId)!.def.grade);
    own.forEach((k, i) => (k.order = i + 1));
  }

  // Students that joined mid-session (fees start from their admission month) and two who
  // left mid-year (inactive; billed until they left).
  const usedNames = new Set<string>();
  const aadhars = new Set<string>();
  const uniqueDigits = (prefix: string, len: number, used: Set<string>) => {
    let v = "";
    do v = prefix + String(randInt(10 ** (len - prefix.length - 1), 10 ** (len - prefix.length) - 1));
    while (used.has(v));
    used.add(v);
    return v;
  };
  const apaars = new Set<string>();

  type StudentPlan = {
    kid: Kid;
    name: string;
    admissionNo: string;
    admissionDate: Date;
    joinMonthIdx: number; // index into billedMonths from which they are billed (0 = April)
    leftMonthIdx: number | null; // last billed month index for students who left
    ability: number;
    attendanceRate: number;
    payProfile: "REGULAR" | "MONTHLY" | "DEFAULTER" | "PARTIAL" | "ADVANCE" | "NONE";
    hasLogin: boolean;
    data: any;
  };
  const plans: StudentPlan[] = [];
  const admCounter = new Map<number, number>();
  kids.forEach((kid, n) => {
    const sec = sectionInfo.find((s) => s.id === kid.sectionId)!;
    let first = "";
    do first = pick(kid.gender === "MALE" ? BOY_NAMES : GIRL_NAMES);
    while (usedNames.has(`${first} ${kid.family.surname}`));
    const name = `${first} ${kid.family.surname}`;
    usedNames.add(name);

    // Joined in Nursery typically; some joined later from another school.
    const gradeIdx = sec.def.grade + 2; // Nursery = 0
    const joinedLater = gradeIdx > 0 && chance(0.35);
    const yearsAgo = joinedLater ? randInt(0, gradeIdx - 1) : gradeIdx;
    let admYear = SESSION.startYear - yearsAgo;
    let admDate = local(admYear, 4, randInt(1, 15));
    let joinMonthIdx = 0;
    if (n % 37 === 5 && billedMonths.length > 4) {
      // fresh mid-session admission (July/August)
      joinMonthIdx = n % 2 === 0 ? 3 : 4;
      const jm = billedMonths[joinMonthIdx];
      admYear = jm.year;
      admDate = local(jm.year, jm.month, randInt(2, 12));
    }
    const seq = (admCounter.get(admYear) ?? 0) + 1;
    admCounter.set(admYear, seq);
    const admissionNo = `ADM${admYear}${String(seq).padStart(3, "0")}`;

    const age = sec.def.grade + 5; // age at start of session
    const dob = local(SESSION.startYear - age - (chance(0.4) ? 1 : 0), randInt(1, 12), randInt(1, 28));

    const ability = clamp(0.62 + (rand() - 0.5) * 0.6 + (rand() - 0.5) * 0.2, 0.22, 0.98);
    const attendanceRate = n % 23 === 7 ? 0.72 : clamp(0.9 + rand() * 0.09, 0, 0.99);
    const profileRoll = rand();
    const payProfile: StudentPlan["payProfile"] =
      profileRoll < 0.52 ? "REGULAR" : profileRoll < 0.68 ? "MONTHLY" : profileRoll < 0.8 ? "DEFAULTER" : profileRoll < 0.9 ? "PARTIAL" : profileRoll < 0.94 ? "ADVANCE" : "NONE";
    const leftMonthIdx = n === 40 || n === 77 ? Math.min(4, billedMonths.length - 1) : null;

    plans.push({
      kid,
      name,
      admissionNo,
      admissionDate: admDate,
      joinMonthIdx,
      leftMonthIdx,
      ability,
      attendanceRate,
      payProfile,
      hasLogin: true, // every student has a login; parents never do
      data: {
        admissionNo,
        admissionDate: admDate,
        name,
        rollNo: "", // set after sorting by name
        classSectionId: sec.id,
        dob,
        gender: kid.gender,
        bloodGroup: pick(BLOOD_GROUPS),
        fatherName: kid.family.father,
        fatherContact: kid.family.fatherContact,
        motherName: kid.family.mother,
        motherContact: kid.family.motherContact,
        aadharNumber: chance(0.92) ? uniqueDigits(String(randInt(2, 9)), 12, aadhars) : null,
        apaarId: sec.def.grade >= 1 && chance(0.8) ? uniqueDigits("1", 12, apaars) : null,
        category: kid.family.category,
        address: kid.family.address,
        contactNumber: kid.family.fatherContact,
        nationality: "Indian",
        previousSchool: joinedLater || joinMonthIdx > 0 ? pick(PREV_SCHOOLS) : null,
        isActive: leftMonthIdx === null,
      },
    });
  });
  // Roll numbers alphabetical within a section.
  for (const sec of sectionInfo) {
    plans
      .filter((p) => p.data.classSectionId === sec.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p, i) => (p.data.rollNo = String(i + 1)));
  }

  // Student logins (not for pre-primary — they use their parent's login).
  const studentUserRows = plans
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.hasLogin)
    .map(({ p, i }) => ({ email: `student${i + 1}@school.com`, passwordHash: studentHash, role: "STUDENT", name: p.name, isActive: p.data.isActive }));
  const studentUsers = await insertReturning(prisma.user, studentUserRows);
  const studentUserByEmail = new Map(studentUsers.map((u) => [u.email, u.id]));
  plans.forEach((p, i) => {
    p.data.userId = p.hasLogin ? studentUserByEmail.get(`student${i + 1}@school.com`) : null;
  });
  const students = await insertReturning(prisma.student, plans.map((p) => p.data));
  const planByStudentId = new Map<number, StudentPlan>();
  students.forEach((s, i) => planByStudentId.set(s.id, plans[i]));
  const studentIdOf = (p: StudentPlan) => students[plans.indexOf(p)].id;

  // Parents
  const parentFamilies = families.filter((f) => !f.staffParent);
  const guardians = await insertReturning(
    prisma.parentGuardian,
    families.map((f) => {
      const staffUserId = f.staffParent?.userId;
      const name = f.relationship === "Mother" ? f.mother : f.father;
      return {
        userId: staffUserId ?? null, // family record only — a staff parent links to their staff user
        name,
        email: staffUserId ? null : `${f.father.toLowerCase().replace(/[^a-z]+/g, ".")}${f.idx}@example.com`,
        contact: f.relationship === "Mother" ? f.motherContact : f.fatherContact,
        address: f.address,
      };
    })
  );
  const guardianByFamily = new Map<Family, any>(families.map((f, i) => [f, guardians[i]]));
  await insert(
    prisma.parentStudent,
    plans.map((p) => ({
      parentId: guardianByFamily.get(p.kid.family).id,
      studentId: studentIdOf(p),
      relationshipType: p.kid.family.staffParent ? "Staff Parent" : p.kid.family.relationship,
      isPrimary: true,
      siblingOrder: p.kid.order,
    }))
  );
  step(`Created ${students.length} students (${studentUsers.length} with logins), ${families.length} families, ${families.filter((f) => f.kids > 1).length} with siblings`);

  // ---------- transport: routes, vehicles, villages, assignments
  const routes = await insertReturning(prisma.transportRoute, [
    { routeName: "Route 1 - North", stops: "Rampur, Haripur, Sultanpur" },
    { routeName: "Route 2 - East", stops: "Lakshmipur, Madhopur, Chandipur" },
    { routeName: "Route 3 - South", stops: "Shivnagar, Rajapur" },
  ]);
  const drivers = supportStaff.filter((s) => s.def.category === "DRIVER");
  await insert(prisma.vehicle, [
    { vehicleNo: "UP34 AT 4521", driverName: drivers[0].def.name, driverContact: drivers[0].def.phone, ownerName: "School", ownerContact: "9811000100", capacity: 40, routeId: routes[0].id },
    { vehicleNo: "UP34 BT 1187", driverName: drivers[1].def.name, driverContact: drivers[1].def.phone, ownerName: "School", ownerContact: "9811000100", capacity: 32, routeId: routes[1].id },
    { vehicleNo: "UP34 CT 9043", driverName: drivers[2].def.name, driverContact: drivers[2].def.phone, ownerName: "Sharma Travels", ownerContact: "9811000200", capacity: 26, routeId: routes[2].id },
  ]);
  const villages = await insertReturning(prisma.transportVillage, VILLAGES.map((v) => ({ name: v.name, monthlyFee: v.fee })));
  // History: every village from session start; Sultanpur's fee went up from October.
  const feeHistory = villages.map((v, i) => ({ villageId: v.id, monthlyFee: VILLAGES[i].fee, effectiveDate: local(SESSION.startYear, 4, 1) }));
  const sultanpur = villages.find((v) => v.name === "Sultanpur")!;
  feeHistory.push({ villageId: sultanpur.id, monthlyFee: 3000, effectiveDate: local(SESSION.startYear, 10, 1) });
  await insert(prisma.villageFeeHistory, feeHistory);
  await prisma.transportVillage.update({ where: { id: sultanpur.id }, data: { monthlyFee: 3000 } });
  const villageFeeAt = (villageId: number, monthEnd: Date) =>
    feeHistory
      .filter((h) => h.villageId === villageId && h.effectiveDate <= monthEnd)
      .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0]?.monthlyFee ?? 0;

  const transportPlans: Array<{ studentId: number; villageId: number; start: Date; end: Date | null; status: string; reason?: string }> = [];
  plans.forEach((p, i) => {
    if (i % 3 !== 0) return; // roughly a third use the bus
    const village = villages[i % villages.length];
    const start = i % 3 === 0 && p.joinMonthIdx > 0 ? p.admissionDate : local(SESSION.startYear, 4, 1);
    const discontinued = i === 30;
    transportPlans.push({
      studentId: studentIdOf(p),
      villageId: village.id,
      start,
      end: discontinued ? local(SESSION.startYear, 8, 31) : null,
      status: discontinued ? "DISCONTINUED" : "ACTIVE",
      reason: discontinued ? "Family shifted closer to school" : undefined,
    });
  });
  await insert(
    prisma.studentTransportAssignment,
    transportPlans.map((t) => ({
      studentId: t.studentId,
      villageId: t.villageId,
      monthlyFee: villages.find((v) => v.id === t.villageId)!.monthlyFee,
      startDate: t.start,
      endDate: t.end,
      status: t.status,
      policy: "FULL_MONTH",
      discontinuedAt: t.end,
      discontinueReason: t.reason ?? null,
    }))
  );
  // Legacy route link on the student record (shown on the transport card).
  for (const route of routes) {
    const ids = transportPlans
      .filter((t) => t.status === "ACTIVE" && route.stops.includes(villages.find((v) => v.id === t.villageId)!.name))
      .map((t) => t.studentId);
    if (ids.length) await prisma.student.updateMany({ where: { id: { in: ids } }, data: { transportRouteId: route.id } });
  }
  step(`Transport: ${routes.length} routes, 3 vehicles, ${villages.length} villages, ${transportPlans.length} student assignments`);

  // ---------- fee heads, structures, assignments, concessions
  const heads = await insertReturning(prisma.feeHead, [
    { name: "Tuition Fee", code: "TUITION", description: "Monthly tuition", isRecurring: true },
    { name: "Annual Charges", code: "ANNUAL", description: "Charged once in April", isRecurring: false },
    { name: "Examination Fee", code: "EXAM", description: "Half-yearly and annual exams", isRecurring: false },
    { name: "Computer Fee", code: "COMPUTER", description: "Computer lab (Class 1 onwards)", isRecurring: true },
    { name: "Transport Fee", code: "TRANSPORT", description: "Village-based student transportation fee", isRecurring: true },
  ]);
  const head = (code: string) => heads.find((h) => h.code === code)!;
  const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const structureItems = new Map<number, Array<{ feeHeadId: number; amount: number; months: number[]; itemId?: number }>>();
  for (const sec of sectionInfo) {
    const f = FEES[sec.def.level];
    const items = [
      { feeHeadId: head("TUITION").id, amount: f.tuition, months: ALL_MONTHS },
      { feeHeadId: head("ANNUAL").id, amount: f.annual, months: [4] },
      { feeHeadId: head("EXAM").id, amount: f.exam, months: [9, 2] },
      ...(f.computer ? [{ feeHeadId: head("COMPUTER").id, amount: f.computer, months: ALL_MONTHS }] : []),
    ];
    const structure = await prisma.feeStructure.create({
      data: {
        sessionId: session.id,
        classSectionId: sec.id,
        name: `${sec.def.className}-${sec.section} Fee Structure ${SESSION.name}`,
        description: `Standard fee plan for ${sec.def.className} ${sec.section}`,
        items: {
          create: items.map((it) => ({
            feeHeadId: it.feeHeadId,
            amount: it.amount,
            frequency: it.months.length === 12 ? "MONTHLY" : it.months.length === 1 ? "ANNUAL" : "ONE_TIME",
            applicableMonths: it.months,
            dueDateDay: 10,
            effectiveFrom: local(SESSION.startYear, 4, 1),
          })),
        },
      },
      include: { items: true },
    });
    structureItems.set(sec.id, items.map((it) => ({ ...it, itemId: structure.items.find((x: any) => x.feeHeadId === it.feeHeadId)?.id })));
    (sec as any).feeStructureId = structure.id;
  }
  await insert(
    prisma.studentFeeAssignment,
    plans.map((p) => ({
      studentId: studentIdOf(p),
      feeStructureId: (sectionInfo.find((s) => s.id === p.data.classSectionId) as any).feeStructureId,
      joiningMonth: billedMonths[p.joinMonthIdx]?.month ?? 4,
      joiningDatePolicy: "FULL_MONTH",
      status: p.leftMonthIdx !== null ? "LEFT_MID_YEAR" : "ACTIVE",
    }))
  );
  await prisma.lateFeeRule.create({
    data: {
      sessionId: session.id,
      gracePeriodDays: 5,
      feeType: "SLAB",
      amount: 0,
      slabsJson: JSON.stringify([
        { uptoDays: 15, amount: 50 },
        { uptoDays: 30, amount: 100 },
        { uptoDays: null, amount: 200 },
      ]),
    },
  });

  const tuitionId = head("TUITION").id;
  const transportId = head("TRANSPORT").id;
  const sessionStart = local(SESSION.startYear, 4, 1);
  const sessionEnd = local(SESSION.startYear + 1, 3, 31);
  const schemes = await insertReturning(prisma.concessionScheme, [
    { name: "Merit Scholarship", type: "SCHOLARSHIP", calculationType: "PERCENTAGE", value: 50, applicableHeads: [tuitionId] },
    {
      name: "Sibling Discount",
      type: "SIBLING_DISCOUNT",
      calculationType: "PERCENTAGE",
      value: 10,
      applicableHeads: [tuitionId],
      configJson: JSON.stringify({ "2": { value: 10, calculationType: "PERCENTAGE" }, "3": { value: 15, calculationType: "PERCENTAGE" } }),
    },
    {
      name: "Staff Child Discount",
      type: "STAFF_CHILD",
      calculationType: "PERCENTAGE",
      value: 50,
      applicableHeads: [tuitionId],
      configJson: JSON.stringify({
        TEACHER: { value: 50, calculationType: "PERCENTAGE" },
        DRIVER: { value: 40, calculationType: "PERCENTAGE" },
        CLEANING_STAFF: { value: 50, calculationType: "PERCENTAGE" },
      }),
    },
    { name: "Transport Concession", type: "TRANSPORT_CONCESSION", calculationType: "PERCENTAGE", value: 50, applicableHeads: [transportId] },
    { name: "Financial Hardship", type: "SPECIAL_CONCESSION", calculationType: "FIXED_AMOUNT", value: 500, applicableHeads: [tuitionId] },
  ]);
  const scheme = (type: string) => schemes.find((s) => s.type === type)!;

  // Student-specific concessions (scholarships x2, transport x1, hardship x1).
  const topPlans = [...plans].filter((p) => p.data.isActive && p.joinMonthIdx === 0).sort((a, b) => b.ability - a.ability);
  const busActive = transportPlans.filter((t) => t.status === "ACTIVE");
  const concessionDefs = [
    { plan: topPlans[0], type: "SCHOLARSHIP", calc: "PERCENTAGE", value: 50, heads: [tuitionId], reason: "Merit Scholarship - topper 2025-26", scheme: scheme("SCHOLARSHIP") },
    { plan: topPlans[1], type: "SCHOLARSHIP", calc: "PERCENTAGE", value: 50, heads: [tuitionId], reason: "Merit Scholarship - district olympiad", scheme: scheme("SCHOLARSHIP") },
    { plan: planByStudentId.get(busActive[2].studentId)!, type: "TRANSPORT_CONCESSION", calc: "PERCENTAGE", value: 50, heads: [transportId], reason: "Long distance - 50% bus concession", scheme: scheme("TRANSPORT_CONCESSION") },
    { plan: plans.find((p) => p.payProfile === "PARTIAL" && p.joinMonthIdx === 0)!, type: "SPECIAL_CONCESSION", calc: "FIXED_AMOUNT", value: 500, heads: [tuitionId], reason: "Financial hardship (single parent)", scheme: scheme("SPECIAL_CONCESSION") },
  ];
  const studentConcessions = await insertReturning(
    prisma.studentConcession,
    concessionDefs.map((c) => ({
      studentId: studentIdOf(c.plan),
      concessionSchemeId: c.scheme.id,
      type: c.type,
      calculationType: c.calc,
      value: c.value,
      applicableHeads: c.heads,
      startsFrom: sessionStart,
      endsOn: sessionEnd,
      reason: c.reason,
      approvedByUserId: superAdmin.id,
      status: "ACTIVE",
    }))
  );
  step(`Fees: ${heads.length} heads, ${sectionInfo.length} class fee structures, late-fee rule, ${schemes.length} concession schemes, ${studentConcessions.length} student concessions`);

  // ---------- fee charges (mirrors generateChargesForClassSection + concession engine)
  type ChargePlan = {
    studentId: number;
    feeHeadId: number;
    feeStructureItemId: number | null;
    month: number;
    year: number;
    dueDate: Date;
    base: number;
    discount: number;
    net: number;
    paid: number;
    adjustments: Array<{ type: string; amount: number; reason: string; studentConcessionId: number | null }>;
    id?: number;
  };
  const charges: ChargePlan[] = [];
  const chargesByStudentMonth = new Map<string, ChargePlan[]>();
  for (const p of plans) {
    const studentId = studentIdOf(p);
    const items = structureItems.get(p.data.classSectionId)!;
    const lastIdx = p.leftMonthIdx ?? billedMonths.length - 1;
    for (let mi = p.joinMonthIdx; mi <= lastIdx; mi++) {
      const { month, year } = billedMonths[mi];
      const monthStart = local(year, month, 1);
      const monthEnd = local(year, month + 1, 0);
      const lineItems: Array<{ feeHeadId: number; amount: number; itemId: number | null }> = items
        .filter((it) => it.months.includes(month))
        .map((it) => ({ feeHeadId: it.feeHeadId, amount: it.amount, itemId: it.itemId ?? null }));
      for (const t of transportPlans.filter((t) => t.studentId === studentId)) {
        if (t.start <= monthEnd && (!t.end || t.end >= monthStart)) {
          lineItems.push({ feeHeadId: transportId, amount: villageFeeAt(t.villageId, monthEnd), itemId: null });
        }
      }

      // Concessions in the engine's order: scholarship, sibling, staff child, others.
      const remaining = new Map(lineItems.map((li) => [li.feeHeadId, li.amount]));
      const applied: Array<{ feeHeadId: number; type: string; amount: number; reason: string; studentConcessionId: number | null }> = [];
      const apply = (headId: number, pct: number | null, fixed: number | null, type: string, reason: string, scId: number | null) => {
        const base = lineItems.find((li) => li.feeHeadId === headId)?.amount ?? 0;
        const want = pct !== null ? (base * pct) / 100 : fixed ?? 0;
        const amt = Math.min(want, remaining.get(headId) ?? 0);
        if (amt > 0) {
          remaining.set(headId, remaining.get(headId)! - amt);
          applied.push({ feeHeadId: headId, type, amount: amt, reason, studentConcessionId: scId });
        }
      };
      const mine = concessionDefs.map((c, i) => ({ c, sc: studentConcessions[i] })).filter(({ c }) => c.plan === p);
      for (const { c, sc } of mine.filter(({ c }) => c.type === "SCHOLARSHIP")) {
        for (const h of c.heads) if ((remaining.get(h) ?? 0) > 0) apply(h, c.calc === "PERCENTAGE" ? c.value : null, c.calc === "PERCENTAGE" ? null : c.value, c.type, c.reason, sc.id);
      }
      if (p.kid.order > 1) {
        const cfg = JSON.parse(scheme("SIBLING_DISCOUNT").configJson)[String(p.kid.order)];
        if (cfg) for (const h of [tuitionId]) if ((remaining.get(h) ?? 0) > 0) apply(h, cfg.value, null, "SIBLING_DISCOUNT", "Sibling Discount", null);
      }
      const staffParent = p.kid.family.staffParent;
      if (staffParent && staffParent.isActive) {
        const cfg = JSON.parse(scheme("STAFF_CHILD").configJson)[staffParent.staffCategory];
        if (cfg) for (const h of [tuitionId]) if ((remaining.get(h) ?? 0) > 0) apply(h, cfg.value, null, "STAFF_CHILD", `Staff Child Concession (${staffParent.staffCategory})`, null);
      }
      for (const { c, sc } of mine.filter(({ c }) => c.type !== "SCHOLARSHIP")) {
        for (const h of c.heads) if ((remaining.get(h) ?? 0) > 0) apply(h, c.calc === "PERCENTAGE" ? c.value : null, c.calc === "PERCENTAGE" ? null : c.value, c.type, c.reason, sc.id);
      }

      const monthCharges: ChargePlan[] = lineItems.map((li) => {
        const adj = applied.filter((a) => a.feeHeadId === li.feeHeadId);
        const discount = adj.reduce((s, a) => s + a.amount, 0);
        return {
          studentId,
          feeHeadId: li.feeHeadId,
          feeStructureItemId: li.itemId,
          month,
          year,
          dueDate: local(year, month, 10),
          base: li.amount,
          discount,
          net: Math.max(0, li.amount - discount),
          paid: 0,
          adjustments: adj.map(({ type, amount, reason, studentConcessionId }) => ({ type, amount, reason, studentConcessionId })),
        };
      });
      charges.push(...monthCharges);
      chargesByStudentMonth.set(`${studentId}:${mi}`, monthCharges);
    }
  }

  // ---------- payments (mirrors recordMultiMonthPayment: sequential allocation, oldest first)
  type PaymentPlan = {
    studentId: number;
    amount: number;
    mode: string;
    paidAt: Date;
    ref: string | null;
    months: number[]; // indexes into billedMonths
    allocations: Array<{ charge: ChargePlan; amount: number }>;
    advance: number;
  };
  const payments: PaymentPlan[] = [];
  const pay = (p: StudentPlan, monthIdxs: number[], opts: { fraction?: number; extra?: number } = {}) => {
    const studentId = studentIdOf(p);
    const owed = monthIdxs.flatMap((mi) => chargesByStudentMonth.get(`${studentId}:${mi}`) ?? []);
    if (owed.length === 0) return;
    const due = owed.reduce((s, c) => s + (c.net - c.paid), 0);
    if (due <= 0) return;
    const amount = Math.round(due * (opts.fraction ?? 1)) + (opts.extra ?? 0);
    const first = billedMonths[monthIdxs[0]];
    const day = randInt(2, 9);
    const paidAt = local(first.year, first.month, day, randInt(9, 14), randInt(0, 59));
    if (paidAt > TODAY) return;
    const mode = pick(["CASH", "CASH", "UPI_MANUAL", "UPI_MANUAL", "BANK_TRANSFER"]);
    let funds = amount;
    const allocations: PaymentPlan["allocations"] = [];
    for (const c of owed) {
      if (funds <= 0) break;
      const need = c.net - c.paid;
      if (need <= 0) continue;
      const a = Math.min(funds, need);
      funds -= a;
      c.paid += a;
      allocations.push({ charge: c, amount: a });
    }
    payments.push({
      studentId,
      amount,
      mode,
      paidAt,
      ref: mode === "UPI_MANUAL" ? `UPI${randInt(100000000, 999999999)}` : mode === "BANK_TRANSFER" ? `NEFT${randInt(10000000, 99999999)}` : null,
      months: monthIdxs,
      allocations,
      advance: funds,
    });
  };
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  for (const p of plans) {
    const last = p.leftMonthIdx ?? billedMonths.length - 1;
    const j = p.joinMonthIdx;
    const cur = billedMonths.length - 1;
    switch (p.payProfile) {
      case "REGULAR": // quarterly: Apr-Jun, Jul-Sep; current month still due
        for (let q = j; q <= Math.min(last, cur - 1); q += 3) pay(p, range(q, Math.min(q + 2, last, cur - 1)));
        break;
      case "MONTHLY": // every month on time, including the current one
        for (let m = j; m <= last; m++) pay(p, [m]);
        break;
      case "DEFAULTER": // paid the first quarter, nothing since
        pay(p, range(j, Math.min(j + 2, last)));
        break;
      case "PARTIAL": // paid up to two months ago, then half of last month
        for (let m = j; m <= Math.min(last, cur - 2); m++) pay(p, [m]);
        if (cur - 1 >= j) pay(p, [Math.min(last, cur - 1)], { fraction: 0.5 });
        break;
      case "ADVANCE": // paid everything plus extra credited as advance
        pay(p, range(j, Math.min(last, cur - 1)));
        pay(p, [last], { extra: 5000 });
        break;
      case "NONE":
        break;
    }
  }

  // Insert charges (with their final paid state), adjustments, payments, allocations.
  const chargeRows = await insertReturning(
    prisma.feeCharge,
    charges.map((c) => ({
      studentId: c.studentId,
      feeHeadId: c.feeHeadId,
      feeStructureItemId: c.feeStructureItemId,
      sessionId: session.id,
      billingMonth: c.month,
      billingYear: c.year,
      dueDate: c.dueDate,
      baseAmount: c.base,
      discountAmount: c.discount,
      lateFeeAmount: 0,
      netAmount: c.net,
      paidAmount: c.paid,
      status: c.paid >= c.net ? "PAID" : c.paid > 0 ? "PARTIALLY_PAID" : "UNPAID",
      createdAt: local(c.year, c.month, 1, 8),
    }))
  );
  chargeRows.forEach((row, i) => (charges[i].id = row.id));
  await insert(
    prisma.feeAdjustment,
    charges.flatMap((c) =>
      c.adjustments.map((a) => ({
        studentId: c.studentId,
        feeChargeId: c.id,
        studentConcessionId: a.studentConcessionId,
        type: a.type,
        calculationType: "FIXED_AMOUNT",
        value: a.amount,
        amount: a.amount,
        reason: a.reason,
        appliedByUserId: admin.id,
        createdAt: local(c.year, c.month, 1, 8),
      }))
    )
  );

  payments.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const paymentRows = await insertReturning(
    prisma.payment,
    payments.map((pm, i) => ({
      paymentNumber: `PAY-MULTI-${pm.paidAt.getTime()}-${pm.studentId}-${i}`,
      studentId: pm.studentId,
      amount: pm.amount,
      mode: pm.mode,
      status: "SUCCESS",
      transactionRef: pm.ref,
      paidAt: pm.paidAt,
      recordedByUserId: i % 4 === 0 ? superAdmin.id : admin.id,
      createdAt: pm.paidAt,
    }))
  );
  // Receipt numbers come from the payment id (lateFeeService.receiptNumberFor).
  await prisma.$executeRawUnsafe(
    `UPDATE "Payment" SET "receiptNumber" = 'REC-' || EXTRACT(YEAR FROM "paidAt")::int || '-' || LPAD(id::text, 6, '0')`
  );
  await insert(
    prisma.paymentAllocation,
    payments.flatMap((pm, i) =>
      pm.allocations.map((a) => ({ paymentId: paymentRows[i].id, feeChargeId: a.charge.id, allocatedAmount: a.amount, createdAt: pm.paidAt }))
    )
  );
  const advances = payments.map((pm, i) => ({ pm, row: paymentRows[i] })).filter(({ pm }) => pm.advance > 0);
  const advanceRows = await insertReturning(
    prisma.advancePayment,
    advances.map(({ pm, row }) => ({ studentId: pm.studentId, paymentId: row.id, amount: pm.advance, usedAmount: 0, remainingAmount: pm.advance, status: "AVAILABLE", createdAt: pm.paidAt }))
  );
  await insert(
    prisma.feeAuditLog,
    payments.map((pm, i) => ({
      action: "RECORD_MULTI_MONTH_PAYMENT",
      entityType: "Payment",
      entityId: paymentRows[i].id,
      userId: paymentRows[i].recordedByUserId,
      newValues: JSON.stringify({
        receiptNumber: `REC-${pm.paidAt.getFullYear()}-${String(paymentRows[i].id).padStart(6, "0")}`,
        paymentAmount: pm.amount,
        clearedMonths: pm.months.map((mi) => `${MONTHS[billedMonths[mi].month - 1]} ${billedMonths[mi].year}`),
        discountsApplied: [],
        excessAdvance: pm.advance,
      }),
      timestamp: pm.paidAt,
    }))
  );

  // One pending refund request against an advance, so the approval flow can be tried.
  if (advances.length) {
    const { pm, row } = advances[0];
    await prisma.refund.create({
      data: {
        refundNumber: `RFD-${SESSION.startYear}-0001`,
        studentId: pm.studentId,
        paymentId: row.id,
        amount: 2000,
        reason: "Parent requested partial refund of advance paid",
        status: "REFUND_REQUESTED",
        requestedByUserId: admin.id,
      },
    });
  }

  // Monthly fee bills (Invoice per student per month, as the payment desk creates them).
  const invoicePlans: Array<{ studentId: number; mi: number; list: ChargePlan[] }> = [];
  for (const [key, list] of chargesByStudentMonth) {
    const [sid, mi] = key.split(":").map(Number);
    invoicePlans.push({ studentId: sid, mi, list });
  }
  const invoiceRows = await insertReturning(
    prisma.invoice,
    invoicePlans.map(({ studentId, mi, list }) => {
      const { month, year } = billedMonths[mi];
      const total = list.reduce((s, c) => s + c.net, 0);
      const paid = list.reduce((s, c) => s + c.paid, 0);
      return {
        invoiceNumber: `INV-${year}-${String(month).padStart(2, "0")}-${planByStudentId.get(studentId)!.admissionNo}`,
        studentId,
        sessionId: session.id,
        collectionPeriodCode: periodCode(month, year),
        issueDate: local(year, month, 1, 8),
        dueDate: local(year, month, 10),
        totalBaseAmount: list.reduce((s, c) => s + c.base, 0),
        totalDiscountAmount: list.reduce((s, c) => s + c.discount, 0),
        totalLateFeeAmount: 0,
        totalAmount: total,
        paidAmount: paid,
        status: paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
        notes: "Monthly fee bill",
        createdAt: local(year, month, 1, 8),
      };
    })
  );
  await insert(
    prisma.invoiceItem,
    invoicePlans.flatMap(({ list, mi }, i) =>
      list.map((c) => ({
        invoiceId: invoiceRows[i].id,
        feeChargeId: c.id,
        amount: c.base,
        description: `${heads.find((h) => h.id === c.feeHeadId)!.name} - ${MONTHS[billedMonths[mi].month - 1]} ${billedMonths[mi].year}`,
      }))
    )
  );
  const billed = charges.reduce((s, c) => s + c.net, 0);
  const collected = charges.reduce((s, c) => s + c.paid, 0);
  step(
    `Fees: ${charges.length} charges, ${invoiceRows.length} monthly bills, ${payments.length} payments, ${advanceRows.length} advances | billed ₹${billed.toLocaleString("en-IN")}, collected ₹${collected.toLocaleString("en-IN")}, outstanding ₹${(billed - collected).toLocaleString("en-IN")}`
  );

  // ---------- leave requests (approved student leave also marks attendance as LEAVE)
  const classTeacherUserOf = (sectionId: number) => staffUserByStaffId.get(sections.find((s) => s.id === sectionId)!.classTeacherId)!;
  const loginPlans = plans.filter((p) => p.hasLogin && p.data.isActive);
  const leaveDefs: any[] = [];
  const approvedLeaveDays = new Map<number, Set<string>>(); // studentId -> dates
  const addStudentLeave = (p: StudentPlan, from: Date, to: Date, status: string, reason: string, note?: string) => {
    const studentId = studentIdOf(p);
    const decided = status === "APPROVED" || status === "REJECTED";
    leaveDefs.push({
      studentId,
      fromDate: from,
      toDate: to,
      reason,
      status,
      requestedByUserId: p.data.userId,
      decidedByUserId: decided ? classTeacherUserOf(p.data.classSectionId) : null,
      decidedAt: decided ? new Date(from.getTime() - 86_400_000) : null,
      decisionNote: note ?? null,
      createdAt: new Date(from.getTime() - 2 * 86_400_000),
    });
    if (status === "APPROVED") {
      const set = approvedLeaveDays.get(studentId) ?? new Set();
      for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) set.add(ymd(new Date(t)));
      approvedLeaveDays.set(studentId, set);
    }
  };
  const ty = TODAY.getFullYear();
  const daysAgo = (n: number) => new Date(TODAY_UTC.getTime() - n * 86_400_000);
  const daysAhead = (n: number) => new Date(TODAY_UTC.getTime() + n * 86_400_000);
  addStudentLeave(loginPlans[0], daysAgo(20), daysAgo(18), "APPROVED", "Viral fever, doctor advised rest", "Get well soon");
  addStudentLeave(loginPlans[3], daysAgo(12), daysAgo(11), "APPROVED", "Attending cousin's wedding in Lucknow");
  addStudentLeave(loginPlans[7], daysAgo(30), daysAgo(26), "APPROVED", "Chickenpox - medical certificate attached");
  addStudentLeave(loginPlans[11], daysAgo(9), daysAgo(9), "REJECTED", "Family function", "Half-yearly revision class that day - please attend");
  addStudentLeave(loginPlans[15], daysAhead(2), daysAhead(3), "PENDING", "Going to native village for Dussehra");
  addStudentLeave(loginPlans[19], daysAhead(1), daysAhead(1), "PENDING", "Dental appointment");
  addStudentLeave(loginPlans[24], daysAhead(4), daysAhead(6), "PENDING", "Grandfather unwell, travelling to Kanpur");
  addStudentLeave(loginPlans[30], daysAgo(5), daysAgo(4), "CANCELLED", "Trip postponed");
  const tStaff = (name: string) => teacherStaff.find((t) => t.def.name === name)!;
  for (const [t, from, to, status, reason] of [
    [tStaff("Priya Singh"), daysAgo(15), daysAgo(14), "APPROVED", "Personal work"],
    [tStaff("Amit Gupta"), daysAhead(3), daysAhead(4), "PENDING", "Attending CBSE evaluator training"],
    [tStaff("Neha Kapoor"), daysAhead(7), daysAhead(9), "PENDING", "Sister's wedding"],
    [tStaff("Anil Kumar"), daysAgo(8), daysAgo(8), "REJECTED", "Personal work"],
  ] as const) {
    leaveDefs.push({
      staffId: t.id,
      fromDate: from,
      toDate: to,
      reason,
      status,
      requestedByUserId: t.userId,
      decidedByUserId: status === "PENDING" ? null : admin.id,
      decidedAt: status === "PENDING" ? null : new Date(from.getTime() - 86_400_000),
      decisionNote: status === "REJECTED" ? "Exam week - please reschedule" : null,
      createdAt: new Date(from.getTime() - 3 * 86_400_000),
    });
  }
  await insert(prisma.leaveRequest, leaveDefs);
  step(`Created ${leaveDefs.length} leave requests (student + staff)`);

  // ---------- attendance: from 1 Aug up to yesterday, Mon-Sat, minus holidays
  const holidays = new Set([`${ty}-08-15`, `${ty}-08-28`, `${ty}-09-04`, `${ty}-10-02`]);
  const attendanceRows: any[] = [];
  const attStart = utcDay(SESSION.startYear, 8, 1);
  for (let t = attStart.getTime(); t < TODAY_UTC.getTime(); t += 86_400_000) {
    const date = new Date(t);
    if (date.getUTCDay() === 0 || holidays.has(ymd(date))) continue;
    for (const p of plans) {
      const studentId = studentIdOf(p);
      if (date < utcDay(p.admissionDate.getFullYear(), p.admissionDate.getMonth() + 1, p.admissionDate.getDate())) continue;
      if (p.leftMonthIdx !== null) {
        const lm = billedMonths[p.leftMonthIdx];
        if (date > utcDay(lm.year, lm.month + 1, 0)) continue;
      }
      let status: string;
      if (approvedLeaveDays.get(studentId)?.has(ymd(date))) status = "LEAVE";
      else {
        const r = rand();
        status = r < p.attendanceRate ? (chance(0.04) ? "LATE" : "PRESENT") : "ABSENT";
      }
      attendanceRows.push({ studentId, classSectionId: p.data.classSectionId, date, status, markedByUserId: classTeacherUserOf(p.data.classSectionId) });
    }
  }
  await insert(prisma.attendance, attendanceRows, 3000);
  step(`Created ${attendanceRows.length} attendance records (today left unmarked for you to mark)`);

  // ---------- exams: Unit Test 1 (locked+published), Half Yearly (published, except two
  // sections still open for marks entry), Unit Test 2 (created, no marks yet)
  const openSections = new Set([sectionInfo.find((s) => s.def.className === "Class 7")!.id, sectionInfo.find((s) => s.def.className === "Class 10")!.id]);
  const examRows = await insertReturning(
    prisma.exam,
    sectionInfo.flatMap((sec) => [
      { sessionId: session.id, name: "Unit Test 1", classSectionId: sec.id, passPercentage: 33, isLocked: true, lockedAt: local(ty, 7, 28), lockedByUserId: admin.id, resultsPublished: true, publishedAt: local(ty, 7, 30) },
      {
        sessionId: session.id,
        name: "Half Yearly",
        classSectionId: sec.id,
        passPercentage: 33,
        isLocked: !openSections.has(sec.id),
        lockedAt: openSections.has(sec.id) ? null : local(ty, 10, 8),
        lockedByUserId: openSections.has(sec.id) ? null : admin.id,
        resultsPublished: !openSections.has(sec.id),
        publishedAt: openSections.has(sec.id) ? null : local(ty, 10, 10),
      },
      { sessionId: session.id, name: "Unit Test 2", classSectionId: sec.id, passPercentage: 33 },
    ])
  );
  const resultRows: any[] = [];
  const auditRows: any[] = [];
  const remarkRows: any[] = [];
  const REMARKS = {
    high: ["Excellent performance. Keep it up!", "Outstanding effort and a sincere learner.", "Very attentive in class; consistently does well."],
    mid: ["Good progress. Can do better with regular practice.", "Steady performer; should participate more in class.", "Satisfactory. Needs to focus on written work."],
    low: ["Needs to work harder and revise daily.", "Must improve attendance and complete homework regularly.", "Requires extra attention in Mathematics and English."],
  };
  for (const exam of examRows) {
    if (exam.name === "Unit Test 2") continue;
    const sec = sectionInfo.find((s) => s.id === exam.classSectionId)!;
    const max = exam.name === "Unit Test 1" ? 25 : sec.def.level === "PRE" ? 50 : 80;
    const enteredAt = exam.name === "Unit Test 1" ? local(ty, 7, 24, 15) : local(ty, 10, 6, 15);
    const subs = subjectsBySection.get(sec.id)!;
    for (const p of plans.filter((pl) => pl.data.classSectionId === sec.id)) {
      const studentId = studentIdOf(p);
      const joined = p.admissionDate <= (exam.name === "Unit Test 1" ? local(ty, 7, 15) : local(ty, 9, 20));
      const left = p.leftMonthIdx !== null && exam.name === "Half Yearly";
      if (!joined || left) continue;
      for (const [si, sub] of subs.entries()) {
        // In the open sections, the last subject's marks haven't been entered yet.
        if (openSections.has(sec.id) && exam.name === "Half Yearly" && si === subs.length - 1) continue;
        const teacherUserId = subjectTeacher.get(sub.id)!.userId;
        const absent = chance(0.012);
        const score = absent ? 0 : Math.round(clamp(p.ability + (rand() - 0.5) * 0.25, 0.05, 1) * max);
        resultRows.push({ examId: exam.id, studentId, subjectId: sub.id, marksObtained: score, maxMarks: max, isAbsent: absent, enteredByUserId: teacherUserId });
        auditRows.push({ examId: exam.id, studentId, subjectId: sub.id, action: "CREATE", newMarks: score, newMaxMarks: max, newIsAbsent: absent, changedByUserId: teacherUserId, changedAt: enteredAt });
      }
      if (exam.name === "Half Yearly" && !openSections.has(sec.id)) {
        const band = p.ability > 0.78 ? "high" : p.ability > 0.5 ? "mid" : "low";
        const g = () => (band === "high" ? pick(["A", "A", "B"]) : band === "mid" ? pick(["A", "B", "B"]) : pick(["B", "C"]));
        remarkRows.push({ examId: exam.id, studentId, remark: pick(REMARKS[band]), workEducation: g(), artEducation: g(), healthPhysical: g(), discipline: g(), updatedByUserId: classTeacherUserOf(sec.id) });
      }
    }
  }
  // A couple of corrections, so the marks change history has UPDATE rows.
  for (const r of resultRows.filter((r, i) => i % 211 === 3 && !r.isAbsent).slice(0, 4)) {
    const old = r.marksObtained;
    r.marksObtained = Math.min(r.maxMarks, old + 3);
    auditRows.push({ examId: r.examId, studentId: r.studentId, subjectId: r.subjectId, action: "UPDATE", oldMarks: old, oldMaxMarks: r.maxMarks, oldIsAbsent: false, newMarks: r.marksObtained, newMaxMarks: r.maxMarks, newIsAbsent: false, changedByUserId: admin.id, changedAt: local(ty, 10, 7, 11) });
  }
  await insert(prisma.examResult, resultRows);
  await insert(prisma.examResultAudit, auditRows);
  await insert(prisma.examStudentRemark, remarkRows);
  step(`Exams: ${examRows.length} exams, ${resultRows.length} marks, ${remarkRows.length} report-card remarks`);

  // ---------- homework
  const hwRows: any[] = [];
  const HW_TOPICS: Record<string, string[]> = {
    English: ["Write a paragraph on 'My Favourite Festival'", "Chapter 4 question-answers", "Learn spellings of lesson 5"],
    Hindi: ["पाठ 3 के प्रश्न-उत्तर लिखिए", "'दीपावली' पर निबंध लिखिए", "सुलेख - एक पृष्ठ"],
    Mathematics: ["Exercise 5.2 - all questions", "Practice worksheet on fractions", "Tables 12 to 15 - write twice"],
    Science: ["Draw and label the human heart", "Chapter 6 back exercises", "Project: model of water cycle"],
    EVS: ["Collect 5 different leaves and paste them", "Draw your family tree", "List 10 means of transport"],
    "Social Science": ["Map work: mark the rivers of India", "Chapter 3 short-answer questions", "Timeline of the Mughal Empire"],
    Computer: ["Type a letter in MS Word", "Parts of a computer - diagram", "Make a poster in Paint"],
    "Computer Applications": ["HTML page with a table", "Practice questions on spreadsheets", "Write 5 SQL queries"],
    Sanskrit: ["शब्द रूप - बालक", "धातु रूप - पठ्", "पाठ 2 अनुवाद"],
    Drawing: ["Colour the mango picture", "Draw a house", "Make a paper boat"],
  };
  const hwDates = [
    { assigned: daysAgo(16), due: daysAgo(12), end: daysAgo(8) },
    { assigned: daysAgo(8), due: daysAgo(4), end: daysAgo(1) },
    { assigned: daysAgo(2), due: daysAhead(2), end: daysAhead(6) },
    { assigned: daysAgo(0), due: daysAhead(4), end: daysAhead(9) },
  ];
  for (const sec of sectionInfo) {
    const subs = subjectsBySection.get(sec.id)!;
    hwDates.forEach((d, k) => {
      const sub = subs[(k * 2 + sec.id) % subs.length];
      const teacher = subjectTeacher.get(sub.id)!;
      const topics = HW_TOPICS[sub.name] ?? ["Revise today's lesson"];
      hwRows.push({
        title: topics[k % topics.length],
        description: `${topics[k % topics.length]}. Write neatly in your ${sub.name} notebook and submit on time.`,
        classSectionId: sec.id,
        subjectId: sub.id,
        assignedById: teacher.id,
        assignedDate: d.assigned,
        dueDate: d.due,
        endDate: d.end,
        createdAt: d.assigned,
      });
    });
  }
  const hwCreated = await insertReturning(prisma.assignment, hwRows);
  const submissions: any[] = [];
  for (const hw of hwCreated) {
    const isPast = hw.dueDate < TODAY_UTC;
    const sec = sectionInfo.find((s) => s.id === hw.classSectionId)!;
    const teacherUserId = staffUserByStaffId.get(hw.assignedById)!;
    for (const p of plans.filter((pl) => pl.data.classSectionId === hw.classSectionId && pl.data.isActive)) {
      if (!chance(isPast ? 0.82 : 0.3)) continue;
      const offline = !p.hasLogin || chance(0.15);
      const late = isPast && chance(0.12);
      const submittedAt = late ? new Date(hw.dueDate.getTime() + 86_400_000 + 3600_000 * 10) : new Date(hw.assignedDate.getTime() + randInt(1, 2) * 86_400_000 + 3600_000 * 17);
      if (submittedAt > TODAY) continue;
      const r = rand();
      const status = !isPast ? "SUBMITTED" : r < 0.65 ? "CHECKED" : r < 0.75 ? "REDO" : "SUBMITTED";
      submissions.push({
        assignmentId: hw.id,
        studentId: studentIdOf(p),
        text: offline ? null : sec.def.level === "PRE" ? null : "Completed the homework. Uploaded the notebook pages.",
        submittedOffline: offline,
        submittedAt,
        isLate: late,
        status,
        teacherComment: status === "CHECKED" ? pick(["Good work", "Well done!", "Neat handwriting", "Correct, keep it up"]) : status === "REDO" ? "Incomplete - please redo questions 3 to 5" : null,
        checkedAt: status === "SUBMITTED" ? null : new Date(submittedAt.getTime() + 86_400_000),
        checkedByUserId: status === "SUBMITTED" ? null : teacherUserId,
      });
    }
  }
  await insert(prisma.homeworkSubmission, submissions);
  step(`Homework: ${hwCreated.length} assignments, ${submissions.length} submissions`);

  // ---------- notices
  const principalUserId = supportStaff.find((s) => s.def.category === "PRINCIPAL")!.userId;
  const class10 = sectionInfo.find((s) => s.def.className === "Class 10")!;
  const class5a = sectionInfo.find((s) => s.def.className === "Class 5" && s.section === "A")!;
  const notices = [
    { title: "Dussehra & Diwali Holidays", body: `The school will remain closed from 20 October to 24 October for Dussehra. Diwali break: 7 November to 11 November. Classes resume on 12 November.`, targetRole: null, isImportant: true, postedByUserId: superAdmin.id, postedAt: daysAgo(3) },
    { title: "Half Yearly Results Published", body: "Half yearly report cards are now available on the portal. Parent-teacher meeting on Saturday 9:00 AM - 12:00 PM.", targetRole: null, isImportant: false, postedByUserId: admin.id, postedAt: local(ty, 10, 10, 12) },
    { title: "Fee Reminder - October", body: "October fees were due on the 10th. Please clear dues to avoid late fine. Pay at the office or via UPI.", targetRole: null, isImportant: true, postedByUserId: admin.id, postedAt: local(ty, 10, 12, 10) },
    { title: "Staff Meeting", body: "All teachers to assemble in the conference room on Saturday after school for Unit Test 2 planning.", targetRole: "TEACHER", isImportant: false, postedByUserId: principalUserId, postedAt: daysAgo(2) },
    { title: "Inter-House Sports Meet", body: "Annual sports meet in the third week of November. Students interested in athletics should give their names to Deepak sir.", targetRole: "STUDENT", isImportant: false, postedByUserId: admin.id, postedAt: daysAgo(6) },
    { title: "Winter Uniform", body: "Winter uniform is compulsory from 1 November. Navy blue sweater and blazer.", targetRole: null, isImportant: false, postedByUserId: admin.id, postedAt: daysAgo(1) },
    { title: "Pre-board practical schedule", body: "Science practical exam for Class 10 will be held on 5 and 6 November. Bring your lab record file.", targetRole: null, targetClassSectionId: class10.id, isImportant: true, postedByUserId: tStaff("Priya Singh").userId, postedAt: daysAgo(4) },
    { title: "Class 5-A picnic consent form", body: "Picnic to Nawabganj Bird Sanctuary on 14 November. Submit the signed consent form and Rs. 300 by 5 November.", targetRole: null, targetClassSectionId: class5a.id, isImportant: false, postedByUserId: staffUserByStaffId.get(class5a.classTeacherId)!, postedAt: daysAgo(5) },
    { title: "Vaccination Camp", body: "A free health check-up and vaccination camp will be organised in school on 30 October. Parents are requested to send the vaccination card.", targetRole: null, isImportant: false, postedByUserId: admin.id, postedAt: daysAgo(8) },
  ];
  await insert(prisma.notice, notices.map((n) => ({ targetClassSectionId: null, attachmentUrl: null, ...n })));
  step(`Created ${notices.length} notices`);

  // ---------- construction (SUPER_ADMIN)
  const projects = await insertReturning(prisma.constructionProject, [
    { name: "New Science Block", description: "Two-storey block with Physics, Chemistry and Biology labs", location: "North campus", budget: 4500000, status: "IN_PROGRESS", startDate: utcDay(ty, 5, 10), endDate: utcDay(ty + 1, 3, 31), createdByUserId: superAdmin.id, createdAt: local(ty, 5, 5) },
    { name: "Boundary Wall & Main Gate", description: "Replace the old boundary wall on the road side and new main gate", location: "Front side", budget: 850000, status: "COMPLETED", startDate: utcDay(ty, 4, 15), endDate: utcDay(ty, 7, 20), createdByUserId: superAdmin.id, createdAt: local(ty, 4, 10) },
    { name: "Auditorium", description: "500-seat auditorium - drawings under approval", location: "South campus", budget: 12000000, status: "PLANNED", startDate: utcDay(ty + 1, 1, 15), endDate: null, createdByUserId: superAdmin.id, createdAt: local(ty, 9, 1) },
    { name: "Toilet Block Renovation", description: "Girls' toilet block renovation", location: "Behind primary wing", budget: 300000, status: "ON_HOLD", startDate: utcDay(ty, 8, 1), endDate: null, createdByUserId: superAdmin.id, createdAt: local(ty, 7, 25) },
  ]);
  const [science, wall, , toilet] = projects;
  const VENDORS: Record<string, string> = {
    MATERIALS: "Shree Balaji Building Material",
    LABOUR: "Labour contractor - Ram Kishor",
    CONTRACTOR: "Verma Constructions Pvt Ltd",
    TRANSPORT: "Gupta Transport Co.",
    EQUIPMENT: "Sai Machinery Rentals",
    PERMITS_FEES: "Nagar Palika Parishad",
    UTILITIES: "UPPCL",
    MISCELLANEOUS: "Local vendor",
  };
  const expenseDefs: Array<[any, string, string, number, number, number, string?, string?]> = [
    // project, title, category, month, day, amount, paymentStatus, notes
    [wall, "Bricks - 20,000 nos", "MATERIALS", 4, 18, 160000],
    [wall, "Cement 300 bags", "MATERIALS", 4, 20, 117000],
    [wall, "Masons and helpers - April", "LABOUR", 4, 30, 84000],
    [wall, "Iron main gate fabrication", "CONTRACTOR", 6, 12, 145000],
    [wall, "Labour - May/June", "LABOUR", 6, 30, 126000],
    [wall, "Painting and finishing", "CONTRACTOR", 7, 18, 58000],
    [science, "Building plan approval fee", "PERMITS_FEES", 5, 12, 35000],
    [science, "Foundation excavation (JCB)", "EQUIPMENT", 5, 20, 48000],
    [science, "TMT steel bars - 6 tonnes", "MATERIALS", 6, 2, 384000],
    [science, "Cement 800 bags", "MATERIALS", 6, 5, 312000],
    [science, "Sand and aggregate - 12 trucks", "TRANSPORT", 6, 8, 96000],
    [science, "Civil contractor - 1st RA bill", "CONTRACTOR", 7, 15, 650000],
    [science, "Labour - July", "LABOUR", 7, 31, 142000],
    [science, "Civil contractor - 2nd RA bill", "CONTRACTOR", 9, 10, 720000, "PARTIALLY_PAID", "Rs. 4,00,000 paid, balance after slab casting"],
    [science, "Temporary electricity connection", "UTILITIES", 6, 1, 18500],
    [science, "Labour - August", "LABOUR", 8, 31, 151000],
    [science, "Shuttering material hire", "EQUIPMENT", 8, 14, 64000],
    [science, "Electrical conduit and wiring (1st lot)", "MATERIALS", 10, 3, 87000, "UNPAID", "Bill received, payment due 31 Oct"],
    [science, "Labour - September", "LABOUR", 9, 30, 149000],
    [science, "Site tea, water and misc.", "MISCELLANEOUS", 10, 8, 6200],
    [toilet, "Tiles and sanitary fittings", "MATERIALS", 8, 6, 92000],
    [toilet, "Plumber advance", "LABOUR", 8, 9, 15000],
  ];
  const expenseRows = await insertReturning(
    prisma.constructionExpense,
    expenseDefs.map(([project, title, category, m, d, amount, paymentStatus, notes], i) => ({
      projectId: project.id,
      title,
      category,
      expenseDate: utcDay(ty, m, d),
      amount,
      vendorName: VENDORS[category],
      vendorContact: `98${randInt(10000000, 99999999)}`,
      invoiceNumber: category === "LABOUR" || category === "MISCELLANEOUS" ? null : `INV/${ty}/${100 + i}`,
      paymentStatus: paymentStatus ?? "PAID",
      paymentMode: paymentStatus === "UNPAID" ? null : pick(["BANK_TRANSFER", "BANK_TRANSFER", "CHEQUE", "UPI", "CASH"]),
      notes: notes ?? null,
      createdByUserId: superAdmin.id,
      createdAt: local(ty, m, d, 18),
    }))
  );
  // One mistaken entry that was voided (stays on record, excluded from totals).
  const dup = await prisma.constructionExpense.create({
    data: {
      projectId: science.id, title: "Cement 800 bags (duplicate entry)", category: "MATERIALS", expenseDate: utcDay(ty, 6, 5), amount: 312000,
      vendorName: VENDORS.MATERIALS, paymentStatus: "PAID", paymentMode: "BANK_TRANSFER", createdByUserId: superAdmin.id,
      isVoid: true, voidReason: "Duplicate of the 5 June entry", voidedAt: local(ty, 6, 6, 10), voidedByUserId: superAdmin.id,
    },
  });
  await insert(prisma.constructionAuditLog, [
    ...projects.map((p) => ({ action: "CREATE", entityType: "ConstructionProject", entityId: p.id, userId: superAdmin.id, newValues: JSON.stringify({ name: p.name, budget: String(p.budget ?? "") }), timestamp: p.createdAt })),
    ...[...expenseRows, dup].map((e) => ({ action: "CREATE", entityType: "ConstructionExpense", entityId: e.id, userId: superAdmin.id, newValues: JSON.stringify({ title: e.title, amount: e.amount.toString(), category: e.category }), timestamp: e.createdAt })),
    { action: "VOID", entityType: "ConstructionExpense", entityId: dup.id, userId: superAdmin.id, newValues: JSON.stringify({ voidReason: dup.voidReason }), timestamp: dup.voidedAt },
  ]);
  step(`Construction: ${projects.length} projects, ${expenseRows.length + 1} expenses (1 voided)`);

  // ---------- admission inquiries (public website form)
  await insert(prisma.admissionInquiry, [
    { studentName: "Advik Mehrotra", parentName: "Rohit Mehrotra", email: "rohit.m@example.com", phone: "9839012345", gradeApplyingFor: "Nursery", message: "Is there a van facility from Haripur?", status: "NEW", createdAt: daysAgo(1) },
    { studentName: "Sneha Kushwaha", parentName: "Mukesh Kushwaha", email: "mukesh.k@example.com", phone: "9839012346", gradeApplyingFor: "Class 6", currentSchool: "Govt. Primary School, Rampur", status: "NEW", createdAt: daysAgo(2) },
    { studentName: "Arnav Tripathi", parentName: "Sangeeta Tripathi", email: "sangeeta.t@example.com", phone: "9839012347", gradeApplyingFor: "Class 1", status: "CONTACTED", notes: "Called on Monday, will visit with documents", createdAt: daysAgo(6) },
    { studentName: "Zoya Siddiqui", parentName: "Imran Siddiqui", email: "imran.s@example.com", phone: "9839012348", gradeApplyingFor: "Class 9", currentSchool: "DAV Public School", message: "Transfer due to job relocation", status: "CONTACTED", createdAt: daysAgo(10) },
    { studentName: "Yuvraj Chauhan", parentName: "Vikas Chauhan", email: "vikas.c@example.com", phone: "9839012349", gradeApplyingFor: "LKG", status: "ADMITTED", notes: "Admission done - ADM pending in ERP", createdAt: daysAgo(25) },
    { studentName: "Ritika Bansal", parentName: "Amit Bansal", email: "amit.b@example.com", phone: "9839012350", gradeApplyingFor: "Class 11", message: "Do you have Science stream in Class 11?", status: "REJECTED", notes: "School is up to Class 10 only", createdAt: daysAgo(30) },
    { studentName: "Kartik Nishad", parentName: "Rajkumar Nishad", email: "rajkumar.n@example.com", phone: "9839012351", gradeApplyingFor: "Class 3", status: "NEW", createdAt: daysAgo(0) },
  ]);

  // ---------- summary
  const login = (role: string, email: string, pwd: string) => console.log(`   ${role.padEnd(13)} ${email.padEnd(32)} ${pwd}`);
  const firstStudent = plans.findIndex((p) => p.hasLogin);
  const staffKid = plans.find((p) => p.kid.family === f9 && p.hasLogin);
  console.log(`\n✅ Seed complete in ${Math.round((Date.now() - started) / 1000)}s. Sample logins:`);
  login("Super Admin", "superadmin@school.com", "superadmin123 (if never changed)");
  login("Admin", "admin@school.com", "admin123 (if never changed)");
  login("Principal", "principal@school.com", "staff123");
  login("Teacher", emailFor(TEACHERS[0].name), "teacher123");
  login("Class teacher", `${staffUsers[classTeacherOrder[4]].email} (${sectionDefs[4].className}-${sectionDefs[4].section})`, "teacher123");
  login("Student", `student${firstStudent + 1}@school.com`, "student123");
  if (staffKid) login("Staff child", `student${plans.indexOf(staffKid) + 1}@school.com`, "student123");
  console.log(`   Students: student1..student${plans.length}@school.com (or their admission number). No parent logins.`);
  console.log(`   Students can also log in with their admission number.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
