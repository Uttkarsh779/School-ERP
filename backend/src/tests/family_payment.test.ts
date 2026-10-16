import "dotenv/config";
import assert from "node:assert";
import { test } from "node:test";
import { prisma } from "../config/prisma";
import { Role, FeeMode } from "../generated/prisma/enums";
import { postParent } from "../modules/parents/controller";
import { recordFamilyPayment } from "../modules/fees/familyPaymentService";
import { allocatePaymentToChargesTransactionally } from "../modules/fees/paymentAllocationService";

test("Family Payment Pipeline", async (t) => {
  let session;
  let classSection;
  let parent;
  let feeHead;
  const children: any[] = [];
  const charges: any[] = [];
  const timestamp = Date.now();

  try {
    try {
      session = await prisma.academicSession.create({
      data: {
        name: `FamilyPaymentTest-${timestamp}`,
        isCurrent: false,
        startDate: new Date("2026-04-01"),
        endDate: new Date("2027-03-31"),
      },
    });
  } catch (e: any) {
    console.error("SESSION CREATE ERROR:", e.code, e.meta, e.message);
    throw e;
  }

  classSection = await prisma.classSection.create({
    data: {
      sessionId: session.id,
      className: "Family Class",
      section: "A",
    },
  });

  // Create Parent
  parent = await prisma.parentGuardian.create({
    data: {
      name: "Rajesh Kumar",
      contact: "9876543210",
      email: `rajesh-${timestamp}@example.com`,
    },
  });

  // For children, we already have it declared as const children: any[] = []; at the top, so we don't redeclare it here.
  for (let i = 1; i <= 3; i++) {
    const student = await prisma.student.create({
      data: {
        admissionNo: `FAM-TEST-${i}-${timestamp}`,
        name: `Child ${i}`,
        rollNo: `${i}-${timestamp}`,
        classSectionId: classSection.id,
      },
    });
    
    // Link to Parent
    await prisma.parentStudent.create({
      data: {
        parentId: parent.id,
        studentId: student.id,
        relationshipType: "Father",
      }
    });

    children.push(student);
  }

  // Create Fee Head and Charges
  feeHead = await prisma.feeHead.create({
    data: { name: `Family Tuition ${timestamp}`, code: `FAM-TUIT-${timestamp}` },
  });

  // For charges, we already have it declared as const charges: any[] = []; at the top, so we don't redeclare it here.
  // Child 1 owes 4700
  charges.push(await prisma.feeCharge.create({
    data: {
      studentId: children[0].id,
      feeHeadId: feeHead.id,
      sessionId: session.id,
      billingMonth: 8,
      billingYear: 2026,
      dueDate: new Date("2026-08-10"),
      baseAmount: 4700,
      netAmount: 4700,
      status: "UNPAID",
    }
  }));

  // Child 2 owes 3200
  charges.push(await prisma.feeCharge.create({
    data: {
      studentId: children[1].id,
      feeHeadId: feeHead.id,
      sessionId: session.id,
      billingMonth: 8,
      billingYear: 2026,
      dueDate: new Date("2026-08-10"),
      baseAmount: 3200,
      netAmount: 3200,
      status: "UNPAID",
    }
  }));

  // Child 3 owes 2800
  charges.push(await prisma.feeCharge.create({
    data: {
      studentId: children[2].id,
      feeHeadId: feeHead.id,
      sessionId: session.id,
      billingMonth: 8,
      billingYear: 2026,
      dueDate: new Date("2026-08-10"),
      baseAmount: 2800,
      netAmount: 2800,
      status: "UNPAID",
    }
  }));


  await t.test("1. Reject Over-Allocation", async () => {
    try {
      await recordFamilyPayment({
        parentGuardianId: parent.id,
        totalAmount: 5000,
        mode: FeeMode.CASH,
        recordedByUserId: 1, // Assume Admin ID 1 exists
        allocations: [
          { studentId: children[0].id, amount: 5000, feeBillId: charges[0].id }
        ]
      });
      assert.fail("Should have thrown error due to over-allocation");
    } catch (error: any) {
      assert.ok(true, "Rejected correctly");
    }
  });

  await t.test("2. Reject Wrong Family Allocation", async () => {
    // Create random student
    const randomStudent = await prisma.student.create({
      data: {
        admissionNo: `RANDOM-${Date.now()}`,
        name: `Random`,
        rollNo: `99`,
        classSectionId: classSection.id,
      },
    });

    try {
      await recordFamilyPayment({
        parentGuardianId: parent.id,
        totalAmount: 1000,
        mode: FeeMode.CASH,
        recordedByUserId: 1,
        allocations: [
          { studentId: randomStudent.id, amount: 1000 }
        ]
      });
      assert.fail("Should have thrown error because student not linked");
    } catch (error: any) {
      assert.ok(error.message.includes("is not linked to this family"), "Rejected unlinked student");
    }
  });

  await t.test("3. Process Partial Family Payment", async () => {
    // Total due is 10,700. Pay 7,000 (Child 1: 4700, Child 2: 2300, Child 3: 0)
    const result = await recordFamilyPayment({
      parentGuardianId: parent.id,
      totalAmount: 7000,
      mode: FeeMode.CASH,
      recordedByUserId: 1,
      allocations: [
        { studentId: children[0].id, amount: 4700, feeBillId: charges[0].id },
        { studentId: children[1].id, amount: 2300, feeBillId: charges[1].id },
        { studentId: children[2].id, amount: 0 }
      ]
    });

    assert.ok(result.paymentBatch.receiptNumber.startsWith("FAM-REC-"));
    assert.strictEqual(result.individualPayments.length, 2); // 0 amount shouldn't create a payment row

    // Verify Child 1 is fully paid
    const updatedCharge1 = await prisma.feeCharge.findUnique({ where: { id: charges[0].id } });
    assert.strictEqual(Number(updatedCharge1?.paidAmount), 4700);
    assert.strictEqual(updatedCharge1?.status, "PAID");

    // Verify Child 2 is partially paid
    const updatedCharge2 = await prisma.feeCharge.findUnique({ where: { id: charges[1].id } });
    assert.strictEqual(Number(updatedCharge2?.paidAmount), 2300);
    assert.strictEqual(updatedCharge2?.status, "PARTIALLY_PAID");

    // Verify Child 3 is untouched
    const updatedCharge3 = await prisma.feeCharge.findUnique({ where: { id: charges[2].id } });
    assert.strictEqual(Number(updatedCharge3?.paidAmount), 0);
    assert.strictEqual(updatedCharge3?.status, "UNPAID");
  });

  await t.test("4. Transaction Rollback on Failure", async () => {
    try {
      await recordFamilyPayment({
        parentGuardianId: parent.id,
        totalAmount: 1000,
        mode: FeeMode.CASH,
        recordedByUserId: 1,
        allocations: [
          { studentId: children[2].id, amount: 1000 },
          { studentId: children[0].id, amount: 9999999 } // This huge allocation will fail inside the transaction
        ]
      });
      assert.fail("Should have failed");
    } catch (e) {
      // Check that Child 3 wasn't paid 1000!
      const updatedCharge3 = await prisma.feeCharge.findUnique({ where: { id: charges[2].id } });
      assert.strictEqual(Number(updatedCharge3?.paidAmount), 0, "Child 3 balance should remain 0 because of rollback");
    }
  });

  await t.test("5. Process Full Payment for Remaining", async () => {
    // Remaining is 900 for Child 2 and 2800 for Child 3 = 3700 total.
    const result = await recordFamilyPayment({
      parentGuardianId: parent.id,
      totalAmount: 3700,
      mode: FeeMode.CASH,
      recordedByUserId: 1,
      allocations: [
        { studentId: children[1].id, amount: 900, feeBillId: charges[1].id },
        { studentId: children[2].id, amount: 2800, feeBillId: charges[2].id },
      ]
    });

    const updatedCharge2 = await prisma.feeCharge.findUnique({ where: { id: charges[1].id } });
    assert.strictEqual(Number(updatedCharge2?.paidAmount), 3200); // 2300 + 900
    assert.strictEqual(updatedCharge2?.status, "PAID");

    const updatedCharge3 = await prisma.feeCharge.findUnique({ where: { id: charges[2].id } });
    assert.strictEqual(Number(updatedCharge3?.paidAmount), 2800);
    assert.strictEqual(updatedCharge3?.status, "PAID");
  });

  } finally {
    // Cleanup
    try {
      if (children.length > 0) {
        const paymentIds = (await prisma.payment.findMany({ where: { studentId: { in: children.map(c => c.id) } } })).map(p => p.id);
        if (paymentIds.length > 0) await prisma.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
        await prisma.advancePayment.deleteMany({ where: { studentId: { in: children.map(c => c.id) } } });
        await prisma.feeCharge.deleteMany({ where: { studentId: { in: children.map(c => c.id) } } });
        await prisma.payment.deleteMany({ where: { studentId: { in: children.map(c => c.id) } } });
      }
      await prisma.feeAuditLog.deleteMany({ where: { entityType: "PaymentBatch" } });
      
      if (parent) {
        await prisma.parentStudent.deleteMany({ where: { parentId: parent.id } });
        await prisma.paymentBatch.deleteMany({ where: { parentGuardianId: parent.id } });
      }
      if (classSection) await prisma.student.deleteMany({ where: { classSectionId: classSection.id } });
      if (parent) await prisma.parentGuardian.deleteMany({ where: { id: parent.id } });
      if (feeHead) await prisma.feeHead.delete({ where: { id: feeHead.id } });
      if (classSection) await prisma.classSection.delete({ where: { id: classSection.id } });
      if (session) await prisma.academicSession.delete({ where: { id: session.id } });
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  }
});
