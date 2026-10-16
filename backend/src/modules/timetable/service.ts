import { prisma } from "../../config/prisma";

const withDetails = {
  include: { subject: true, staff: { include: { user: true } } },
} as const;

export const listTimetableForClass = (classSectionId: number) =>
  prisma.timetableSlot.findMany({
    where: { classSectionId },
    orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
    ...withDetails,
  });

export const listTimetableForStaff = (staffId: number) =>
  prisma.timetableSlot.findMany({
    where: { staffId },
    orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
    include: { subject: true, classSection: true },
  });

export const upsertTimetableSlot = async (data: {
  classSectionId: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectId?: number | null;
  staffId?: number | null;
  room?: string | null;
}) => {
  // 1. Teacher Conflict Validation: Prevent assigning the same teacher to two different classes in the same period slot
  if (data.staffId) {
    const existingTeacherConflict = await prisma.timetableSlot.findFirst({
      where: {
        staffId: data.staffId,
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
        NOT: {
          classSectionId: data.classSectionId,
        },
      },
      include: {
        classSection: true,
        staff: { include: { user: true } },
      },
    });

    if (existingTeacherConflict) {
      const teacherName = existingTeacherConflict.staff?.user?.name || "Selected teacher";
      const conflictClass = `${existingTeacherConflict.classSection?.className} - ${existingTeacherConflict.classSection?.section}`;
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[data.dayOfWeek] || `Day ${data.dayOfWeek}`;

      throw new Error(
        `Teacher Conflict: ${teacherName} is already teaching Period ${data.periodNumber} in ${conflictClass} on ${dayName}.`
      );
    }
  }

  // 2. Room Conflict Validation: Prevent assigning the same classroom to two different classes in the same period slot
  if (data.room && data.room.trim().length > 0) {
    const roomConflict = await prisma.timetableSlot.findFirst({
      where: {
        room: data.room.trim(),
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
        NOT: {
          classSectionId: data.classSectionId,
        },
      },
      include: {
        classSection: true,
      },
    });

    if (roomConflict) {
      const conflictClass = `${roomConflict.classSection?.className} - ${roomConflict.classSection?.section}`;
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[data.dayOfWeek] || `Day ${data.dayOfWeek}`;

      throw new Error(
        `Room Conflict: Room "${data.room}" is already assigned to ${conflictClass} for Period ${data.periodNumber} on ${dayName}.`
      );
    }
  }

  return prisma.timetableSlot.upsert({
    where: {
      classSectionId_dayOfWeek_periodNumber: {
        classSectionId: data.classSectionId,
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
      },
    },
    create: data,
    update: { subjectId: data.subjectId, staffId: data.staffId, room: data.room },
    ...withDetails,
  });
};

export const deleteTimetableSlot = (id: number) => prisma.timetableSlot.delete({ where: { id } });
