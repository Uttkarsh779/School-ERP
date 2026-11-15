-- Additive only: privacy notice, parental consent records and data requests (DPDP Act).
-- Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS "PrivacySetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "noticeText" TEXT NOT NULL,
    "noticeVersion" INTEGER NOT NULL DEFAULT 1,
    "grievanceName" TEXT,
    "grievanceEmail" TEXT,
    "grievancePhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivacySetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DataConsent" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "noticeVersion" INTEGER NOT NULL,
    "givenBy" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" INTEGER,
    "userAgent" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByUserId" INTEGER,
    "withdrawReason" TEXT,
    CONSTRAINT "DataConsent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataConsent_studentId_givenAt_idx" ON "DataConsent"("studentId", "givenAt");

CREATE TABLE IF NOT EXISTS "DataRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "requestedByUserId" INTEGER NOT NULL,
    "resolvedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataRequest_status_createdAt_idx" ON "DataRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataRequest_studentId_idx" ON "DataRequest"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataConsent_studentId_fkey') THEN
    ALTER TABLE "DataConsent" ADD CONSTRAINT "DataConsent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataConsent_recordedByUserId_fkey') THEN
    ALTER TABLE "DataConsent" ADD CONSTRAINT "DataConsent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataConsent_withdrawnByUserId_fkey') THEN
    ALTER TABLE "DataConsent" ADD CONSTRAINT "DataConsent_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataRequest_studentId_fkey') THEN
    ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataRequest_requestedByUserId_fkey') THEN
    ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataRequest_resolvedByUserId_fkey') THEN
    ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PrivacySetting" ADD COLUMN IF NOT EXISTS "consentEnabled" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
