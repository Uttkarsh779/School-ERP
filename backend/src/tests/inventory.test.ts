import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma";
import * as inv from "../modules/inventory/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

// Inventory documents end to end: item with opening stock, goods receipt (several items,
// rates), issue slip with a consumed line and a to-be-returned line, never below zero (even at
// the same moment), receive back (good + damaged, partial), closing a lost item, issue status,
// pending returns, stock check, damage, void rules, stock ledger, Excel sheets.
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: any) => re.test(e.message));
const stockOf = async (id: number) => Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).stock);

const main = async () => {
  const rows = trackTestRows();
  const tag = uniqueTag();
  let itemIds: number[] = [];
  try {
    const office = { id: rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-o@test.local`, passwordHash: "x", role: "ADMIN", name: `${tag} Office` } })).id, role: "ADMIN" };
    const sUser = rows.add("User", await prisma.user.create({ data: { email: `${tag.toLowerCase()}-s@test.local`, passwordHash: "x", role: "TEACHER", name: `${tag} PT Teacher`, isActive: false } }));
    const staff = rows.add("teachers", await prisma.staff.create({ data: { userId: sUser.id } }));
    const cat = rows.add("InventoryCategory", await inv.saveCategory(office.id, null, { name: `${tag} Sports` }));

    // Items: football (usually returned) with opening stock, chalk (consumed).
    const ball = await inv.createItem(office, { name: `${tag} Football`, categoryId: cat.id, unit: "pcs", returnable: true, reorderLevel: 3, openingStock: 10, rate: 450 });
    const chalk = await inv.createItem(office, { name: `${tag} Chalk`, categoryId: cat.id, unit: "box" });
    itemIds = [ball.id, chalk.id];
    await rejects(inv.createItem(office, { name: `${tag} FOOTBALL`, categoryId: cat.id }), /already in the list/);
    assert.equal(await stockOf(ball.id), 10);

    // Goods receipt: two items on one document.
    await rejects(inv.createReceipt(office, { lines: [{ itemId: chalk.id, quantity: 5 }] }), /Who supplied/);
    await rejects(inv.createReceipt(office, { supplier: "X", lines: [{ itemId: chalk.id, quantity: 5 }, { itemId: chalk.id, quantity: 1 }] }), /two lines/);
    await rejects(inv.createReceipt(office, { supplier: "X", docDate: "2999-01-01", lines: [{ itemId: chalk.id, quantity: 5 }] }), /future/);
    const grn = await inv.createReceipt(office, { supplier: "Sharma Stationers", billNo: "B-11", lines: [{ itemId: chalk.id, quantity: 20, rate: 30 }, { itemId: ball.id, quantity: 2, rate: 500 }] });
    assert.match(grn.docNo, /^GRN-\d{4}$/);
    assert.equal(grn.lines[0].amount, 600);
    assert.equal(await stockOf(chalk.id), 20);
    assert.equal(await stockOf(ball.id), 12);

    // Issue slip: chalk consumed, footballs to be returned by a date.
    await rejects(inv.createIssue(office, { lines: [{ itemId: chalk.id, quantity: 2 }] }), /Issued to whom/);
    await rejects(inv.createIssue(office, { department: "5A", lines: [{ itemId: chalk.id, quantity: 25 }] }), /Only 20 box/);
    const iss = await inv.createIssue(office, {
      staffId: staff.id,
      purpose: "Sports day",
      expectedReturnOn: "2999-01-01",
      lines: [
        { itemId: chalk.id, quantity: 2 },
        { itemId: ball.id, quantity: 5, toReturn: true, remark: "Tags 1-5" },
      ],
    });
    assert.match(iss.docNo, /^ISS-\d{4}$/);
    assert.equal(iss.status, "OUT");
    // Once the due date has passed it shows as overdue.
    await prisma.inventoryDoc.update({ where: { id: iss.id }, data: { expectedReturnOn: new Date("2000-01-02") } });
    assert.equal((await inv.getDoc(iss.id)).status, "OVERDUE");
    assert.equal(await stockOf(ball.id), 7);
    let items = await inv.listItems({ q: tag });
    const ballRow = items.find((i) => i.id === ball.id)!;
    assert.equal(ballRow.issuedOut, 5);
    assert.equal(ballRow.total, 12, "in store + issued out = owned");

    // Never below zero, even with two issues of the last 18 boxes at the same moment.
    const race = await Promise.allSettled([
      inv.createIssue(office, { department: "Class 6A", lines: [{ itemId: chalk.id, quantity: 18 }] }),
      inv.createIssue(office, { department: "Class 6B", lines: [{ itemId: chalk.id, quantity: 18 }] }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await stockOf(chalk.id), 0);

    // Receive back against the slip: 2 good + 1 damaged; only what's still out.
    const ballLine = iss.lines.find((l: any) => l.itemId === ball.id)!;
    const chalkLine = iss.lines.find((l: any) => l.itemId === chalk.id)!;
    await rejects(inv.receiveBack(office, iss.id, { lines: [{ lineId: chalkLine.id, good: 1 }] }), /isn't on this issue slip as 'to be returned'/);
    await rejects(inv.receiveBack(office, iss.id, { lines: [{ lineId: ballLine.id, good: 6 }] }), /Only 5 pcs/);
    await rejects(inv.receiveBack(office, iss.id, { lines: [{ lineId: ballLine.id, good: 0 }] }), /how many came back/);
    let slip = await inv.receiveBack(office, iss.id, { lines: [{ lineId: ballLine.id, good: 2, damaged: 1 }] });
    assert.equal(await stockOf(ball.id), 9, "good ones back in stock, damaged not");
    assert.equal(slip.status, "OVERDUE");
    assert.equal(slip.lines.find((l: any) => l.id === ballLine.id).balance.out, 2);
    assert.equal(slip.settlements.length, 1);
    assert.match(slip.settlements[0].docNo, /^RET-/);

    // One lost, one came back later; the slip is settled and leaves pending returns.
    await rejects(inv.closeIssueLine(office, iss.id, { lineId: ballLine.id, quantity: 1, reason: "LOST" }), /short note/);
    slip = await inv.closeIssueLine(office, iss.id, { lineId: ballLine.id, quantity: 1, reason: "LOST", note: "Kicked into the river" });
    assert.equal(await stockOf(ball.id), 9, "closing a lost item doesn't change stock (it already left)");
    assert.ok((await inv.pendingReturns()).some((r) => r.issueId === iss.id && r.out === 1));
    slip = await inv.receiveBack(office, iss.id, { lines: [{ lineId: ballLine.id, good: 1 }] });
    assert.equal(slip.status, "SETTLED");
    assert.equal(await stockOf(ball.id), 10);
    assert.ok(!(await inv.pendingReturns()).some((r) => r.issueId === iss.id));
    await rejects(inv.closeIssueLine(office, iss.id, { lineId: ballLine.id, reason: "LOST", note: "x" }), /Nothing is still out/);

    // Void: an issue with returns can't be voided until they are.
    await rejects(inv.voidDoc(office, iss.id, "wrong"), /returned or closed/);

    // Stock check and damage.
    await rejects(inv.createAdjustment(office, { reason: "COUNT", note: "Count", lines: [{ itemId: ball.id, counted: 10 }] }), /matches the book/);
    const adj = await inv.createAdjustment(office, { reason: "COUNT", note: "Annual stock check", lines: [{ itemId: ball.id, counted: 10 }, { itemId: chalk.id, counted: 1 }] });
    assert.equal(adj.lines.length, 1, "only items that differ are adjusted");
    assert.equal(await stockOf(chalk.id), 1);
    await rejects(inv.createAdjustment(office, { reason: "DAMAGED", lines: [{ itemId: ball.id, quantity: 1 }] }), /Add a note/);
    await inv.createAdjustment(office, { reason: "DAMAGED", note: "Punctured", lines: [{ itemId: ball.id, quantity: 7 }] });
    assert.equal(await stockOf(ball.id), 3);
    items = await inv.listItems({ q: tag, low: "true" });
    assert.deepEqual(items.map((i) => i.id), [ball.id], "at or below reorder level");

    // Voiding the goods receipt now would take stock below zero → refused.
    await rejects(inv.voidDoc(office, grn.id, "test"), /below zero/);

    // Stock ledger: running balance ends at the stock.
    const ledger = await inv.itemLedger(ball.id, {});
    assert.equal(ledger.rows[0].docNo.slice(0, 4), "OPN-");
    assert.equal(ledger.rows.at(-1)!.balance, 3);

    // Lists and Excel.
    const issues = await inv.listDocs({ kind: "ISSUE", q: tag });
    assert.ok(issues.some((d: any) => d.id === iss.id && d.status === "SETTLED"));
    const sheets = await inv.stockRegisterSheets(undefined, undefined);
    assert.deepEqual(sheets.map((s) => s.name), ["Stock register", "Documents", "Pending returns"]);
    assert.ok((await inv.listIssuableStaff()).some((s) => s.id === staff.id), "staff without a login can be issued to");

    console.log("inventory: all checks passed");
  } finally {
    const docIds = (await prisma.inventoryDocLine.findMany({ where: { itemId: { in: itemIds } }, select: { docId: true } })).map((l) => l.docId);
    await prisma.inventoryDocLine.updateMany({ where: { docId: { in: docIds } }, data: { issueLineId: null } });
    await prisma.inventoryDoc.updateMany({ where: { id: { in: docIds } }, data: { issueId: null } });
    await prisma.inventoryDoc.deleteMany({ where: { id: { in: docIds } } });
    await prisma.inventoryItem.deleteMany({ where: { id: { in: itemIds } } });
    await rows.remove();
    await prisma.$disconnect();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
