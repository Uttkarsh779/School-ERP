-- Exam module refactor (additive; safe to run more than once).
--  * Assessment schemes: how each class group is assessed (terms, periodic assessment out of
--    20 + term exam out of 80, final weightage, grade scale, co-scholastic scale).
--  * Exam types (term exam / periodic test / class test), term, admit card flag, marks
--    deadline, class teacher "ready", one exam created for many classes (groupKey).
--  * Max marks per subject per exam, periodic-assessment marks and teacher adjustments,
--    term remarks/co-scholastic, published term/final results, exam coordinator permission.
BEGIN;

CREATE TABLE IF NOT EXISTS "AssessmentScheme" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "classNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "terms" INTEGER NOT NULL DEFAULT 2,
    "paMax" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "examMax" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "passPercentage" DOUBLE PRECISION NOT NULL DEFAULT 33,
    "finalWeights" INTEGER[] NOT NULL DEFAULT ARRAY[50,50],
    "paComponents" JSONB NOT NULL DEFAULT '[]',
    "gradeScale" JSONB NOT NULL DEFAULT '[]',
    "coScale" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'TERM_EXAM';
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "term" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "admitCard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "marksDeadline" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "groupKey" TEXT;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "subjectId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "testDate" DATE;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "createdByUserId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "readyByUserId" INTEGER;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Exam_groupKey_idx" ON "Exam"("groupKey");

