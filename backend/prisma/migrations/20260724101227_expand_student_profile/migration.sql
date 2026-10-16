-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentCategory" AS ENUM ('GENERAL', 'OBC', 'SC', 'ST', 'EWS');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "aadharNumber" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "admissionDate" TIMESTAMP(3),
ADD COLUMN     "admissionNo" TEXT NOT NULL,
ADD COLUMN     "apaarId" TEXT,
ADD COLUMN     "bloodGroup" TEXT,
ADD COLUMN     "category" "StudentCategory",
ADD COLUMN     "contactNumber" TEXT,
ADD COLUMN     "fatherContact" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "motherContact" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "nationality" TEXT DEFAULT 'Indian',
ADD COLUMN     "previousSchool" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionNo_key" ON "Student"("admissionNo");

-- CreateIndex
CREATE UNIQUE INDEX "Student_aadharNumber_key" ON "Student"("aadharNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Student_apaarId_key" ON "Student"("apaarId");

