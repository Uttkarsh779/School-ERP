import { prisma } from "../config/prisma";
import { upsertTimetableSlot } from "../modules/timetable/service";
import { trackTestRows, uniqueTag } from "./helpers/testData";

export async function runTimetableConflictTests() {
  console.log("=========================================");
  console.log("RUNNING TIMETABLE CONFLICT PREVENTION TESTS...");
  console.log("=========================================\n");

  // Own session (not current), two classes, a teacher and a room name nobody else uses, so real
  // timetables are never written to. Everything is removed at the end.
  const rows = trackTestRows();
  const tag = uniqueTag();
  try {
    const session = rows.add(
      "AcademicSession",
      await prisma.academicSession.create({
        data: {
          name: `${tag} session`,
          startDate: new Date("2026-06-01"),
          endDate: new Date("2027-05-31"),
          isCurrent: false,
        },
      }),
    );
    const cs1 = rows.add(
      "ClassSection",
      await prisma.classSection.create({
        data: {
          sessionId: session.id,
          className: "ZZ Test",
          section: `${tag}A`,
        },
      }),
    ).id;
    const cs2 = rows.add(
      "ClassSection",
      await prisma.classSection.create({
        data: {
          sessionId: session.id,
          className: "ZZ Test",
          section: `${tag}B`,
        },
      }),
    ).id;
    const user = rows.add(
      "User",
      await prisma.user.create({
        data: {
          email: `${tag.toLowerCase()}@test.local`,
          passwordHash: "x",
          role: "TEACHER",
          name: `${tag} Teacher`,
        },
      }),
    );
    const staffId = rows.add(
      "teachers",
      await prisma.staff.create({ data: { userId: user.id } }),
    ).id;
    const room = `${tag}-Lab`;

    // TEST 1: Teacher Conflict Prevention
    console.log("TEST 1: Teacher Conflict Validation...");
    const slot1 = await upsertTimetableSlot({
      classSectionId: cs1,
      dayOfWeek: 1, // Monday
      periodNumber: 1,
      staffId: staffId,
    });

    if (!slot1) {
      throw new Error("Failed to assign initial timetable slot for teacher.");
    }

    let teacherConflictCaught = false;
    try {
      await upsertTimetableSlot({
        classSectionId: cs2,
        dayOfWeek: 1, // Monday
        periodNumber: 1,
        staffId: staffId,
      });
    } catch (err: any) {
      if (err?.message?.includes("Teacher Conflict")) {
        teacherConflictCaught = true;
      }
    }

    if (!teacherConflictCaught) {
      throw new Error(
        "Test Failed: System allowed assigning the same teacher to 2 different classes during the same period!",
      );
    }
    console.log("✓ TEST 1 PASSED: Teacher conflict prevented cleanly!\n");

    // TEST 2: Room Conflict Prevention
    console.log("TEST 2: Room / Lab Conflict Validation...");
    await upsertTimetableSlot({
      classSectionId: cs1,
      dayOfWeek: 1,
      periodNumber: 2,
      room,
    });

    let roomConflictCaught = false;
    try {
      await upsertTimetableSlot({
        classSectionId: cs2,
        dayOfWeek: 1,
        periodNumber: 2,
        room,
      });
    } catch (err: any) {
      if (err?.message?.includes("Room Conflict")) {
        roomConflictCaught = true;
      }
    }

    if (!roomConflictCaught) {
      throw new Error(
        "Test Failed: System allowed assigning the same room to 2 different classes during the same period!",
      );
    }
    console.log("✓ TEST 2 PASSED: Room conflict prevented cleanly!\n");
    console.log("🎉 ALL TIMETABLE CONFLICT TESTS PASSED SUCCESSFULLY!");
  } finally {
    await rows.remove();
  }
}

if (require.main === module) {
  runTimetableConflictTests()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Test Error:", err);
      process.exit(1);
    });
}