CREATE TABLE IF NOT EXISTS "ExamSubject" (
    "id" SERIAL PRIMARY KEY,
    "examId" INTEGER NOT NULL REFERENCES "Exam"("id") ON DELETE CASCADE,
    "subjectId" INTEGER NOT NULL REFERENCES "Subject"("id"),
    "maxMarks" DOUBLE PRECISION NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamSubject_examId_subjectId_key" ON "ExamSubject"("examId", "subjectId");

ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "isExamCoordinator" BOOLEAN NOT NULL DEFAULT false;

-- Periodic-assessment marks entered directly (notebook, subject enrichment, portfolio...).
CREATE TABLE IF NOT EXISTS "AssessmentMark" (
    "id" SERIAL PRIMARY KEY,
    "classSectionId" INTEGER NOT NULL REFERENCES "ClassSection"("id"),
    "studentId" INTEGER NOT NULL REFERENCES "Student"("id"),
    "subjectId" INTEGER NOT NULL REFERENCES "Subject"("id"),
    "term" INTEGER NOT NULL,
    "component" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentMark_unique" ON "AssessmentMark"("studentId", "subjectId", "term", "component");

-- The subject teacher's final periodic-assessment mark (out of the scheme's paMax) when it
-- differs from the calculated one.
CREATE TABLE IF NOT EXISTS "PeriodicAdjustment" (
    "id" SERIAL PRIMARY KEY,
    "classSectionId" INTEGER NOT NULL REFERENCES "ClassSection"("id"),
    "studentId" INTEGER NOT NULL REFERENCES "Student"("id"),
    "subjectId" INTEGER NOT NULL REFERENCES "Subject"("id"),
    "term" INTEGER NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PeriodicAdjustment_unique" ON "PeriodicAdjustment"("studentId", "subjectId", "term");

-- Change log for assessment marks and adjustments.
CREATE TABLE IF NOT EXISTS "AssessmentAudit" (
    "id" SERIAL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "classSectionId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "component" TEXT,
    "oldMarks" DOUBLE PRECISION,
    "newMarks" DOUBLE PRECISION,
    "changedByUserId" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssessmentAudit_class_idx" ON "AssessmentAudit"("classSectionId", "term");

CREATE TABLE IF NOT EXISTS "TermRemark" (
    "id" SERIAL PRIMARY KEY,
    "classSectionId" INTEGER NOT NULL REFERENCES "ClassSection"("id"),
    "studentId" INTEGER NOT NULL REFERENCES "Student"("id"),
    "term" INTEGER NOT NULL,
    "remark" TEXT,
    "workEducation" TEXT,
    "artEducation" TEXT,
    "healthPhysical" TEXT,
    "discipline" TEXT,
    "updatedByUserId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TermRemark_unique" ON "TermRemark"("classSectionId", "studentId", "term");

-- A published term (1, 2) or final (0) result for a class, frozen as a snapshot.
CREATE TABLE IF NOT EXISTS "ResultPublication" (
    "id" SERIAL PRIMARY KEY,
    "classSectionId" INTEGER NOT NULL REFERENCES "ClassSection"("id"),
    "term" INTEGER NOT NULL,
    "weights" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "snapshot" JSONB NOT NULL,
    "publishedByUserId" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResultPublication_unique" ON "ResultPublication"("classSectionId", "term");

CREATE TABLE IF NOT EXISTS "ExamSetting" (
    "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
    "admitCardsForDefaulters" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "ExamSetting" ("id") VALUES (1) ON CONFLICT DO NOTHING;

-- Starter schemes (only on first run). Grades: CBSE 8-point scale on the rounded percentage.
DO $$
DECLARE
  grades JSONB := '[{"min":91,"grade":"A1"},{"min":81,"grade":"A2"},{"min":71,"grade":"B1"},{"min":61,"grade":"B2"},{"min":51,"grade":"C1"},{"min":41,"grade":"C2"},{"min":33,"grade":"D"},{"min":0,"grade":"E"}]';
  twoTerm JSONB := '[{"key":"PT","label":"Periodic tests","max":10,"source":"TESTS","rule":"AVERAGE"},{"key":"NB","label":"Notebook","max":5,"source":"MARKS"},{"key":"SEA","label":"Subject enrichment","max":5,"source":"MARKS"}]';
  tenth JSONB := '[{"key":"PT","label":"Periodic tests (best 2)","max":5,"source":"TESTS","rule":"BEST","best":2},{"key":"MA","label":"Multiple assessment","max":5,"source":"MARKS"},{"key":"PF","label":"Portfolio","max":5,"source":"MARKS"},{"key":"SEA","label":"Subject enrichment","max":5,"source":"MARKS"}]';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AssessmentScheme") THEN
    INSERT INTO "AssessmentScheme" ("name", "classNames", "terms", "paComponents", "gradeScale", "coScale") VALUES
      ('Pre-primary (Nursery–UKG)', ARRAY['Nursery','LKG','UKG'], 2, twoTerm, grades, 3),
      ('Primary (Class 1–5)', ARRAY['Class 1','Class 2','Class 3','Class 4','Class 5'], 2, twoTerm, grades, 3),
      ('Middle (Class 6–8)', ARRAY['Class 6','Class 7','Class 8'], 2, twoTerm, grades, 3),
      ('Class 9', ARRAY['Class 9'], 2, twoTerm, grades, 5),
      ('Class 10 (CBSE board)', ARRAY['Class 10'], 1, tenth, grades, 5);
  END IF;
END $$;

-- Existing exams: Unit Tests become periodic tests (Unit Test 1 in term 1, later ones in
-- term 2), Half Yearly is the term 1 exam, Annual/Final the term 2 exam.
UPDATE "Exam" SET "type" = 'PERIODIC_TEST' WHERE "groupKey" IS NULL AND ("name" ILIKE '%unit test%' OR "name" ILIKE 'PT%' OR "name" ILIKE '%periodic%');
UPDATE "Exam" SET "term" = 2 WHERE "groupKey" IS NULL AND ("name" ILIKE '%annual%' OR "name" ILIKE '%final%' OR "name" ILIKE '%yearly%' AND "name" NOT ILIKE '%half%' OR "name" ~* '(unit test|pt)\s*[2-9]');
UPDATE "Exam" SET "admitCard" = true WHERE "groupKey" IS NULL AND "type" = 'TERM_EXAM';
UPDATE "Exam" SET "groupKey" = "sessionId"::text || ':' || lower(trim("name")) WHERE "groupKey" IS NULL;

-- Max marks per subject from the marks already entered (most common value).
INSERT INTO "ExamSubject" ("examId", "subjectId", "maxMarks")
SELECT DISTINCT ON ("examId", "subjectId") "examId", "subjectId", "maxMarks"
FROM (SELECT "examId", "subjectId", "maxMarks", count(*) n FROM "ExamResult" GROUP BY 1, 2, 3) x
ORDER BY "examId", "subjectId", n DESC
ON CONFLICT DO NOTHING;

-- Exams with no marks yet get every class subject, with the max marks the class used in its
-- other exams of the same type (e.g. Unit Test 2 = Unit Test 1), else 80 / 20.
INSERT INTO "ExamSubject" ("examId", "subjectId", "maxMarks")
SELECT e."id", s."id", COALESCE(
  (SELECT x."maxMarks" FROM "ExamSubject" x JOIN "Exam" o ON o."id" = x."examId"
    WHERE o."classSectionId" = e."classSectionId" AND o."type" = e."type" AND x."subjectId" = s."id"
    GROUP BY x."maxMarks" ORDER BY count(*) DESC LIMIT 1),
  CASE WHEN e."type" = 'TERM_EXAM' THEN 80 ELSE 20 END)
FROM "Exam" e JOIN "Subject" s ON s."classSectionId" = e."classSectionId"
WHERE e."type" <> 'CLASS_TEST' AND NOT EXISTS (SELECT 1 FROM "ExamSubject" x WHERE x."examId" = e."id")
ON CONFLICT DO NOTHING;

-- Report-card remarks move to the term (term exam's remark first, else a periodic test's).
INSERT INTO "TermRemark" ("classSectionId", "studentId", "term", "remark", "workEducation", "artEducation", "healthPhysical", "discipline", "updatedByUserId", "updatedAt")
SELECT DISTINCT ON (e."classSectionId", r."studentId", e."term")
  e."classSectionId", r."studentId", e."term", r."remark", r."workEducation", r."artEducation", r."healthPhysical", r."discipline", r."updatedByUserId", r."updatedAt"
FROM "ExamStudentRemark" r JOIN "Exam" e ON e."id" = r."examId"
ORDER BY e."classSectionId", r."studentId", e."term", (e."type" = 'TERM_EXAM') DESC, r."updatedAt" DESC
ON CONFLICT DO NOTHING;

COMMIT;
