-- Additive only: exam pass mark + absent flag on results. Existing rows get the defaults.
BEGIN;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "passPercentage" DOUBLE PRECISION NOT NULL DEFAULT 33;
ALTER TABLE "ExamResult" ADD COLUMN IF NOT EXISTS "isAbsent" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
