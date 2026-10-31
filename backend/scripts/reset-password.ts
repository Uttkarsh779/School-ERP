// Emergency password reset from the server's command line, for when the Super Admin
// can't sign in. Usage (from the backend folder):
//   npm run reset-password -- superadmin@school.com NewPassword123
import "dotenv/config";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { validateNewPassword } from "../src/modules/profile/service";

const [email, password] = process.argv.slice(2);

(async () => {
  if (!email || !password) {
    console.log("Usage: npm run reset-password -- <email> <new password>");
    process.exit(1);
  }
  validateNewPassword(password);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No account with email ${email}`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), isActive: true } });
  console.log(`Password changed for ${email} (${user.role}).`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
