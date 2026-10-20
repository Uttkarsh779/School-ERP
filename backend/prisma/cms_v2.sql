-- Website / CMS v2. Idempotent: safe to run more than once.
-- Apply with: npx prisma db execute --file prisma/cms_v2.sql
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "boardName" TEXT NOT NULL DEFAULT 'CBSE';
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "schoolCode" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "academicSession" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "heroImageUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "aboutImageUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "principalPhotoUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "principalTitle" TEXT NOT NULL DEFAULT 'Principal';
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "vision" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "mission" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "officeHours" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "mapEmbedUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "WebsiteSetting" ADD COLUMN IF NOT EXISTS "stats" JSONB;

CREATE TABLE IF NOT EXISTS "WebsiteGalleryItem" (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Campus',
  "imageUrl" TEXT NOT NULL,
  "description" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WebsiteTestimonial" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "relation" TEXT,
  "quote" TEXT NOT NULL,
  "photoUrl" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WebsiteFaq" (
  "id" SERIAL PRIMARY KEY,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
