import "dotenv/config";
import { prisma } from "../config/prisma";

async function main() {
  console.log("Seeding dummy concessions data...");

  // 1. Ensure Concession Schemes exist
  const schemes = [
    { name: "Merit Scholarship", type: "SCHOLARSHIP", calculationType: "PERCENTAGE", value: 50 },
    { name: "Sibling Discount", type: "SIBLING_DISCOUNT", calculationType: "FIXED_AMOUNT", value: 500 },
    { name: "Staff Child Discount (Teacher)", type: "STAFF_CHILD", calculationType: "PERCENTAGE", value: 50 },
    { name: "Staff Child Discount (Driver)", type: "STAFF_CHILD", calculationType: "PERCENTAGE", value: 40 },
    { name: "Staff Child Discount (Cleaning)", type: "STAFF_CHILD", calculationType: "PERCENTAGE", value: 50 },
    { name: "Transport Concession", type: "TRANSPORT_CONCESSION", calculationType: "PERCENTAGE", value: 50 },
  ];

  const createdSchemes: any[] = [];
  for (const scheme of schemes) {
    const s = await prisma.concessionScheme.upsert({
      where: { id: -1 }, // Force create or find existing (Prisma doesn't have a good 'find or create by name' if name is not unique)
      create: { ...scheme, applicableHeads: [] },
      update: {}, // Not used
    }).catch(async () => {
      // Find by name
      const existing = await prisma.concessionScheme.findFirst({ where: { name: scheme.name } });
      if (existing) return existing;
      return prisma.concessionScheme.create({ data: { ...scheme, applicableHeads: [] } });
    });
    createdSchemes.push(s);
  }
  const [meritScheme, siblingScheme, teacherScheme, driverScheme, cleaningScheme, transportScheme] = createdSchemes;

  // 2. Find/Create a Super Admin user
  let adminUser = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!adminUser) {
    console.log("No SUPER_ADMIN found. Seeding skipped.");
    return;
  }

  // 3. Find some students to apply concessions to
  const students = await prisma.student.findMany({ take: 5, include: { parents: { include: { parent: true } } } });
  if (students.length < 5) {
    console.log("Not enough students in DB. Run normal seed first.");
    return;
  }

  const [s1, s2, s3, s4, s5] = students;

  const now = new Date();
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  // Merit Scholarship
  await seedStudentConcession(s1.id, meritScheme.id, null, "SCHOLARSHIP", "PERCENTAGE", 50, adminUser.id, "Academic Merit", now, nextYear);
  
  // Sibling Discount
  await seedStudentConcession(s2.id, siblingScheme.id, null, "SIBLING_DISCOUNT", "FIXED_AMOUNT", 500, adminUser.id, "Second Child", now, nextYear);

  // Transport Concession
  await seedStudentConcession(s5.id, transportScheme.id, null, "TRANSPORT_CONCESSION", "PERCENTAGE", 50, adminUser.id, "Distance", now, nextYear);

  // Staff Child Scenarios
  await seedStaffChildConcession("TEACHER", teacherScheme.id, s3.id, adminUser.id, now, nextYear);
  await seedStaffChildConcession("DRIVER", driverScheme.id, s4.id, adminUser.id, now, nextYear);

  console.log("Concession Seeding Completed!");
}

async function seedStudentConcession(
  studentId: number, schemeId: number, staffId: number | null, 
  type: any, calcType: any, value: number, adminId: number, reason: string,
  start: Date, end: Date
) {
  const existing = await prisma.studentConcession.findFirst({ where: { studentId, type } });
  if (!existing) {
    await prisma.studentConcession.create({
      data: {
        studentId, concessionSchemeId: schemeId, staffId, type, calculationType: calcType, value,
        applicableHeads: [], startsFrom: start, endsOn: end, reason, approvedByUserId: adminId
      }
    });
    console.log(`Assigned ${type} to student ${studentId}`);
  }
}

async function seedStaffChildConcession(category: any, schemeId: number, studentId: number, adminId: number, start: Date, end: Date) {
  let staff = await prisma.staff.findFirst({ where: { staffCategory: category }, include: { user: { include: { parent: true } } } });
  if (!staff) {
    console.log(`No staff with category ${category} found. Creating dummy...`);
    const user = await prisma.user.create({
      data: {
        email: `dummy_${category.toLowerCase()}@test.com`,
        name: `Dummy ${category}`,
        passwordHash: "hash",
        role: category === "TEACHER" ? "TEACHER" : "ADMIN"
      }
    });
    staff = await prisma.staff.create({ data: { userId: user.id, staffCategory: category }, include: { user: { include: { parent: true } } } });
  }

  // Link staff parent to student
  let parent = staff.user.parent;
  if (!parent) {
    parent = await prisma.parentGuardian.create({ data: { userId: staff.user.id, name: staff.user.name, email: staff.user.email } });
  }

  const link = await prisma.parentStudent.findUnique({ where: { parentId_studentId: { parentId: parent.id, studentId } } });
  if (!link) {
    await prisma.parentStudent.create({ data: { parentId: parent.id, studentId, relationshipType: "Parent" } });
  }

  await seedStudentConcession(studentId, schemeId, staff.id, "STAFF_CHILD", "PERCENTAGE", category === "DRIVER" ? 40 : 50, adminId, `Child of ${category}`, start, end);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
