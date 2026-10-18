-- Additive only: teacher features (profile photo/address, homework submissions,
-- report-card remarks + result publishing, leave requests). Safe to run more than once.
BEGIN;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HomeworkSubmissionStatus') THEN CREATE TYPE "HomeworkSubmissionStatus" AS ENUM ('SUBMITTED', 'CHECKED', 'REDO'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveStatus') THEN CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'); END IF; END $$;
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resultsPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "address" TEXT,
ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
CREATE TABLE IF NOT EXISTS "HomeworkSubmission" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "text" TEXT,
    "attachmentUrl" TEXT,
    "submittedOffline" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "status" "HomeworkSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "teacherComment" TEXT,
    "checkedAt" TIMESTAMP(3),
    "checkedByUserId" INTEGER,

    CONSTRAINT "HomeworkSubmission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ExamStudentRemark" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "remark" TEXT,
    "workEducation" TEXT,
    "artEducation" TEXT,
    "healthPhysical" TEXT,
    "discipline" TEXT,
    "updatedByUserId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamStudentRemark_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER,
    "staffId" INTEGER,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" INTEGER NOT NULL,
    "decidedByUserId" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HomeworkSubmission_studentId_idx" ON "HomeworkSubmission"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "HomeworkSubmission_assignmentId_studentId_key" ON "HomeworkSubmission"("assignmentId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamStudentRemark_examId_studentId_key" ON "ExamStudentRemark"("examId", "studentId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_studentId_idx" ON "LeaveRequest"("studentId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_staffId_idx" ON "LeaveRequest"("staffId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_status_idx" ON "LeaveRequest"("status");
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_assignmentId_fkey') THEN ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_studentId_fkey') THEN ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_checkedByUserId_fkey') THEN ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamStudentRemark_examId_fkey') THEN ALTER TABLE "ExamStudentRemark" ADD CONSTRAINT "ExamStudentRemark_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamStudentRemark_studentId_fkey') THEN ALTER TABLE "ExamStudentRemark" ADD CONSTRAINT "ExamStudentRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamStudentRemark_updatedByUserId_fkey') THEN ALTER TABLE "ExamStudentRemark" ADD CONSTRAINT "ExamStudentRemark_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_studentId_fkey') THEN ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_staffId_fkey') THEN ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_requestedByUserId_fkey') THEN ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaveRequest_decidedByUserId_fkey') THEN ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
COMMIT;
