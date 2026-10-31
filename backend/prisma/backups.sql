-- Additive only: log of database backups (stored privately in Cloudinary). Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS "BackupRecord" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "publicId" TEXT,
    "sizeBytes" INTEGER,
    "tableCount" INTEGER,
    "rowCount" INTEGER,
    "error" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

COMMIT;
