-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" SERIAL NOT NULL,
    "classSectionId" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "subjectId" INTEGER,
    "staffId" INTEGER,
    "room" TEXT,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_classSectionId_dayOfWeek_periodNumber_key" ON "TimetableSlot"("classSectionId", "dayOfWeek", "periodNumber");

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

