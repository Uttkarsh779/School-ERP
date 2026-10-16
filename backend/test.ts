import "dotenv/config";
import { prisma } from "./src/config/prisma";

async function test() {
  const user = await prisma.user.findUnique({ where: { email: 'superadmin@school.com' } });
  console.log('Super admin role:', user?.role);
}

test().finally(() => prisma.$disconnect());
