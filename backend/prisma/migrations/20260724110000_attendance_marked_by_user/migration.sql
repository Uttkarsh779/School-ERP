-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_markedByStaffId_fkey";

-- AlterTable
ALTER TABLE "Attendance" DROP COLUMN "markedByStaffId",
ADD COLUMN     "markedByUserId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

