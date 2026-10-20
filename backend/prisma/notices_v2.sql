-- Notices v2 (teacher notices: importance flag + attachment). Idempotent.
-- Apply with: npx prisma db execute --file prisma/notices_v2.sql
ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "isImportant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
CREATE INDEX IF NOT EXISTS "Notice_targetClassSectionId_idx" ON "Notice" ("targetClassSectionId");
CREATE INDEX IF NOT EXISTS "Notice_postedByUserId_idx" ON "Notice" ("postedByUserId");
