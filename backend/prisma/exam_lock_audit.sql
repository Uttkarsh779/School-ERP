-- Additive only: exam lock + mark change history.
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "lockedByUserId" INTEGER;

CREATE TABLE IF NOT EXISTS "ExamResultAudit" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "oldMarks" DOUBLE PRECISION,
    "oldMaxMarks" DOUBLE PRECISION,
    "oldIsAbsent" BOOLEAN,
    "newMarks" DOUBLE PRECISION NOT NULL,
    "newMaxMarks" DOUBLE PRECISION NOT NULL,
    "newIsAbsent" BOOLEAN NOT NULL,
    "changedByUserId" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamResultAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamResultAudit_examId_idx" ON "ExamResultAudit"("examId");
CREATE INDEX IF NOT EXISTS "ExamResultAudit_examId_studentId_subjectId_idx" ON "ExamResultAudit"("examId", "studentId", "subjectId");

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so check the catalog first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Exam_lockedByUserId_fkey') THEN
    ALTER TABLE "Exam" ADD CONSTRAINT "Exam_lockedByUserId_fkey"
      FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamResultAudit_examId_fkey') THEN
    ALTER TABLE "ExamResultAudit" ADD CONSTRAINT "ExamResultAudit_examId_fkey"
      FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamResultAudit_changedByUserId_fkey') THEN
    ALTER TABLE "ExamResultAudit" ADD CONSTRAINT "ExamResultAudit_changedByUserId_fkey"
      FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
