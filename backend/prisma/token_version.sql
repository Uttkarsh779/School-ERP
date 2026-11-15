-- Additive only: User.tokenVersion, raised on every password set/reset so other devices are
-- signed out at their next token refresh. Safe to run more than once.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
