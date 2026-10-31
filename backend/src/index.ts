import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import { seedAdminUser } from "./config/seed";
import { startFeeReminderJob } from "./modules/notifications/events";
import { startAutoBillingJob } from "./modules/fees/billingSettingsService";
import { startCalendarJob } from "./modules/calendar/service";

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  await connectDB();
  await seedAdminUser();

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
  startFeeReminderJob();
  startAutoBillingJob();
  startCalendarJob();
};

start().catch((err) => {
  console.error("[Server] Fatal Startup Error:", err);
  process.exit(1);
});

