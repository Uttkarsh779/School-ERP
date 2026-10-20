-- Session rollover (student enrollment history per academic session). Idempotent.
-- Apply with: npx prisma db execute --file prisma/session_rollover.sql
DO $$ BEGIN
  CREATE TYPE "EnrollmentOutcome" AS ENUM ('PROMOTED', 'DETAINED', 'PASSED_OUT', 'LEFT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StudentEnrollment" (
  "id" SERIAL PRIMARY KEY,
  "studentId" INTEGER NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionId" INTEGER NOT NULL REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "classSectionId" INTEGER NOT NULL REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "rollNo" TEXT,
  "outcome" "EnrollmentOutcome",
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentEnrollment_studentId_sessionId_key" ON "StudentEnrollment" ("studentId", "sessionId");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_classSectionId_idx" ON "StudentEnrollment" ("classSectionId");

-- Backfill: every student's current class is their enrollment for that class's session.
INSERT INTO "StudentEnrollment" ("studentId", "sessionId", "classSectionId", "rollNo")
SELECT s."id", cs."sessionId", s."classSectionId", s."rollNo"
FROM "Student" s JOIN "ClassSection" cs ON cs."id" = s."classSectionId"
ON CONFLICT ("studentId", "sessionId") DO NOTHING;
