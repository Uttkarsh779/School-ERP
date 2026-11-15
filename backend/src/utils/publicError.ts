import type { Response } from "express";
import { DATABASE_DOWN_MESSAGE, isDatabaseDown } from "../config/dbRetry";

// What a user may see of an error. Only messages we wrote ourselves go out: httpError(), or a
// plain `new Error("...")` from our own services. Anything else (Prisma, Postgres, a code bug
// like TypeError, Node system errors, Cloudinary) gets a safe message; the real one stays in
// the server log. Those carry a tell: their own class, a `code`, or they aren't Errors at all.

const GENERIC = "Something went wrong. Please try again.";

const PRISMA_MESSAGES: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: "This record already exists." },
  P2003: { status: 409, message: "This record is linked to other records, so it can't be changed or removed." },
  P2025: { status: 404, message: "This record wasn't found. It may have been removed already." },
};

const isOurs = (err: any) =>
  err instanceof Error && err.name === "Error" && (err as any).code === undefined && (err as any).http_code === undefined && !/prisma|invocation/i.test(err.message);

export const publicError = (err: any, fallback = GENERIC): { status: number; message: string } => {
  if (isDatabaseDown(err)) return { status: 503, message: DATABASE_DOWN_MESSAGE };
  if (PRISMA_MESSAGES[err?.code]) return PRISMA_MESSAGES[err.code];
  // Request body problems from express.json().
  if (err?.type === "entity.too.large") return { status: 413, message: "That's too much data to send at once." };
  if (typeof err?.type === "string" && err.type.startsWith("entity.")) return { status: 400, message: "The request couldn't be read. Please try again." };
  if (err?.name === "MulterError") {
    return err.code === "LIMIT_FILE_SIZE" ? { status: 413, message: "This file is too large. Please upload a smaller one." } : { status: 400, message: "This file couldn't be uploaded. Please try again." };
  }
  if (isOurs(err) && err.message) return { status: err.statusCode || err.status || 400, message: err.message };
  return { status: 500, message: fallback };
};

export const publicMessage = (err: unknown, fallback = GENERIC) => publicError(err, fallback).message;

// For routes that catch their own errors.
export const sendError = (res: Response, err: unknown, fallback?: string) => {
  const { status, message } = publicError(err, fallback);
  res.status(status).json({ success: false, message });
};
