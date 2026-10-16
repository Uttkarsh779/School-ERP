import * as collectionEngineService from "./collectionEngineService";

// Timezone-aware 1st-of-the-month billing job runner
export const runScheduledCollectionBilling = async () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    console.log(`[Collection Scheduler] Running automatic collection billing for ${month}/${year} (Asia/Kolkata)...`);
    const result = await collectionEngineService.generateCollectionPeriodBills({
      billingMonth: month,
      billingYear: year,
    });
    console.log(
      `[Collection Scheduler] Success: ${result.newlyGenerated} new bills generated, ${result.alreadyBilled} already existed, ${result.duplicatesSkipped} duplicates prevented.`
    );
    return result;
  } catch (err: any) {
    console.error("[Collection Scheduler] Failure running scheduled billing:", err?.message || err);
    throw err;
  }
};
