-- DropForeignKey
ALTER TABLE "ExamResult" DROP CONSTRAINT "ExamResult_enteredByStaffId_fkey";

-- AlterTable
ALTER TABLE "ExamResult" DROP COLUMN "enteredByStaffId",
ADD COLUMN     "enteredByUserId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "ExamResult" ADD CONSTRAINT "ExamResult_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

