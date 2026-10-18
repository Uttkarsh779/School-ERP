import "dotenv/config";
import { prisma } from "./src/config/prisma";

async function test() {
  const heads = await prisma.feeHead.findMany();
  console.log('FEE HEADS:', heads.map(h => ({ id: h.id, name: h.name, code: h.code })));
  const structures = await prisma.feeStructure.findMany({
    include: { classSection: true, items: { include: { feeHead: true } } }
  });
  console.log('FEE STRUCTURES:', structures.map(s => ({
    id: s.id,
    name: s.name,
    classSectionId: s.classSectionId,
    class: s.classSection ? `${s.classSection.className}-${s.classSection.section}` : 'ALL',
    items: s.items.map(i => ({ head: i.feeHead.name, amount: i.amount, applicableMonths: i.applicableMonths }))
  })));
  const charges = await prisma.feeCharge.findMany({
    take: 5,
    include: { feeHead: true, student: true }
  });
  console.log('SAMPLE CHARGES:', charges.map(c => ({
    student: c.student?.name,
    classId: c.student?.classSectionId,
    head: c.feeHead?.name,
    month: c.billingMonth,
    amount: c.baseAmount
  })));
}

test().finally(() => prisma.$disconnect());
