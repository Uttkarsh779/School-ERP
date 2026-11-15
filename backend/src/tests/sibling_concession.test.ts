import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import { assignStudentConcession, getAllConcessions, getStudentConcessions } from "../modules/concessions/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Sibling discount: the admin names the sibling(s); they're stored and listed with names.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
    const session = rows.add("AcademicSession", await prisma.academicSession.create({ data: { name: `${tag} session`, startDate: new Date("2026-06-01"), endDate: new Date("2027-05-31"), isCurrent: false } }));
    const cs = rows.add("ClassSection", await prisma.classSection.create({ data: { sessionId: session.id, className: "ZZ Test", section: tag } }));
    const admin = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}@test.local`, passwordHash: "x", role: "SUPER_ADMIN", name: `${tag} Admin`, isActive: false } }));
    const kid = async (n: string) => rows.add("Student", await prisma.student.create({ data: { admissionNo: `${tag}-${n}`, name: `${tag} ${n}`, rollNo: n, classSectionId: cs.id } }));
    const [younger, elder, eldest] = [await kid("1"), await kid("2"), await kid("3")];
    const base = { studentId: younger.id, type: "SIBLING_DISCOUNT", calculationType: "PERCENTAGE", value: 10, applicableHeads: [], startsFrom: "2026-06-01", reason: "Sibling" };

    await rejects(assignStudentConcession({ ...base }, admin.id), /brother\(s\) or sister\(s\)/);
    await rejects(assignStudentConcession({ ...base, siblingStudentIds: [younger.id] }, admin.id), /own sibling/);
    await rejects(assignStudentConcession({ ...base, siblingStudentIds: [999999999] }, admin.id), /wasn't found/);

    const c = await assignStudentConcession({ ...base, siblingStudentIds: [elder.id, String(eldest.id), elder.id] }, admin.id);
    assert.deepEqual([...c.siblingStudentIds].sort(), [elder.id, eldest.id].sort(), "deduplicated, numbers");

    const mine = await getStudentConcessions(younger.id);
    assert.deepEqual(mine[0].siblings.map((s) => s.name).sort(), [elder.name, eldest.name].sort());
    assert.ok((await getAllConcessions()).find((x: any) => x.id === c.id)?.siblings.length === 2);

    // Other concession types never carry siblings.
    const sch = await assignStudentConcession({ ...base, type: "SCHOLARSHIP", siblingStudentIds: [elder.id] }, admin.id);
    assert.deepEqual(sch.siblingStudentIds, []);

    console.log("sibling concession: all checks passed");
  } finally {
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
