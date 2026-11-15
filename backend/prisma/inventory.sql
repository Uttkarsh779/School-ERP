-- Additive only: school stock (inventory).
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

CREATE TABLE IF NOT EXISTS "InventoryCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCategory_name_key" ON "InventoryCategory"("name");

-- "stock" is kept in step with the movements (changed only in the same transaction).
-- Returnable items (tools, sports kit, lab equipment) are expected back after an issue;
-- consumables (chalk, paper, cleaning liquid) are not.
CREATE TABLE IF NOT EXISTS "InventoryItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "returnable" BOOLEAN NOT NULL DEFAULT false,
    "minStock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "location" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_name_key" ON "InventoryItem"("name");
CREATE INDEX IF NOT EXISTS "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");

-- Every change to stock. quantity is always positive; "change" is the signed effect on
-- stock (+ for IN / RETURN / ADJUST up, - for ISSUE / WRITE_OFF / ADJUST down).
-- Mistakes are voided (stock reversed), never edited or deleted.
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "change" DECIMAL(12,2) NOT NULL,
    "movedOn" DATE NOT NULL,
    "supplier" TEXT,
    "billNo" TEXT,
    "unitCost" DECIMAL(12,2),
    "staffId" INTEGER,
    "issuedTo" TEXT,
    "note" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InventoryMovement_itemId_idx" ON "InventoryMovement"("itemId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_staffId_idx" ON "InventoryMovement"("staffId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_movedOn_idx" ON "InventoryMovement"("movedOn");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryItem_categoryId_fkey') THEN
    ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_itemId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_staffId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_createdByUserId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Starter categories (the office can rename or add more).
INSERT INTO "InventoryCategory" ("name") VALUES
  ('Stationery'), ('Furniture'), ('Sports'), ('Science lab'), ('Computer & IT'),
  ('Cleaning & housekeeping'), ('Electrical'), ('Kitchen & canteen'), ('Other')
ON CONFLICT ("name") DO NOTHING;

COMMIT;
