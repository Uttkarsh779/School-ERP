-- Removes the Families & Parents module (decided 2026-11-14): ParentGuardian, ParentStudent
-- and PaymentBatch tables, and the PARENT login role. Sibling / staff-child discounts are now
-- assigned per student on the Concessions screen; father/mother stay on the Student record.
-- DESTRUCTIVE: run a backup first (Settings -> Backup). Safe to run more than once.
BEGIN;

ALTER TABLE "Payment" DROP COLUMN IF EXISTS "paymentBatchId";
DROP TABLE IF EXISTS "ParentStudent";
DROP TABLE IF EXISTS "PaymentBatch";
DROP TABLE IF EXISTS "ParentGuardian";

-- Remove PARENT from the Role enum (no User or Notice row uses it; checked before writing this).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'Role' AND e.enumlabel = 'PARENT') THEN
    IF EXISTS (SELECT 1 FROM "User" WHERE "role"::text = 'PARENT') OR EXISTS (SELECT 1 FROM "Notice" WHERE "targetRole"::text = 'PARENT') THEN
      RAISE EXCEPTION 'PARENT is still in use; clean those rows first';
    END IF;
    ALTER TYPE "Role" RENAME TO "Role_old";
    CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PRINCIPAL', 'ACCOUNTANT', 'TEACHER', 'STUDENT');
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
    ALTER TABLE "Notice" ALTER COLUMN "targetRole" TYPE "Role" USING ("targetRole"::text::"Role");
    DROP TYPE "Role_old";
  END IF;
END $$;

COMMIT;
