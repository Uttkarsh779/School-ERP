-- Additive only: forgot-password codes (email / SMS OTP).
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

CREATE TABLE IF NOT EXISTS "PasswordReset" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PasswordReset_userId_createdAt_idx" ON "PasswordReset"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordReset_userId_fkey') THEN
    ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
