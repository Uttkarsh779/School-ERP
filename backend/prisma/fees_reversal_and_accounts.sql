-- Additive only: fee billing settings, fee reversals (receipt/bill cancel, waiver reversal)
-- and the Accounts income & expense book.
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelledByUserId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelledByUserId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "FeeAdjustment" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "FeeAdjustment" ADD COLUMN IF NOT EXISTS "reversedByUserId" INTEGER;
ALTER TABLE "FeeAdjustment" ADD COLUMN IF NOT EXISTS "reverseReason" TEXT;

CREATE TABLE IF NOT EXISTS "FeeBillingSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "generateDay" INTEGER NOT NULL DEFAULT 1,
    "transportDueDay" INTEGER NOT NULL DEFAULT 10,
    "lastAutoRunPeriod" TEXT,
    "lastAutoRunAt" TIMESTAMP(3),
    "lastAutoRunSummary" TEXT,
    "updatedByUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeBillingSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AccountCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountCategory_type_name_key" ON "AccountCategory"("type", "name");

CREATE TABLE IF NOT EXISTS "AccountEntry" (
    "id" SERIAL NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "party" TEXT,
    "paymentMode" TEXT NOT NULL,
    "referenceNo" TEXT,
    "billNumber" TEXT,
    "description" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "idempotencyKey" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountEntry_voucherNo_key" ON "AccountEntry"("voucherNo");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountEntry_idempotencyKey_key" ON "AccountEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AccountEntry_entryDate_idx" ON "AccountEntry"("entryDate");
CREATE INDEX IF NOT EXISTS "AccountEntry_categoryId_idx" ON "AccountEntry"("categoryId");
CREATE INDEX IF NOT EXISTS "AccountEntry_type_idx" ON "AccountEntry"("type");

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so check the catalog first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountEntry_categoryId_fkey') THEN
    ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "AccountCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountEntry_createdByUserId_fkey') THEN
    ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountEntry_updatedByUserId_fkey') THEN
    ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_updatedByUserId_fkey"
      FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountEntry_voidedByUserId_fkey') THEN
    ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_voidedByUserId_fkey"
      FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Starting categories (the school can add more or hide these).
INSERT INTO "AccountCategory" ("name", "type") VALUES
  ('Staff salaries', 'EXPENSE'), ('Electricity', 'EXPENSE'), ('Water', 'EXPENSE'),
  ('Diesel & fuel', 'EXPENSE'), ('Vehicle maintenance', 'EXPENSE'), ('Repairs & maintenance', 'EXPENSE'),
  ('Stationery & printing', 'EXPENSE'), ('Teaching material', 'EXPENSE'), ('Events & functions', 'EXPENSE'),
  ('Internet & phone', 'EXPENSE'), ('Cleaning & housekeeping', 'EXPENSE'), ('Rent', 'EXPENSE'),
  ('Taxes & government fees', 'EXPENSE'), ('Miscellaneous', 'EXPENSE'),
  ('Admission forms', 'INCOME'), ('Uniform & book sales', 'INCOME'), ('Donations', 'INCOME'),
  ('Bank interest', 'INCOME'), ('Other income', 'INCOME')
ON CONFLICT ("type", "name") DO NOTHING;

COMMIT;
