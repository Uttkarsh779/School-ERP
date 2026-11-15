import "dotenv/config";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import app from "../app";
import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { resetStaffPassword } from "../modules/staff/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// A password change or reset signs the account out on every other device: their refresh
// token stops working. The device that changed its own password gets fresh tokens.
const main = async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));
  const refresh = (token: string) =>
    fetch(`${base}/users/ref-token`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, json: (await r.json()) as any }));

  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
    const email = `${tag.toLowerCase()}@test.local`;
    const user = rows.add("User", await prisma.user.create({ data: { email, passwordHash: await hashPassword("OldPass123"), role: "TEACHER", name: `${tag} Teacher` } }));
    const staff = rows.add("teachers", await prisma.staff.create({ data: { userId: user.id, staffCategory: "TEACHER" } }));
    const signIn = async (password: string) => {
      const r = await post("/users/login", { email, password, loginMode: "staff" });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      return r.json.data as { accessToken: string; refreshToken: string };
    };

    // Two devices; refreshing works and keeps working.
    const phone = await signIn("OldPass123");
    const laptop = await signIn("OldPass123");
    const phoneRefreshed = await refresh(phone.refreshToken);
    assert.equal(phoneRefreshed.status, 200);

    // Changing the password on the laptop: laptop gets new tokens, phone is signed out.
    const changed = await post("/profile/change-password", { currentPassword: "OldPass123", newPassword: "NewPass123" }, laptop.accessToken);
    assert.equal(changed.status, 200, JSON.stringify(changed.json));
    assert.equal((await refresh(phoneRefreshed.json.refreshToken)).status, 401, "other device signed out");
    assert.equal((await refresh(laptop.refreshToken)).status, 401, "the laptop's old token is replaced too");
    const laptopNew = await refresh(changed.json.data.refreshToken);
    assert.equal(laptopNew.status, 200, "this device stays signed in");

    // A reset by the Super Admin signs out everyone, including that laptop.
    await resetStaffPassword(staff.id, "Reset1234");
    const after = await refresh(laptopNew.json.refreshToken);
    assert.equal(after.status, 401);
    assert.match(after.json.message, /password was changed/);
    // Signing in with the new password works.
    assert.equal((await refresh((await signIn("Reset1234")).refreshToken)).status, 200);

    console.log("token version: all checks passed");
  } finally {
    await rows.remove();
    await new Promise<void>((r) => server.close(() => r()));
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
