-- Additive only: student documents and health records.
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

-- Scanned documents kept on file (birth certificate, Aadhaar, previous TC …). The file sits
-- in Cloudinary as "authenticated" (no public link); the ERP fetches it with a short-lived
-- signed link. Removing a document deletes the file but keeps this row as a log.
CREATE TABLE IF NOT EXISTS "StudentDocument" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT,
    "mimeType" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" INTEGER NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" INTEGER,
    "removeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudentDocument_studentId_idx" ON "StudentDocument"("studentId");

-- One health record per student.
CREATE TABLE IF NOT EXISTS "StudentHealth" (
    "studentId" INTEGER NOT NULL,
    "allergies" TEXT,
    "conditions" TEXT,
    "medicines" TEXT,
    "emergencyMedicine" TEXT,
    "dietary" TEXT,
    "disability" TEXT,
    "doctorName" TEXT,
    "doctorPhone" TEXT,
    "emergencyName" TEXT,
    "emergencyRelation" TEXT,
    "emergencyPhone" TEXT,
    "officeNotes" TEXT,
    "updatedByUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentHealth_pkey" PRIMARY KEY ("studentId")
);

-- Height / weight / eyesight checks.
CREATE TABLE IF NOT EXISTS "HealthCheckup" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "checkupDate" DATE NOT NULL,
    "heightCm" DECIMAL(5,1),
    "weightKg" DECIMAL(5,1),
    "visionLeft" TEXT,
    "visionRight" TEXT,
    "dental" TEXT,
    "notes" TEXT,
    "recordedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCheckup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HealthCheckup_studentId_idx" ON "HealthCheckup"("studentId");

CREATE TABLE IF NOT EXISTS "Vaccination" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "vaccine" TEXT NOT NULL,
    "dose" TEXT,
    "givenOn" DATE,
    "notes" TEXT,
    "recordedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vaccination_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Vaccination_studentId_idx" ON "Vaccination"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentDocument_studentId_fkey') THEN
    ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentDocument_uploadedByUserId_fkey') THEN
    ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_uploadedByUserId_fkey"
      FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentHealth_studentId_fkey') THEN
    ALTER TABLE "StudentHealth" ADD CONSTRAINT "StudentHealth_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HealthCheckup_studentId_fkey') THEN
    ALTER TABLE "HealthCheckup" ADD CONSTRAINT "HealthCheckup_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vaccination_studentId_fkey') THEN
    ALTER TABLE "Vaccination" ADD CONSTRAINT "Vaccination_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
