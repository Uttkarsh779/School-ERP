import assert from "node:assert";
import { describe, test } from "node:test";
import { computeMonthBill, type BillingContext } from "../modules/fees/billingService";
import { applyConcessions, type ConcessionContext } from "../modules/concessions/concessionCalculationService";
import { withLateFees } from "../modules/fees/lateFeeService";

// Billing rules shared by every billing path, the once-per-month late fine and concession
// head selection. Pure — no database (withLateFees gets a stub db).

const TUITION = 1;
const COMPUTER = 2;
const TRANSPORT = 9;

const noConcessions: ConcessionContext = { studentConcessions: [] };

const ctxFor = (overrides: Partial<BillingContext["student"]> = {}, concessions = noConcessions, policy = "FULL_MONTH"): BillingContext => ({
  sessionId: 1,
  student: { id: 1, isActive: true, admissionDate: new Date(2026, 3, 1), feeAssignments: [{ feeStructureId: 10, joiningDatePolicy: policy }], ...overrides },
  feeStructure: {
    id: 10,
    items: [
      { id: 100, feeHeadId: TUITION, amount: 2000, frequency: "MONTHLY", applicableMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], dueDateDay: 10, feeHead: { name: "Tuition Fee", code: "TUITION" } },
      { id: 101, feeHeadId: COMPUTER, amount: 300, frequency: "MONTHLY", applicableMonths: [], dueDateDay: 10, feeHead: { name: "Computer Fee", code: "COMPUTER" } },
      { id: 102, feeHeadId: 3, amount: 6000, frequency: "ANNUAL", applicableMonths: [4], dueDateDay: 10, feeHead: { name: "Annual Charges", code: "ANNUAL" } },
    ],
  },
  transportAssignments: [
    { startDate: new Date(2026, 3, 1), endDate: null, policy: "FULL_MONTH", village: { monthlyFee: 1500, feeHistory: [] } },
  ],
  transportHead: { id: TRANSPORT, name: "Transport Fee", code: "TRANSPORT" },
  concessions,
});

describe("monthly bill", () => {
  test("bills each fee head separately, with transport", () => {
    const bill = computeMonthBill(ctxFor(), 4, 2026);
    assert.ok(bill.eligible);
    assert.deepStrictEqual(bill.lines.map((l) => [l.feeHeadId, l.baseAmount]), [[TUITION, 2000], [COMPUTER, 300], [3, 6000], [TRANSPORT, 1500]]);
    assert.strictEqual(bill.total, 9800);
    const may = computeMonthBill(ctxFor(), 5, 2026);
    assert.strictEqual(may.total, 3800, "annual charge only in April");
  });

  test("every fee on a bill, transport included, is due on the same day", () => {
    const ctx = ctxFor();
    ctx.dueDay = 7;
    ctx.feeStructure.items[0].dueDateDay = 25; // an old per-fee day is ignored
    const bill = computeMonthBill(ctx, 4, 2026);
    assert.ok(bill.lines.length > 1);
    assert.ok(bill.lines.every((l) => l.dueDate.getDate() === 7));
  });

  test("students are not billed for months before their admission", () => {
    const ctx = ctxFor({ admissionDate: new Date(2026, 7, 12) }); // 12 Aug
    const july = computeMonthBill(ctx, 7, 2026);
    assert.strictEqual(july.eligible, false);
    assert.strictEqual(july.notEnrolled, true);
    assert.strictEqual(computeMonthBill(ctx, 8, 2026).eligible, true);
  });

  test("inactive students are not billed", () => {
    assert.strictEqual(computeMonthBill(ctxFor({ isActive: false }), 9, 2026).eligible, false);
  });

  test("joining-month policies", () => {
    const joinedOn15 = { admissionDate: new Date(2026, 8, 16) }; // 16 Sep -> 15 of 30 days
    const prorated = computeMonthBill(ctxFor(joinedOn15, noConcessions, "PRORATED"), 9, 2026);
    assert.strictEqual(prorated.lines.find((l) => l.feeHeadId === TUITION)!.baseAmount, 1000);
    const nextMonth = computeMonthBill(ctxFor(joinedOn15, noConcessions, "NEXT_MONTH"), 9, 2026);
    assert.deepStrictEqual(nextMonth.lines.map((l) => l.feeHeadId), [TRANSPORT], "structure fees start next month");
  });

  test("discounts are applied per head on the bill", () => {
    const concessions: ConcessionContext = {
      ...noConcessions,
      studentConcessions: [{ id: 5, type: "SCHOLARSHIP", calculationType: "PERCENTAGE", value: 50, applicableHeads: [TUITION], reason: "Merit" }],
    };
    const bill = computeMonthBill(ctxFor({}, concessions), 5, 2026);
    const tuition = bill.lines.find((l) => l.feeHeadId === TUITION)!;
    assert.strictEqual(tuition.discountAmount, 1000);
    assert.strictEqual(tuition.netAmount, 1000);
    assert.strictEqual(bill.total, 2800);
  });
});

