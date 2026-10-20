import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    `[prisma.ts] DATABASE_URL is not set. Looked in: ${path.resolve(__dirname, "../../.env")}`
  );
}

// Plain TCP Postgres pool (suits a long-running server better than Neon's WebSocket driver).
// Idle connections are closed before Neon drops them; a connection Neon still cuts (e.g. when
// the database auto-suspends) is logged in one line and replaced on the next query.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // allow time for a suspended Neon database to wake up
  keepAlive: true,
});
pool.on("error", (err) => {
  console.warn(`[Database] Idle connection closed by the server (${(err as any).code ?? err.message}); it will reconnect on the next query.`);
});

const adapter = new PrismaPg(pool);

// Interactive transactions (payment desk, marks entry, leave decisions) run many sequential
// queries; at ~300 ms per round trip to Neon they overrun Prisma's 5 s default and fail
// with "Transaction already closed".
export const prisma = new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 30_000 } }) as any;
