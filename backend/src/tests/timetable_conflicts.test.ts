import { prisma } from "../config/prisma";
import { upsertTimetableSlot } from "../modules/timetable/service";

export async function runTimetableConflictTests() {
  console.log("=========================================");
  console.log("RUNNING TIMETABLE CONFLICT PREVENTION TESTS...");
  console.log("=========================================\n");

  const classSections = await prisma.classSection.findMany({ take: 2 });
  const staff = await prisma.staff.findFirst();

  if (classSections.length < 2 || !staff) {
    console.log("⚠️ Skipping test: Requires at least 2 class sections and 1 staff record in database.");
    return;
  }

  const cs1 = classSections[0].id;
  const cs2 = classSections[1].id;
  const staffId = staff.id;

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
    throw new Error("Test Failed: System allowed assigning the same teacher to 2 different classes during the same period!");
  }
  console.log("✓ TEST 1 PASSED: Teacher conflict prevented cleanly!\n");

  // TEST 2: Room Conflict Prevention
  console.log("TEST 2: Room / Lab Conflict Validation...");
  await upsertTimetableSlot({
    classSectionId: cs1,
    dayOfWeek: 1,
    periodNumber: 2,
    room: "Lab-1",
  });

  let roomConflictCaught = false;
  try {
    await upsertTimetableSlot({
      classSectionId: cs2,
      dayOfWeek: 1,
      periodNumber: 2,
      room: "Lab-1",
    });
  } catch (err: any) {
    if (err?.message?.includes("Room Conflict")) {
      roomConflictCaught = true;
    }
  }

  if (!roomConflictCaught) {
    throw new Error("Test Failed: System allowed assigning the same room to 2 different classes during the same period!");
  }
  console.log("✓ TEST 2 PASSED: Room conflict prevented cleanly!\n");
  console.log("🎉 ALL TIMETABLE CONFLICT TESTS PASSED SUCCESSFULLY!");
}

if (require.main === module) {
  runTimetableConflictTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Test Error:", err);
      process.exit(1);
    });
}
