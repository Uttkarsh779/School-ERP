-- Additive only: the siblings named on a sibling discount. Safe to run more than once.
ALTER TABLE "StudentConcession" ADD COLUMN IF NOT EXISTS "siblingStudentIds" INTEGER[] NOT NULL DEFAULT '{}';
