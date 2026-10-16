import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Wire WebSocket implementation for Neon in Node.js
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    `[prisma.ts] DATABASE_URL is not set. Looked in: ${path.resolve(__dirname, "../../.env")}`
  );
}

// In @prisma/adapter-neon v7, PrismaNeon takes neon.PoolConfig directly and manages the pool.
const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter }) as any;
