-- Staff employment status, separate from login access (User.isActive). Idempotent.
-- Apply with: npx prisma db execute --file prisma/staff_employment_status.sql
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teachers' AND column_name = 'isActive') THEN
    ALTER TABLE "teachers" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
    -- Staff who sign in keep their current status; staff without a login are employed.
    UPDATE "teachers" t SET "isActive" = u."isActive"
    FROM "User" u
    WHERE u.id = t."userId"
      AND t."staffCategory" IN ('TEACHER', 'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR', 'ADMIN_STAFF', 'OFFICE_STAFF');
  END IF;
END $$;
COMMIT;
