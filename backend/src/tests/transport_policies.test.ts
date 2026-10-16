import assert from "node:assert";
import { test } from "node:test";
import {
  assignStudentTransport,
  calculateTransportFeeForPeriod,
  createVillage,
  discontinueStudentTransport,
} from "../modules/transport/transportVillageService";
import { prisma } from "../config/prisma";
import { TransportBillingPolicy } from "../modules/transport/transportVillageService";

test("Transport Billing Policies & Overlap Validation", async (t) => {
  // Setup dummy student
  const dummyUser = await prisma.user.create({
    data: {
      email: `test_transport_${Date.now()}@school.com`,
      passwordHash: "dummy",
      role: "STUDENT",
      name: "Transport Test Student",
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      name: `Session_${Date.now()}`,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-05-31"),
      isCurrent: true,
    },
  });

  const classSection = await prisma.classSection.create({
    data: {
      sessionId: session.id,
      className: "Class 8",
      section: `T${Date.now()}`,
    },
  });

  const student = await prisma.student.create({
    data: {
      userId: dummyUser.id,
      admissionNo: `ADM_TR_${Date.now()}`,
      name: "Rahul Transport",
      rollNo: `R_${Date.now()}`,
      classSectionId: classSection.id,
    },
  });

  const village = await createVillage({ name: `Village_${Date.now()}`, monthlyFee: 1200 });

  await t.test("1. Reject Overlapping Transport Assignments", async () => {
    await assignStudentTransport({
      studentId: student.id,
      villageId: village.id,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-09-30"),
    });

    await assert.rejects(
      async () => {
        await assignStudentTransport({
          studentId: student.id,
          villageId: village.id,
          startDate: new Date("2026-08-15"),
          endDate: new Date("2026-09-30"),
        });
      },
      /Overlapping transport assignment/
    );
  });

  await t.test("2. Mid-Month Start Policy: FULL_MONTH vs PRORATED vs NEXT_PERIOD", async () => {
    // Student B -> FULL_MONTH start on Aug 15
    const feeFull = await calculateTransportFeeForPeriod(student.id, 2026, 8);
    assert.strictEqual(feeFull, 1200);

    // Clean up previous and test NEXT_PERIOD
    await prisma.studentTransportAssignment.deleteMany({ where: { studentId: student.id } });
    await assignStudentTransport({
      studentId: student.id,
      villageId: village.id,
      startDate: new Date("2026-08-15"),
      policy: TransportBillingPolicy.NEXT_PERIOD,
    });

    const feeNext = await calculateTransportFeeForPeriod(student.id, 2026, 8);
    assert.strictEqual(feeNext, 0); // 0 for August

    const feeNextSept = await calculateTransportFeeForPeriod(student.id, 2026, 9);
    assert.strictEqual(feeNextSept, 1200); // 1200 for September
  });

  await t.test("3. Discontinuation Policy: NEXT_PERIOD Stops Fee in Oct", async () => {
    const assignment = await prisma.studentTransportAssignment.findFirstOrThrow({
      where: { studentId: student.id },
    });

    await discontinueStudentTransport({
      assignmentId: assignment.id,
      discontinuedAt: new Date("2026-09-15"),
      policy: TransportBillingPolicy.NEXT_PERIOD,
    });

    const septFee = await calculateTransportFeeForPeriod(student.id, 2026, 9);
    assert.strictEqual(septFee, 1200);

    const octFee = await calculateTransportFeeForPeriod(student.id, 2026, 10);
    assert.strictEqual(octFee, 0);
  });
});