describe("concessions", () => {
  const items = [
    { feeHeadId: TUITION, headName: "Tuition", code: "TUITION", amount: 2000 },
    { feeHeadId: COMPUTER, headName: "Computer", code: "COMPUTER", amount: 300 },
  ];

  test("no fee heads selected means all heads on the bill", () => {
    const ctx: ConcessionContext = {
      ...noConcessions,
      studentConcessions: [{ id: 1, type: "SPECIAL_CONCESSION", calculationType: "PERCENTAGE", value: 10, applicableHeads: [], reason: "Hardship" }],
    };
    const applied = applyConcessions(ctx, 5, 2026, items);
    assert.deepStrictEqual(applied.map((a) => [a.feeHeadId, a.amount]), [[TUITION, 200], [COMPUTER, 30]]);
  });

  test("staff-child discount follows employment, not login access", () => {
    const driver = { id: 7, staffCategory: "DRIVER", isActive: true }; // drivers have no login
    const conc = { id: 9, type: "STAFF_CHILD", calculationType: "PERCENTAGE", value: 40, applicableHeads: [TUITION], staffId: driver.id, staff: driver, reason: "Staff child" };
    const employed = applyConcessions({ studentConcessions: [conc] }, 5, 2026, items);
    assert.deepStrictEqual(employed.map((a) => [a.feeHeadId, a.amount]), [[TUITION, 800]]);
    const left = applyConcessions({ studentConcessions: [{ ...conc, staff: { ...driver, isActive: false } }] }, 5, 2026, items);
    assert.strictEqual(left.length, 0);
  });

  test("a hand-assigned sibling discount applies like any other concession", () => {
    const conc = { id: 11, type: "SIBLING_DISCOUNT", calculationType: "PERCENTAGE", value: 25, applicableHeads: [TUITION], reason: "Sibling Discount" };
    const applied = applyConcessions({ studentConcessions: [conc] }, 5, 2026, items);
    assert.deepStrictEqual(applied.map((a) => [a.feeHeadId, a.amount]), [[TUITION, 500]]);
  });
});

describe("late fine once per month", () => {
  const rule = { sessionId: 1, gracePeriodDays: 5, feeType: "FIXED", amount: 50, slabsJson: null, createdAt: new Date() };
  const charge = (id: number, feeHeadId: number, status = "UNPAID", lateFeeAmount = 0) => ({
    id,
    studentId: 1,
    sessionId: 1,
    feeHeadId,
    billingYear: 2026,
    billingMonth: 9,
    dueDate: new Date(2026, 8, 10),
    status,
    baseAmount: 1000,
    discountAmount: 0,
    lateFeeAmount,
    paidAmount: status === "PAID" ? 1000 : 0,
  });
  const stubDb = (all: any[]) => ({
    feeCharge: { findMany: async () => all },
    lateFeeRule: { findMany: async () => [rule] },
    feeAdjustment: { groupBy: async () => [] },
  });
  const asOf = new Date(2026, 9, 1);

  test("one fine for the month, on one charge, whichever charges are asked about", async () => {
    const all = [charge(1, TUITION), charge(2, COMPUTER), charge(3, TRANSPORT)];
    const full = await withLateFees(stubDb(all), all as any, asOf);
    assert.deepStrictEqual(full.map((r) => r.lateFee), [50, 0, 0]);
    const onlyComputer = await withLateFees(stubDb(all), [all[1]] as any, asOf);
    assert.strictEqual(onlyComputer[0].lateFee, 0, "fine stays on the carrier charge");
  });

  test("a fine already collected for the month is not charged again", async () => {
    const all = [charge(1, TUITION, "PAID", 50), charge(2, COMPUTER)];
    const result = await withLateFees(stubDb(all), all as any, asOf);
    assert.deepStrictEqual(result.map((r) => r.lateFee), [50, 0]);
  });

  test("when the carrier is paid, the fine moves to the month's remaining open charge", async () => {
    const all = [charge(1, TUITION, "PAID", 0), charge(2, COMPUTER)];
    const result = await withLateFees(stubDb(all), all as any, asOf);
    assert.deepStrictEqual(result.map((r) => r.lateFee), [0, 50]);
  });
});
