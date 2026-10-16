import assert from "node:assert";
import { test } from "node:test";
import { prisma } from "../config/prisma";
import {
  assignStudentTransport,
  calculateTransportFeeForPeriod,
  createVillage,
  discontinueStudentTransport,
  updateVillageFee,
} from "../modules/transport/transportVillageService";
import { extendInvoiceDueDate } from "../modules/fees/invoiceService";
import { createFeeStructureWithItems } from "../modules/fees/feeStructureService";
import { generateChargesForClassSection } from "../modules/fees/feeChargeService";
import { TransportBillingPolicy } from "../modules/transport/transportVillageService";

test("Final Acceptance End-to-End Scenario: Rahul / Class 8", async (t) => {
  // Setup Session & Class 8
  const session = await prisma.academicSession.create({
    data: {
      name: `Acceptance_Session_${Date.now()}`,
      startDate: new Date("2026-06-01"),
      endDate: new Date("2027-05-31"),
      isCurrent: true,
    },
  });

  const classSection = await prisma.classSection.create({
    data: {
      sessionId: session.id,
      className: "Class 8",
      section: `A_${Date.now()}`,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: `rahul_${Date.now()}@school.com`,
      passwordHash: "pass",
      role: "STUDENT",
      name: "Rahul Kumar",
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: `admin_${Date.now()}@school.com`,
      passwordHash: "pass",
      role: "ADMIN",
      name: "School Admin",
    },
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      admissionNo: `ACC_ADM_${Date.now()}`,
      name: "Rahul Kumar",
      rollNo: "801",
      classSectionId: classSection.id,
    },
  });

  // 1. Setup Class 8 Fee Structure: Tuition = ₹3,000/month
  const tuitionHead = await prisma.feeHead.create({
    data: {
      name: `Tuition_Fee_${Date.now()}`,
      code: `TUIT_${Date.now()}`,
      description: "Class 8 Tuition Fee",
    },
  });

  await createFeeStructureWithItems({
    sessionId: session.id,
    classSectionId: classSection.id,
    name: "Class 8 Fee Structure",
    items: [
      {
        feeHeadId: tuitionHead.id,
        amount: 3000,
        frequency: "MONTHLY",
        applicableMonths: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5],
        dueDateDay: 10,
      },
    ],
  });

  // 2. Setup Rampur Village = ₹1,200/month & Assign Rahul to Rampur
  const village = await createVillage({
    name: `Rampur_${Date.now()}`,
    monthlyFee: 1200,
  });

  await assignStudentTransport({
    studentId: student.id,
    villageId: village.id,
    startDate: new Date("2026-06-01"),
    policy: TransportBillingPolicy.FULL_MONTH,
  });

  // Add Sibling Discount = ₹500
  await prisma.feeAdjustment.create({
    data: {
      studentId: student.id,
      type: "SIBLING_DISCOUNT",
      calculationType: "FIXED_AMOUNT",
      value: 500,
      amount: 500,
      reason: "Sibling Discount",
      appliedByUserId: adminUser.id,
    },
  });

  await t.test("Step 1: August Billing Calculation & Invoice Generation", async () => {
    await generateChargesForClassSection({
      sessionId: session.id,
      classSectionId: classSection.id,
      billingMonth: 8,
      billingYear: 2026,
    });

    const tuitionCharge = await prisma.feeCharge.findFirstOrThrow({
      where: { studentId: student.id, feeHeadId: tuitionHead.id, billingMonth: 8 },
    });
    assert.strictEqual(Number(tuitionCharge.baseAmount), 3000);

    const transportCharge = await prisma.feeCharge.findFirstOrThrow({
      where: { studentId: student.id, billingMonth: 8, feeHead: { name: "Transport Fee" } },
    });
    assert.strictEqual(Number(transportCharge.baseAmount), 1200);

    // Create Invoice for August
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV_ACC_${Date.now()}`,
        studentId: student.id,
        sessionId: session.id,
        dueDate: new Date("2026-08-10"),
        totalBaseAmount: 4200,
        totalDiscountAmount: 500,
        totalAmount: 3700,
        paidAmount: 0,
        status: "ISSUED",
      },
    });

    assert.strictEqual(Number(invoice.totalAmount), 3700);
  });

  await t.test("Step 2: Admin Extends Due Date (10-Aug -> 15-Aug) with Audit Log", async () => {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { studentId: student.id } });

    await extendInvoiceDueDate({
      invoiceId: invoice.id,
      newDueDate: new Date("2026-08-15"),
      changedByUserId: adminUser.id,
      reason: "Parent requested extension",
    });

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.strictEqual(updatedInvoice.dueDate.toISOString().split("T")[0], "2026-08-15");

    const auditLog = await prisma.dueDateAuditLog.findFirst({ where: { invoiceId: invoice.id } });
    assert.ok(auditLog);
    assert.strictEqual(auditLog.changedByUserId, adminUser.id);
  });

  await t.test("Step 3: Change Rampur Fee (₹1,200 -> ₹1,500 effective 01-Sep-2026)", async () => {
    await updateVillageFee(village.id, {
      monthlyFee: 1500,
      effectiveDate: new Date("2026-09-01"),
    });

    // August charge remains locked at ₹1,200
    const augTransportCharge = await prisma.feeCharge.findFirstOrThrow({
      where: { studentId: student.id, billingMonth: 8, feeHead: { name: "Transport Fee" } },
    });
    assert.strictEqual(Number(augTransportCharge.baseAmount), 1200);

    // Generate September Charges
    await generateChargesForClassSection({
      sessionId: session.id,
      classSectionId: classSection.id,
      billingMonth: 9,
      billingYear: 2026,
    });

    const septTransportCharge = await prisma.feeCharge.findFirstOrThrow({
      where: { studentId: student.id, billingMonth: 9, feeHead: { name: "Transport Fee" } },
    });
    assert.strictEqual(Number(septTransportCharge.baseAmount), 1500);
  });

  await t.test("Step 4: Discontinue Transport (15-Sep-2026, NEXT_PERIOD Policy)", async () => {
    const assignment = await prisma.studentTransportAssignment.findFirstOrThrow({
      where: { studentId: student.id },
    });

    await discontinueStudentTransport({
      assignmentId: assignment.id,
      discontinuedAt: new Date("2026-09-15"),
      policy: TransportBillingPolicy.NEXT_PERIOD,
    });

    // September fee remains ₹1,500
    const septFee = await calculateTransportFeeForPeriod(student.id, 2026, 9);
    assert.strictEqual(septFee, 1500);

    // October fee becomes 0
    const octFee = await calculateTransportFeeForPeriod(student.id, 2026, 10);
    assert.strictEqual(octFee, 0);

    // August and September charges in database remain locked and unchanged
    const charges = await prisma.feeCharge.findMany({
      where: { studentId: student.id, feeHead: { name: "Transport Fee" } },
      orderBy: { billingMonth: "asc" },
    });

    assert.strictEqual(charges.length, 2);
    assert.strictEqual(Number(charges[0].baseAmount), 1200); // August
    assert.strictEqual(Number(charges[1].baseAmount), 1500); // September
  });
});
