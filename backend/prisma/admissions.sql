-- Additive only: online admissions (enquiry → application → test / interview → selected →
-- admitted). Safe to run more than once: every statement skips what already exists.
-- Old website enquiries (AdmissionInquiry) are copied in as applications once; that table
-- is left in place, untouched, as a record.
BEGIN;

-- One row (id = 1): whether the online form is open, for which session and classes, and the
-- registration fee (one amount, with optional per-class amounts; 0 = free).
CREATE TABLE IF NOT EXISTS "AdmissionSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" INTEGER,
    "classNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "defaultFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "classFees" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "closesOn" DATE,
    "instructions" TEXT,
    "allowUploads" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionSetting_pkey" PRIMARY KEY ("id")
);
INSERT INTO "AdmissionSetting" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

-- stage: ENQUIRY | APPLIED | TEST | SELECTED | ADMITTED | REJECTED | WITHDRAWN
-- source: WEBSITE_ENQUIRY | ONLINE_FORM | OFFICE
-- feeStatus: NONE (no fee) | UNPAID | PAID | WAIVED
CREATE TABLE IF NOT EXISTS "AdmissionApplication" (
    "id" SERIAL NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ENQUIRY',
    "source" TEXT NOT NULL,
    "sessionId" INTEGER,
    "className" TEXT NOT NULL,

    "studentName" TEXT NOT NULL,
    "dob" DATE,
    "gender" TEXT,
    "bloodGroup" TEXT,
    "aadharNumber" TEXT,
    "category" TEXT,
    "nationality" TEXT,
    "previousSchool" TEXT,
    "previousClass" TEXT,

    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "fatherName" TEXT,
    "fatherPhone" TEXT,
    "fatherOccupation" TEXT,
    "motherName" TEXT,
    "motherPhone" TEXT,
    "motherOccupation" TEXT,
    "address" TEXT,
    "message" TEXT,
    "officeNotes" TEXT,
    "contactedAt" TIMESTAMP(3),

    "testAt" TIMESTAMP(3),
    "testVenue" TEXT,
    "testResult" TEXT,
    "testRemarks" TEXT,

    "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "feeStatus" TEXT NOT NULL DEFAULT 'NONE',
    "feeReceiptNo" TEXT,
    "feePaidAt" TIMESTAMP(3),
    "feeMode" TEXT,
    "feeReference" TEXT,
    "feeRecordedByUserId" INTEGER,
    "feeWaiveReason" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,

    "closedReason" TEXT,
    "admittedStudentId" INTEGER,
    "legacyInquiryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_applicationNo_key" ON "AdmissionApplication"("applicationNo");
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_feeReceiptNo_key" ON "AdmissionApplication"("feeReceiptNo");
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_razorpayOrderId_key" ON "AdmissionApplication"("razorpayOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_admittedStudentId_key" ON "AdmissionApplication"("admittedStudentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionApplication_legacyInquiryId_key" ON "AdmissionApplication"("legacyInquiryId");
CREATE INDEX IF NOT EXISTS "AdmissionApplication_stage_idx" ON "AdmissionApplication"("stage");
CREATE INDEX IF NOT EXISTS "AdmissionApplication_phone_idx" ON "AdmissionApplication"("phone");

-- Files a family attached to the online form. Stored privately like student documents;
-- moved onto the student's documents on admission (movedToDocumentId).
CREATE TABLE IF NOT EXISTS "AdmissionFile" (
    "id" SERIAL NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "docType" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT,
    "mimeType" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "movedToDocumentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdmissionFile_applicationId_idx" ON "AdmissionFile"("applicationId");

-- Timeline of each application (stage changes, fee, notes). userId null = the family.
CREATE TABLE IF NOT EXISTS "AdmissionEvent" (
    "id" SERIAL NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT,
    "note" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdmissionEvent_applicationId_idx" ON "AdmissionEvent"("applicationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionSetting_sessionId_fkey') THEN
    ALTER TABLE "AdmissionSetting" ADD CONSTRAINT "AdmissionSetting_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionApplication_sessionId_fkey') THEN
    ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionApplication_admittedStudentId_fkey') THEN
    ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_admittedStudentId_fkey"
      FOREIGN KEY ("admittedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionFile_applicationId_fkey') THEN
    ALTER TABLE "AdmissionFile" ADD CONSTRAINT "AdmissionFile_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdmissionEvent_applicationId_fkey') THEN
    ALTER TABLE "AdmissionEvent" ADD CONSTRAINT "AdmissionEvent_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Copy old website enquiries in once (matched by legacyInquiryId, so re-runs skip them).
-- NEW / CONTACTED → enquiry stage (contacted ones keep a contacted time), ADMITTED → admitted
-- (no student link: those were admitted by hand), REJECTED → rejected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AdmissionInquiry') THEN
    INSERT INTO "AdmissionApplication"
      ("applicationNo", "stage", "source", "className", "studentName", "contactName", "phone", "email",
       "previousSchool", "message", "officeNotes", "contactedAt", "legacyInquiryId", "createdAt", "updatedAt")
    SELECT
      'ENQ-' || LPAD(i."id"::text, 4, '0'),
      CASE i."status" WHEN 'ADMITTED' THEN 'ADMITTED' WHEN 'REJECTED' THEN 'REJECTED' ELSE 'ENQUIRY' END,
      'WEBSITE_ENQUIRY', i."gradeApplyingFor", i."studentName", i."parentName", i."phone", NULLIF(i."email", ''),
      i."currentSchool", i."message", i."notes",
      CASE WHEN i."status" = 'CONTACTED' THEN i."updatedAt" ELSE NULL END,
      i."id", i."createdAt", i."updatedAt"
    FROM "AdmissionInquiry" i
    WHERE NOT EXISTS (SELECT 1 FROM "AdmissionApplication" a WHERE a."legacyInquiryId" = i."id");
  END IF;
END $$;

COMMIT;
