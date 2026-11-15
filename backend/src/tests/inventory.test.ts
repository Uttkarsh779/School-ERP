import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import * as inv from "../modules/inventory/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Inventory: opening stock, receive, issue (never below zero, even at the same moment),
// returns only up to what someone holds, stock count, write-off, void rules, low stock,
// "With staff", stock value and the Excel sheets. Throwaway category, items and staff.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));
const stockOf = async (id: number) => Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).stock);

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
    const office = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-o@test.local`, passwordHash: "x", role: "ADMIN", name: `${tag} Office` } }));
    const sUser = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-s@test.local`, passwordHash: "x", role: "TEACHER", name: `${tag} PT Teacher`, isActive: false } }));
    const staff = rows.add("teachers", await prisma.staff.create({ data: { userId: sUser.id } }));
    const cat = rows.add("InventoryCategory", await inv.saveCategory(office.id, null, { name: `${tag} Sports` }));
    await rejects(inv.saveCategory(office.id, null, { name: `${tag} sports` }), /already a category/);

    // Items: a returnable one with opening stock, a consumable one.
    const balls = rows.add("InventoryItem", await inv.createItem(office.id, { name: `${tag} Football`, categoryId: cat.id, unit: "pcs", returnable: true, minStock: 3, openingStock: 10, unitCost: 450 }));
    const chalk = rows.add("InventoryItem", await inv.createItem(office.id, { name: `${tag} Chalk`, categoryId: cat.id, unit: "box", minStock: 0 }));
    await rejects(inv.createItem(office.id, { name: `${tag} FOOTBALL`, categoryId: cat.id }), /already in the list/);
    await rejects(inv.createItem(office.id, { name: `${tag} X`, categoryId: 0 }), /Choose a category/);
    assert.equal(await stockOf(balls.id), 10);

    // Receive, with cost (latest cost is used for the stock value).
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "IN", quantity: 0 }), /more than 0/);
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "IN", quantity: 5, movedOn: "2999-01-01" }), /future/);
    await inv.recordMovement(office.id, { itemId: chalk.id, type: "IN", quantity: 20, supplier: "Sharma Stationers", billNo: "B-11", unitCost: 30 });
    assert.equal(await stockOf(chalk.id), 20);

    // Issue: needs a receiver, can't exceed stock; two issues of the last 6 at the same time → one wins.
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "ISSUE", quantity: 2 }), /Issued to whom/);
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "ISSUE", quantity: 25, issuedTo: "Class 5A" }), /Only 20 box/);
    await inv.recordMovement(office.id, { itemId: chalk.id, type: "ISSUE", quantity: 14, issuedTo: "Class 5A" });
    const race = await Promise.allSettled([
      inv.recordMovement(office.id, { itemId: chalk.id, type: "ISSUE", quantity: 6, issuedTo: "Class 6A" }),
      inv.recordMovement(office.id, { itemId: chalk.id, type: "ISSUE", quantity: 6, issuedTo: "Class 6B" }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1, "only one of two simultaneous issues of the last stock succeeds");
    assert.equal(await stockOf(chalk.id), 0);
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "RETURN", quantity: 1, issuedTo: "Class 5A" }), /isn't a returnable item/);

    // Returnable: issue to staff (no login needed), return only what they hold.
    const issue = await inv.recordMovement(office.id, { itemId: balls.id, type: "ISSUE", quantity: 4, staffId: staff.id, note: "Sports day" });
    await inv.recordMovement(office.id, { itemId: balls.id, type: "ISSUE", quantity: 2, issuedTo: "Sports room" });
    assert.equal(await stockOf(balls.id), 4);
    let items = await inv.listItems({ q: tag });
    let ballRow = items.find((i) => i.id === balls.id)!;
    assert.equal(ballRow.withStaff, 6);
    assert.equal(ballRow.isLow, false);
    assert.equal(ballRow.stockValue, 1800);
    await rejects(inv.recordMovement(office.id, { itemId: balls.id, type: "RETURN", quantity: 5, staffId: staff.id }), /only 4 pcs/);
    await rejects(inv.recordMovement(office.id, { itemId: balls.id, type: "RETURN", quantity: 1, issuedTo: "Library" }), /No .* recorded as issued/);
    const ret = await inv.recordMovement(office.id, { itemId: balls.id, type: "RETURN", quantity: 3, staffId: staff.id });
    await inv.recordMovement(office.id, { itemId: balls.id, type: "RETURN", quantity: 2, issuedTo: "sports ROOM" }); // matched ignoring case
    const held = (await inv.listWithStaff()).filter((r) => r.itemId === balls.id);
    assert.deepEqual(held.map((r) => [r.holder, r.quantity]), [[`${tag} PT Teacher`, 1]]);
    await rejects(inv.updateItem(office.id, balls.id, { returnable: false }), /still with staff/);

    // Void: an issue that's partly returned can't be voided until the return is.
    await rejects(inv.voidMovement(office.id, issue.id, "wrong"), /already been returned/);
    await rejects(inv.voidMovement(office.id, ret.id, ""), /Say why/);
    await inv.voidMovement(office.id, ret.id, "Entered twice");
    await rejects(inv.voidMovement(office.id, ret.id, "again"), /already void/);
    assert.equal(await stockOf(balls.id), 6);

    // Stock count and write-off.
    await rejects(inv.recordMovement(office.id, { itemId: balls.id, type: "ADJUST", countedStock: 6, note: "Count" }), /matches the stock/);
    await rejects(inv.recordMovement(office.id, { itemId: balls.id, type: "ADJUST", countedStock: 5 }), /Add a note/);
    const count = await inv.recordMovement(office.id, { itemId: balls.id, type: "ADJUST", countedStock: 5, note: "Annual stock check" });
    assert.equal(Number(count.change), -1);
    await rejects(inv.recordMovement(office.id, { itemId: balls.id, type: "WRITE_OFF", quantity: 2 }), /Say why/);
    await inv.recordMovement(office.id, { itemId: balls.id, type: "WRITE_OFF", quantity: 2, note: "Punctured" });
    assert.equal(await stockOf(balls.id), 3);
    items = await inv.listItems({ q: tag, low: "true" });
    assert.deepEqual(items.map((i) => i.id), [balls.id], "at or below the low-stock level");

    // Voiding the opening stock now would take stock below zero → refused.
    const opening = await prisma.inventoryMovement.findFirstOrThrow({ where: { itemId: balls.id, note: "Opening stock" } });
    await rejects(inv.voidMovement(office.id, opening.id, "test"), /below zero/);

    // Switched-off items can't take entries.
    await inv.updateItem(office.id, chalk.id, { isActive: false });
    await rejects(inv.recordMovement(office.id, { itemId: chalk.id, type: "IN", quantity: 1 }), /switched off/);

    // Excel sheets.
    const sheets = await inv.stockRegisterSheets(undefined, undefined);
    assert.deepEqual(sheets.map((s) => s.name), ["Stock", "Entries", "With staff"]);
    assert.ok(sheets[1].rows.some((r: any) => r.itemId === balls.id && r.voided.startsWith("Void")));

    // The issuable staff list includes staff without a login.
    assert.ok((await inv.listIssuableStaff()).some((s) => s.id === staff.id));

    console.log("inventory: all checks passed");
  } finally {
    const itemIds = (await prisma.inventoryItem.findMany({ where: { name: { startsWith: tag } }, select: { id: true } })).map((i) => i.id);
    await prisma.inventoryMovement.deleteMany({ where: { itemId: { in: itemIds } } });
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
