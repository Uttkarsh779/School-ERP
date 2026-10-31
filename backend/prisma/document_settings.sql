-- Additive only: principal's signature, school seal and where they are printed.
-- One row (id = 1). Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS "DocumentSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "principalSignatureUrl" TEXT,
    "schoolSealUrl" TEXT,
    "signIdCards" BOOLEAN NOT NULL DEFAULT true,
    "signReportCards" BOOLEAN NOT NULL DEFAULT true,
    "signCertificates" BOOLEAN NOT NULL DEFAULT false,
    "signTc" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSetting_pkey" PRIMARY KEY ("id")
);

COMMIT;
