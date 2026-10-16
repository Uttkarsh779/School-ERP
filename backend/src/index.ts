import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import { seedAdminUser } from "./config/seed";

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  await connectDB();
  await seedAdminUser();

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
};

start();
