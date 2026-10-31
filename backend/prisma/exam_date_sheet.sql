-- Additive only: an exam's date sheet (paper date/time per subject + instructions), printed
-- on admit cards. Safe to run more than once.
BEGIN;

ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "dateSheet" JSONB;

COMMIT;
