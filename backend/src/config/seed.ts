import { prisma } from "./prisma";
import { Role } from "../generated/prisma/enums";
import { hashPassword } from "../utils/password";

export const seedAdminUser = async (): Promise<void> => {
  const existingSuper = await prisma.user.findUnique({ where: { email: "superadmin@school.com" } });
  if (!existingSuper) {
    const superPasswordHash = await hashPassword("superadmin123");
    await prisma.user.create({
      data: {
        email: "superadmin@school.com",
        passwordHash: superPasswordHash,
        role: Role.SUPER_ADMIN,
        name: "System Super Admin",
      },
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: "admin@school.com" } });
  if (!existingAdmin) {
    const adminPasswordHash = await hashPassword("admin123");
    await prisma.user.create({
      data: {
        email: "admin@school.com",
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        name: "School Accountant Admin",
      },
    });
  }
};

export const runFullResetAndSeed = async () => {
  console.log("🧹 Starting Complete ERP Database Reset & Clean Seed...");

  // 1. Delete all operational data
  await prisma.paymentAllocation.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.feePayment.deleteMany({});
  await prisma.advancePayment.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.dueDateAuditLog.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.feeAdjustment.deleteMany({});
  await prisma.feeCharge.deleteMany({});
  await prisma.studentFeeAssignment.deleteMany({});
  await prisma.feeStructureItem.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.feeHead.deleteMany({});
  await prisma.timetableSlot.deleteMany({});
  await prisma.teacherSubject.deleteMany({});
  await prisma.examResult.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.studentTransportAssignment.deleteMany({});
  await prisma.villageFeeHistory.deleteMany({});
  await prisma.transportVillage.deleteMany({});
  await prisma.parentStudent.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.parentGuardian.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.notice.deleteMany({});
  await prisma.classSection.deleteMany({});

  // Delete all non-admin users
  await prisma.user.deleteMany({
    where: {
      role: {
        notIn: [Role.SUPER_ADMIN, Role.ADMIN],
      },
    },
  });

  // 2. Super Admin & Admin Users
  await seedAdminUser();

  // 3. Academic Session
  const session = await prisma.academicSession.upsert({
    where: { name: "2026-27" },
    update: { isCurrent: true },
    create: {
      name: "2026-27",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-05-31"),
      isCurrent: true,
    },
  });

  // 4. Create 15 Teachers
  const teacherPasswordHash = await hashPassword("teacher123");
  const teacherDefs = [
    { name: "Rajesh Sharma", email: "rajesh.sharma@school.com", phone: "9876543210", subject: "Mathematics", qual: "M.Sc. Mathematics, B.Ed" },
    { name: "Sunita Verma", email: "sunita.verma@school.com", phone: "9876543211", subject: "Science", qual: "M.Sc. Physics, B.Ed" },
    { name: "Amit Gupta", email: "amit.gupta@school.com", phone: "9876543212", subject: "English", qual: "M.A. English, B.Ed" },
    { name: "Priya Singh", email: "priya.singh@school.com", phone: "9876543213", subject: "Physics", qual: "M.Sc. Physics, M.Ed" },
    { name: "Vikram Malhotra", email: "vikram.malhotra@school.com", phone: "9876543214", subject: "Chemistry", qual: "M.Sc. Chemistry, B.Ed" },
    { name: "Neha Kapoor", email: "neha.kapoor@school.com", phone: "9876543215", subject: "Social Studies", qual: "M.A. History, B.Ed" },
    { name: "Anil Kumar", email: "anil.kumar@school.com", phone: "9876543216", subject: "Computer Science", qual: "M.Tech CSE" },
    { name: "Meenakshi Joshi", email: "meenakshi.joshi@school.com", phone: "9876543217", subject: "Hindi", qual: "M.A. Hindi Literature, B.Ed" },
    { name: "Suresh Pandey", email: "suresh.pandey@school.com", phone: "9876543218", subject: "Mathematics", qual: "B.Tech, B.Ed" },
    { name: "Kavita Reddy", email: "kavita.reddy@school.com", phone: "9876543219", subject: "Biology", qual: "M.Sc. Zoology, B.Ed" },
    { name: "Deepak Saxena", email: "deepak.saxena@school.com", phone: "9876543220", subject: "Physical Education", qual: "M.P.Ed" },
    { name: "Ritu Agarwal", email: "ritu.agarwal@school.com", phone: "9876543221", subject: "Art & Craft", qual: "B.F.A Fine Arts" },
    { name: "Manoj Mishra", email: "manoj.mishra@school.com", phone: "9876543222", subject: "History", qual: "M.A. History, M.Phil" },
    { name: "Shalini Tripathi", email: "shalini.tripathi@school.com", phone: "9876543223", subject: "Economics", qual: "M.A. Economics, B.Ed" },
    { name: "Sanjay Nambiar", email: "sanjay.nambiar@school.com", phone: "9876543224", subject: "Geography", qual: "M.Sc. Geography, B.Ed" },
  ];

  const createdStaffRecords: any[] = [];
  for (const t of teacherDefs) {
    const user = await prisma.user.create({
      data: {
        email: t.email,
        passwordHash: teacherPasswordHash,
        role: Role.TEACHER,
        name: t.name,
      },
    });

    const staff = await prisma.staff.create({
      data: {
        userId: user.id,
        qualifications: t.qual,
        contact: t.phone,
      },
    });

    createdStaffRecords.push(staff);
  }

  // 5. Create 10 Class Sections (Class 1-A to Class 10-A strictly)
  const createdClasses: Record<number, any> = {};
  for (let c = 1; c <= 10; c++) {
    const teacherForClass = createdStaffRecords[(c - 1) % createdStaffRecords.length];
    const cs = await prisma.classSection.create({
      data: {
        sessionId: session.id,
        className: `Class ${c}`,
        section: "A",
        classTeacherId: teacherForClass.id,
      },
    });
    createdClasses[c] = cs;
  }

  // 6. Create 5 Students per Class (50 Students Total)
  const studentPasswordHash = await hashPassword("student123");
  const parentPasswordHash = await hashPassword("parent123");

  const studentNamePool = [
    { first: "Aarav", last: "Sharma", gender: "MALE" },
    { first: "Ananya", last: "Verma", gender: "FEMALE" },
    { first: "Vivaan", last: "Gupta", gender: "MALE" },
    { first: "Diya", last: "Singh", gender: "FEMALE" },
    { first: "Aditya", last: "Malhotra", gender: "MALE" },
    { first: "Ishani", last: "Kapoor", gender: "FEMALE" },
    { first: "Kabir", last: "Joshi", gender: "MALE" },
    { first: "Myra", last: "Pandey", gender: "FEMALE" },
    { first: "Reyansh", last: "Kumar", gender: "MALE" },
    { first: "Saanvi", last: "Saxena", gender: "FEMALE" },
  ];

  let overallStudentCount = 0;

  for (let c = 1; c <= 10; c++) {
    const cs = createdClasses[c];

    for (let sIndex = 1; sIndex <= 5; sIndex++) {
      overallStudentCount++;
      const nameObj = studentNamePool[(overallStudentCount - 1) % studentNamePool.length];
      const fullName = `${nameObj.first} ${nameObj.last}`;
      const admNo = `ADM2026${String(overallStudentCount).padStart(3, "0")}`;
      const rollNo = sIndex;
      const studentEmail = `student${overallStudentCount}@school.com`;
      const parentEmail = `parent${overallStudentCount}@school.com`;

      const birthYear = 2026 - (5 + c);
      const dob = new Date(`${birthYear}-05-15`);

      const sUser = await prisma.user.create({
        data: {
          email: studentEmail,
          passwordHash: studentPasswordHash,
          role: Role.STUDENT,
          name: fullName,
        },
      });

      const studentRecord = await prisma.student.create({
        data: {
          userId: sUser.id,
          classSectionId: cs.id,
          admissionNo: admNo,
          name: fullName,
          rollNo: String(rollNo),
          dob: dob,
          gender: nameObj.gender as any,
          address: `House ${10 + overallStudentCount}, Block B, City Colony`,
          fatherName: `Ramesh ${nameObj.last}`,
          motherName: `Sunita ${nameObj.last}`,
          fatherContact: `98100${String(10000 + overallStudentCount)}`,
          isActive: true,
        },
      });

      const pUser = await prisma.user.create({
        data: {
          email: parentEmail,
          passwordHash: parentPasswordHash,
          role: Role.PARENT,
          name: `Ramesh ${nameObj.last}`,
        },
      });

      const parentGuardian = await prisma.parentGuardian.create({
        data: {
          userId: pUser.id,
          contact: `98100${String(10000 + overallStudentCount)}`,
        },
      });

      await prisma.parentStudent.create({
        data: {
          parentId: parentGuardian.id,
          studentId: studentRecord.id,
        },
      });
    }
  }

  console.log(`✅ Created ${overallStudentCount} Full Detail Students (5 per class across Class 1-A to 10-A)`);
  console.log("🎉 Full Database Reset & Seed Completed!");

  return {
    classesCount: 10,
    staffCount: createdStaffRecords.length,
    studentsCount: overallStudentCount,
  };
};
