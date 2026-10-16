import "dotenv/config";
import { prisma } from "./src/config/prisma";

async function clean() {
  const sessions = await prisma.academicSession.findMany({
    where: { name: { startsWith: 'FamilyPaymentTest-' } },
  });
  
  if (sessions.length === 0) return;
  
  const sessionIds = sessions.map(s => s.id);

  const classSections = await prisma.classSection.findMany({ where: { sessionId: { in: sessionIds } } });
  const classSectionIds = classSections.map(cs => cs.id);
  
  const students = await prisma.student.findMany({ where: { classSectionId: { in: classSectionIds } } });
  const studentIds = students.map(s => s.id);
  
  if (studentIds.length > 0) {
    const payments = await prisma.payment.findMany({ where: { studentId: { in: studentIds } } });
    const paymentIds = payments.map(p => p.id);
    
    if (paymentIds.length > 0) await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.advancePayment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.feeCharge.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.payment.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.parentStudent.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { classSectionId: { in: classSectionIds } } });
  }

  await prisma.feeHead.deleteMany({ where: { name: { startsWith: 'Family Tuition' } } });
  await prisma.classSection.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.academicSession.deleteMany({ where: { id: { in: sessionIds } } });
  
  const parents = await prisma.parentGuardian.findMany({ where: { email: { startsWith: 'rajesh-' } } });
  const parentIds = parents.map(p => p.id);

  if (parentIds.length > 0) {
    await prisma.feeAuditLog.deleteMany({ where: { entityType: "PaymentBatch" } });
    await prisma.paymentBatch.deleteMany({ where: { parentGuardianId: { in: parentIds } } });
    await prisma.parentGuardian.deleteMany({ where: { id: { in: parentIds } } });
  }

  console.log('Cleaned up test sessions and dependent data!');
}

clean().finally(() => prisma.$disconnect());
