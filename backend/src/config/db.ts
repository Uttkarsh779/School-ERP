import { prisma } from "./prisma";

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("[Database] Connected successfully!");
  } catch (error) {
    console.error("[Database] Connection failed:", error);
    process.exit(1);
  }
};
