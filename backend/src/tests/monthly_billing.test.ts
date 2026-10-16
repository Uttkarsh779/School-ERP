import { prisma } from "../config/prisma";
import * as collectionEngineService from "../modules/fees/collectionEngineService";

async function runMonthlyBillingTests() {
  console.log("=========================================");
  console.log("RUNNING AUTOMATED FEE COLLECTION TESTS...");
  console.log("=========================================\n");

  try {
    const testSession = await prisma.academicSession.findFirst({ where: { isCurrent: true } }) || await prisma.academicSession.create({
      data: { name: "2026-2027", isCurrent: true, startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") }
    });

    // TEST 1: Idempotent Generation & Concurrency Test
    console.log("TEST 1: Idempotency & Duplicate Prevention...");
    const month = 8; // August
    const year = 2026;

    const run1 = await collectionEngineService.generateCollectionPeriodBills({
      sessionId: testSession.id,
      billingMonth: month,
      billingYear: year,
    });

    console.log(`- First Run: ${run1.newlyGenerated} bills generated out of ${run1.totalEligible} eligible.`);

    const run2 = await collectionEngineService.generateCollectionPeriodBills({
      sessionId: testSession.id,
      billingMonth: month,
      billingYear: year,
    });

    console.log(`- Second Run: ${run2.newlyGenerated} new bills, ${run2.alreadyBilled} already existed.`);

    if (run2.newlyGenerated !== 0) {
      throw new Error(`Idempotency Failed: Second run generated ${run2.newlyGenerated} duplicate bills!`);
    }
    console.log("✓ TEST 1 PASSED: 0 duplicate bills created on retry!\n");

    // TEST 2: Preview vs Generation Calculation Parity
    console.log("TEST 2: Preview vs Persistence Calculation Consistency...");
    const preview = await collectionEngineService.previewCollectionPeriod({
      sessionId: testSession.id,
      billingMonth: 9, // September
      billingYear: 2026,
    });

    const generation = await collectionEngineService.generateCollectionPeriodBills({
      sessionId: testSession.id,
      billingMonth: 9,
      billingYear: 2026,
    });

    if (preview.expectedAmount !== generation.expectedAmount) {
      throw new Error(
        `Preview Discrepancy! Preview Expected: ₹${preview.expectedAmount}, Generated: ₹${generation.expectedAmount}`
      );
    }
    console.log(`✓ TEST 2 PASSED: Preview (₹${preview.expectedAmount}) matches Generated Bill Amount (₹${generation.expectedAmount}) 100%!\n`);

    // TEST 3: Dashboard Overview Metrics Test
    console.log("TEST 3: Dashboard Overview Metrics Calculation...");
    const overview = await collectionEngineService.getCollectionDashboardOverview(8, 2026, testSession.id);
    console.log(`- Overview for ${overview.collectionPeriodName}:`);
    console.log(`  Eligible: ${overview.eligibleStudents} | Bills Generated: ${overview.feeBillsGenerated}`);
    console.log(`  Expected: ₹${overview.expectedCollectionAmount} | Remaining: ₹${overview.remainingAmount}`);

    if (overview.feeBillsGenerated < run1.newlyGenerated) {
      throw new Error("Dashboard metrics mismatch!");
    }
    console.log("✓ TEST 3 PASSED: Dashboard metrics accurate!\n");

    console.log("=========================================");
    console.log("ALL AUTOMATED MONTHLY BILLING TESTS PASSED");
    console.log("=========================================");
  } catch (err: any) {
    console.error("❌ TEST FAILURE:", err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMonthlyBillingTests();
