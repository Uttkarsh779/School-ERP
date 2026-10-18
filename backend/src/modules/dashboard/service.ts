import { prisma } from "../../config/prisma";
import { getFeeOverview } from "../fees/overviewService";
import { getAdminOperationalOverview } from "./adminOverviewService";

export const getAdminCounts = async () => {
  const [
    studentCount,
    staffCount,
    classSectionCount,
    parentCount,
    transportVillagesCount,
    transportStudentsCount,
    feeOverview,
    operational,
    recentNotices,
  ] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.staff.count({ where: { user: { isActive: true } } }),
    prisma.classSection.count(),
    prisma.parentGuardian.count(),
    prisma.transportVillage.count({ where: { isActive: true } }),
    prisma.studentTransportAssignment.count({ where: { status: "ACTIVE" } }),
    getFeeOverview(),
    getAdminOperationalOverview(),
    prisma.notice.findMany({
      take: 4,
      orderBy: { postedAt: "desc" },
    }),
  ]);


  return {
    studentCount,
    staffCount,
    classSectionCount,
    parentCount,
    transportVillagesCount,
    transportStudentsCount,
    // Real figures only (see fees/overviewService) — zeros when nothing is billed yet.
    financialSummary: {
      totalMonthlyBilled: feeOverview.billedThisMonth,
      totalMonthlyCollected: feeOverview.collectedThisMonth,
      totalPendingDues: feeOverview.outstanding,
      collectionRate: feeOverview.collectionRate ?? 0,
    },
    fees: {
      collectedToday: feeOverview.collectedToday,
      paymentsToday: feeOverview.paymentsToday,
      collectedThisMonth: feeOverview.collectedThisMonth,
      billedThisMonth: feeOverview.billedThisMonth,
      collectionRate: feeOverview.collectionRate,
      outstanding: feeOverview.outstanding,
      overdue: feeOverview.overdue,
      defaulterCount: feeOverview.defaulterCount,
      recentPayments: feeOverview.recentPayments.slice(0, 4),
    },
    ...operational,
    recentNotices: recentNotices.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.body,
      targetAudience: n.targetRole || "ALL",
      createdAt: n.postedAt,
      authorName: "School Admin",
    })),
  };
};
