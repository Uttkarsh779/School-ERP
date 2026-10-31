-- Additive only: student certificates (TC, Bonafide, Character, Fee).
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

CREATE TABLE IF NOT EXISTS "StudentCertificate" (
    "id" SERIAL NOT NULL,
    "serialNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "issuedByUserId" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" INTEGER,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentCertificate_serialNo_key" ON "StudentCertificate"("serialNo");
CREATE INDEX IF NOT EXISTS "StudentCertificate_studentId_idx" ON "StudentCertificate"("studentId");
CREATE INDEX IF NOT EXISTS "StudentCertificate_type_idx" ON "StudentCertificate"("type");

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so check the catalog first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentCertificate_studentId_fkey') THEN
    ALTER TABLE "StudentCertificate" ADD CONSTRAINT "StudentCertificate_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentCertificate_issuedByUserId_fkey') THEN
    ALTER TABLE "StudentCertificate" ADD CONSTRAINT "StudentCertificate_issuedByUserId_fkey"
      FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
