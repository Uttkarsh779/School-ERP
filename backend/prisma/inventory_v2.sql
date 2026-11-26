-- Inventory, standard documents (replaces the single "movement" list of inventory.sql).
--   OPENING  OPN-0001  stock in hand when an item is added
--   RECEIPT  GRN-0001  goods received from a supplier (several items, qty × rate)
--   ISSUE    ISS-0001  given to a staff member / department; each line consumed or to be returned
--   RETURN   RET-0001  received back against an issue (good → back in stock, damaged → not)
--   ADJUST   ADJ-0001  stock check, damage, loss, expiry, found; or closing an issue line that
--                      won't come back
-- Every line's "change" is its effect on stock; the item's stock ledger is these lines.
-- Additive and safe to re-run. Old InventoryMovement rows are copied in once (legacyMovementId)
-- and that table is left untouched as a record.
BEGIN;

CREATE TABLE IF NOT EXISTS "InventoryDoc" (
    "id" SERIAL NOT NULL,
    "docNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "docDate" DATE NOT NULL,
    "supplier" TEXT,
    "billNo" TEXT,
    "staffId" INTEGER,
    "department" TEXT,
    "purpose" TEXT,
    "expectedReturnOn" DATE,
    "issueId" INTEGER,
    "reason" TEXT,
    "note" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacyMovementId" INTEGER,

    CONSTRAINT "InventoryDoc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryDoc_docNo_key" ON "InventoryDoc"("docNo");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryDoc_legacyMovementId_key" ON "InventoryDoc"("legacyMovementId");
CREATE INDEX IF NOT EXISTS "InventoryDoc_kind_docDate_idx" ON "InventoryDoc"("kind", "docDate");
CREATE INDEX IF NOT EXISTS "InventoryDoc_staffId_idx" ON "InventoryDoc"("staffId");
CREATE INDEX IF NOT EXISTS "InventoryDoc_issueId_idx" ON "InventoryDoc"("issueId");

-- issueLineId: on a RETURN line, or an ADJUST line closing an issue line (lost / consumed).
-- condition: GOOD | DAMAGED on return lines.
CREATE TABLE IF NOT EXISTS "InventoryDocLine" (
    "id" SERIAL NOT NULL,
    "docId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "change" DECIMAL(12,2) NOT NULL,
    "rate" DECIMAL(12,2),
    "toReturn" BOOLEAN NOT NULL DEFAULT false,
    "issueLineId" INTEGER,
    "condition" TEXT,
    "remark" TEXT,

    CONSTRAINT "InventoryDocLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InventoryDocLine_docId_idx" ON "InventoryDocLine"("docId");
CREATE INDEX IF NOT EXISTS "InventoryDocLine_itemId_idx" ON "InventoryDocLine"("itemId");
CREATE INDEX IF NOT EXISTS "InventoryDocLine_issueLineId_idx" ON "InventoryDocLine"("issueLineId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDoc_staffId_fkey') THEN
    ALTER TABLE "InventoryDoc" ADD CONSTRAINT "InventoryDoc_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDoc_issueId_fkey') THEN
    ALTER TABLE "InventoryDoc" ADD CONSTRAINT "InventoryDoc_issueId_fkey"
      FOREIGN KEY ("issueId") REFERENCES "InventoryDoc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDoc_createdByUserId_fkey') THEN
    ALTER TABLE "InventoryDoc" ADD CONSTRAINT "InventoryDoc_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDocLine_docId_fkey') THEN
    ALTER TABLE "InventoryDocLine" ADD CONSTRAINT "InventoryDocLine_docId_fkey"
      FOREIGN KEY ("docId") REFERENCES "InventoryDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDocLine_itemId_fkey') THEN
    ALTER TABLE "InventoryDocLine" ADD CONSTRAINT "InventoryDocLine_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryDocLine_issueLineId_fkey') THEN
    ALTER TABLE "InventoryDocLine" ADD CONSTRAINT "InventoryDocLine_issueLineId_fkey"
      FOREIGN KEY ("issueLineId") REFERENCES "InventoryDocLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Copy the old movements in once, oldest first. Issues come across as "to be returned" so
-- nothing given out is lost track of (a line can be closed as consumed afterwards).
DO $$
DECLARE
  m RECORD;
  k TEXT;
  prefix TEXT;
  n INTEGER;
  new_doc INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'InventoryMovement') THEN
    RETURN;
  END IF;
  FOR m IN SELECT * FROM "InventoryMovement" mv
           WHERE NOT EXISTS (SELECT 1 FROM "InventoryDoc" d WHERE d."legacyMovementId" = mv."id")
           ORDER BY mv."id" LOOP
    k := CASE
           WHEN m."type" = 'IN' AND m."note" = 'Opening stock' THEN 'OPENING'
           WHEN m."type" = 'IN' THEN 'RECEIPT'
           WHEN m."type" = 'ISSUE' THEN 'ISSUE'
           WHEN m."type" = 'RETURN' THEN 'RETURN'
           ELSE 'ADJUST'
         END;
    prefix := CASE k WHEN 'OPENING' THEN 'OPN-' WHEN 'RECEIPT' THEN 'GRN-' WHEN 'ISSUE' THEN 'ISS-' WHEN 'RETURN' THEN 'RET-' ELSE 'ADJ-' END;
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substr("docNo", 5), '\D', '', 'g'), '')::INTEGER), 0) + 1 INTO n
      FROM "InventoryDoc" WHERE "docNo" LIKE prefix || '%';
    INSERT INTO "InventoryDoc" ("docNo", "kind", "docDate", "supplier", "billNo", "staffId", "department", "reason", "note",
                                "isVoid", "voidReason", "voidedAt", "voidedByUserId", "createdByUserId", "createdAt", "legacyMovementId")
    VALUES (prefix || LPAD(n::TEXT, 4, '0'), k, m."movedOn", m."supplier", m."billNo", m."staffId", m."issuedTo",
            CASE WHEN k = 'ADJUST' THEN CASE m."type" WHEN 'WRITE_OFF' THEN 'DAMAGED' ELSE 'COUNT' END END,
            m."note", m."isVoid", m."voidReason", m."voidedAt", m."voidedByUserId", m."createdByUserId", m."createdAt", m."id")
    RETURNING "id" INTO new_doc;
    INSERT INTO "InventoryDocLine" ("docId", "itemId", "quantity", "change", "rate", "toReturn", "condition", "remark")
    VALUES (new_doc, m."itemId", m."quantity", m."change", m."unitCost", k = 'ISSUE', CASE WHEN k = 'RETURN' THEN 'GOOD' END,
            CASE WHEN k = 'ISSUE' THEN m."note" END);
  END LOOP;
END $$;

COMMIT;
