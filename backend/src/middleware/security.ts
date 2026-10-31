import type { Application, Request } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Standard HTTP protections for the API: security headers, which websites may call it,
// and a limit on password guessing.

// CORS_ORIGIN: comma-separated list of sites allowed to call the API (the ERP's own
// address, e.g. https://erp.rrsschool.in). Not set: any origin (local development).
export const applySecurity = (app: Application) => {
  // Behind a hosting proxy (Render, Railway, Nginx...) set TRUST_PROXY=1 so the real
  // visitor address is used for the login limit.
  if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const origins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors(origins.length ? { origin: origins } : undefined));
};

const tooMany = { success: false, message: "Too many wrong attempts. Please wait 15 minutes and try again, or ask the school office to reset your password." };
const loginId = (req: Request) => String(req.body?.email ?? "").trim().toLowerCase();

// Login: 10 wrong passwords per account, and 50 per network address, in 15 minutes.
// Successful logins don't count. Keyed by account as well as address because a whole
// school often shares one internet connection.
export const loginLimiters = [
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `acct:${loginId(req)}`,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany,
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany,
  }),
];
