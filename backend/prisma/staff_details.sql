-- Additive only: personal, employment, ID and bank details on staff records (the "teachers"
-- table), plus an employee code for ID cards and payroll. Safe to run more than once.
BEGIN;

ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "employeeCode" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "gender" "Gender";
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "dob" TIMESTAMP(3);
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "fatherOrSpouseName" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "joiningDate" TIMESTAMP(3);
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "leavingDate" TIMESTAMP(3);
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "experienceYears" INTEGER;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "aadhaarNumber" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "panNumber" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "bankIfsc" TEXT;

-- Existing staff get EMP-0001 style codes from their record number; the office can change them.
UPDATE "teachers" SET "employeeCode" = 'EMP-' || LPAD("id"::text, 4, '0') WHERE "employeeCode" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "teachers_employeeCode_key" ON "teachers"("employeeCode");
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_aadhaarNumber_key" ON "teachers"("aadhaarNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_panNumber_key" ON "teachers"("panNumber");

COMMIT;
