BEGIN;

-- CreateEnum
CREATE TYPE "ConstructionProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ConstructionExpenseCategory" AS ENUM ('MATERIALS', 'LABOUR', 'CONTRACTOR', 'TRANSPORT', 'EQUIPMENT', 'PERMITS_FEES', 'UTILITIES', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "ConstructionPaymentStatus" AS ENUM ('PAID', 'PARTIALLY_PAID', 'UNPAID');

-- CreateEnum
CREATE TYPE "ConstructionPaymentMode" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "ConstructionProject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "budget" DECIMAL(12,2),
    "status" "ConstructionProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startDate" DATE,
    "endDate" DATE,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionExpense" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ConstructionExpenseCategory" NOT NULL,
    "expenseDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "vendorName" TEXT,
    "vendorContact" TEXT,
    "invoiceNumber" TEXT,
    "attachmentUrl" TEXT,
    "paymentStatus" "ConstructionPaymentStatus" NOT NULL DEFAULT 'PAID',
    "paymentMode" "ConstructionPaymentMode",
    "notes" TEXT,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "idempotencyKey" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionAuditLog" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "oldValues" TEXT,
    "newValues" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionProject_name_key" ON "ConstructionProject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionExpense_idempotencyKey_key" ON "ConstructionExpense"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ConstructionExpense_projectId_idx" ON "ConstructionExpense"("projectId");

-- CreateIndex
CREATE INDEX "ConstructionExpense_expenseDate_idx" ON "ConstructionExpense"("expenseDate");

-- CreateIndex
CREATE INDEX "ConstructionExpense_category_idx" ON "ConstructionExpense"("category");

-- CreateIndex
CREATE INDEX "ConstructionAuditLog_entityType_entityId_idx" ON "ConstructionAuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ConstructionProject" ADD CONSTRAINT "ConstructionProject_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionExpense" ADD CONSTRAINT "ConstructionExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ConstructionProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionExpense" ADD CONSTRAINT "ConstructionExpense_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionExpense" ADD CONSTRAINT "ConstructionExpense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionExpense" ADD CONSTRAINT "ConstructionExpense_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionAuditLog" ADD CONSTRAINT "ConstructionAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
