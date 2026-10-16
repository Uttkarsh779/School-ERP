const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  await prisma.academicSession.deleteMany({
    where: { name: { startsWith: 'FamilyPaymentTest-' } },
  });
  console.log('Cleaned up test sessions');
}

clean().finally(() => prisma.$disconnect());
