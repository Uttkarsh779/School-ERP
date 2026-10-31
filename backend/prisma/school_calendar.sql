-- Additive only: school calendar (holidays & events) and weekly-off settings.
-- Safe to run more than once: every statement skips what already exists.
BEGIN;

CREATE TABLE IF NOT EXISTS "CalendarEvent" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "description" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "announcePending" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "CalendarEvent_startDate_idx" ON "CalendarEvent"("startDate");
CREATE INDEX IF NOT EXISTS "CalendarEvent_endDate_idx" ON "CalendarEvent"("endDate");

CREATE TABLE IF NOT EXISTS "CalendarSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sundayOff" BOOLEAN NOT NULL DEFAULT true,
    "offSaturdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSetting_pkey" PRIMARY KEY ("id")
);

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so check the catalog first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarEvent_createdByUserId_fkey') THEN
    ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
