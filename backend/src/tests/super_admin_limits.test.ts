import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import { assertNotLastSuperAdmin, setStaffActive, updateStaff, MAX_SUPER_ADMINS } from "../modules/staff/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// At most 2 active Super Admins; never fewer than 1. Uses throwaway staff; the school's real
// Super Admin is only read, never changed.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
    const realSuperAdmins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
    if (realSuperAdmins.length !== 1) {
      console.log(`Skipping: expects exactly 1 real Super Admin, found ${realSuperAdmins.length}`);
      return;
    }
    assert.equal(MAX_SUPER_ADMINS, 2);
    const makeTeacher = async (n: string) => {
      const user = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-${n}@test.local`, passwordHash: "x", role: "TEACHER", name: `${tag} ${n}` } }));
      return rows.add("teachers", await prisma.staff.create({ data: { userId: user.id, staffCategory: "TEACHER" } }));
    };
    const a = await makeTeacher("a");
    const b = await makeTeacher("b");
    const actor = realSuperAdmins[0].id;

    // The real one is the only Super Admin: removing it would be refused.
    await rejects(assertNotLastSuperAdmin(realSuperAdmins[0].id), /only active Super Admin/);

    // Second Super Admin: allowed. Third: refused.
    await updateStaff(a.id, { loginRole: "SUPER_ADMIN" as any }, actor);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).role, "SUPER_ADMIN");
    await rejects(updateStaff(b.id, { loginRole: "SUPER_ADMIN" as any }, actor), /already 2 Super Admins/);

    // With two, one can step down (here: deactivated, then demoted after being re-enabled).
    await setStaffActive(a.id, false);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).isActive, false);
    await setStaffActive(a.id, true);
    // A no-login designation counts as removing access too; allowed while another remains.
    await updateStaff(a.id, { loginRole: "TEACHER" as any }, actor);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).role, "TEACHER");

    // Now b can become the second one.
    await updateStaff(b.id, { loginRole: "SUPER_ADMIN" as any }, actor);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).role, "SUPER_ADMIN");

    console.log("super admin limits: all checks passed");
  } finally {
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
