import { prisma } from "../../config/prisma";
import { classSectionForSession } from "../sessions/enrollmentService";

export const generateReceiptNumber = async (): Promise<string> => {
  const count = await prisma.payment.count({
    where: { receiptNumber: { not: null } },
  });
  const year = new Date().getFullYear();
  return `REC-${year}-${(count + 1).toString().padStart(6, "0")}`;
};

// School letterhead for receipts — read from Website CMS settings, so changing the school
// name, logo, address or affiliation there updates every receipt (screen, print and PDF).
const getSchoolLetterhead = async () => {
  let s: any = null;
  try {
    s = await prisma.websiteSetting.findFirst();
  } catch {
    s = null;
  }
  return {
    name: s?.schoolName ?? "School",
    tagline: s?.tagline ?? null,
    logoUrl: s?.logoUrl ?? null,
    address: s?.address ?? null,
    phone: s?.phone ?? null,
    email: s?.email ?? null,
    boardName: s?.boardName ?? null,
    affiliationNo: s?.affiliationNo ?? null,
    schoolCode: s?.schoolCode ?? null,
  };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const getReceiptDetails = async (paymentId: number) => {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      student: {
        include: {
          classSection: { include: { session: true } },
        },
      },
      allocations: {
        include: {
          feeCharge: {
            include: {
              feeHead: true,
            },
          },
        },
      },
      advances: true,
    },
  });

  // Session of the fees settled (falls back to the student's class session).
  const sessionId = payment.allocations[0]?.feeCharge?.sessionId;
  const session = sessionId ? await prisma.academicSession.findUnique({ where: { id: sessionId }, select: { name: true } }) : null;
  // Class of the year the fees belong to (the student may have been promoted since).
  const receiptClass = sessionId ? await classSectionForSession(prisma, payment.student, sessionId) : payment.student.classSection;
  const recordedBy = payment.recordedByUserId
    ? await prisma.user.findUnique({ where: { id: payment.recordedByUserId }, select: { name: true } })
    : null;

  return {
    receiptNumber: payment.receiptNumber,
    paymentNumber: payment.paymentNumber,
    paymentDate: payment.paidAt || payment.createdAt,
    mode: payment.mode,
    transactionRef: payment.transactionRef,
    razorpayPaymentId: payment.razorpayPaymentId,
    amountPaid: Number(payment.amount),
    status: payment.status,
    sessionName: session?.name ?? payment.student.classSection.session?.name ?? null,
    // Who took the money: the staff member at the counter, or the online gateway.
    receivedBy: recordedBy?.name ?? (payment.razorpayPaymentId || payment.razorpayOrderId ? "Online payment" : null),
    // Part of the payment kept as advance credit (not yet adjusted against any fee).
    advanceAmount: (payment.advances || []).reduce((sum: number, a: any) => sum + Number(a.amount), 0),
    school: await getSchoolLetterhead(),
    student: {
      id: payment.student.id,
      name: payment.student.name,
      admissionNo: payment.student.admissionNo,
      rollNo: payment.student.rollNo,
      classSection: receiptClass ? `${receiptClass.className} - ${receiptClass.section}` : "—",
      fatherName: payment.student.fatherName,
      contact: payment.student.contactNumber || payment.student.fatherContact || payment.student.motherContact || null,
    },
    settledItems: (payment.allocations || []).map((a: any) => ({
      feeHead: a.feeCharge.feeHead.name,
      billingPeriod: `${a.feeCharge.billingMonth}/${a.feeCharge.billingYear}`,
      periodLabel: `${MONTHS[a.feeCharge.billingMonth - 1]} ${a.feeCharge.billingYear}`,
      amountAllocated: Number(a.allocatedAmount),
    })),
  };
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const generateReceiptHtml = (receiptData: any) => {
  const school = receiptData.school ?? {};
  const schoolLine = [school.boardName && school.affiliationNo ? `${school.boardName} Affiliation No. ${school.affiliationNo}` : null, school.address, school.phone ? `Ph: ${school.phone}` : null]
    .filter(Boolean)
    .map(esc)
    .join(" • ");
  const logoHtml = school.logoUrl && /^https:\/\//.test(school.logoUrl) ? `<img src="${esc(school.logoUrl)}" alt="" style="width:56px;height:56px;object-fit:contain;margin-right:14px;" />` : "";
  const itemsHtml = receiptData.settledItems
    .map(
      (item: any) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${esc(item.feeHead)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${esc(item.periodLabel ?? item.billingPeriod)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">₹${item.amountAllocated.toLocaleString()}</td>
    </tr>
  `
    )
    .join("");

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Fee Receipt - ${esc(receiptData.receiptNumber)}</title>
    <style>
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; background-color: #ffffff; }
      .container { max-width: 700px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }
      .school-name { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
      .school-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
      .receipt-title { font-size: 20px; font-weight: 700; color: #0284c7; text-align: right; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; background: #f8fafc; padding: 16px; border-radius: 8px; font-size: 14px; }
      .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
      .table th { background: #f1f5f9; text-align: left; padding: 10px; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
      .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
      .badge { display: inline-block; background: #dcfce7; color: #15803d; font-weight: 700; padding: 4px 12px; border-radius: 9999px; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div style="display:flex;align-items:center;">
          ${logoHtml}
          <div>
            <h1 class="school-name">${esc(school.name ?? "School")}</h1>
            <div class="school-sub">${schoolLine}</div>
          </div>
        </div>
        <div>
          <div class="receipt-title">FEE RECEIPT</div>
          <div style="text-align: right; margin-top: 4px;"><span class="badge">PAID VERIFIED ✓</span></div>
        </div>
      </div>

      <div class="meta-grid">
        <div>
          <div><strong>Receipt No:</strong> ${esc(receiptData.receiptNumber)}</div>
          <div><strong>Student Name:</strong> ${esc(receiptData.student.name)}</div>
          <div><strong>Admission No:</strong> ${esc(receiptData.student.admissionNo)}</div>
          <div><strong>Class/Section:</strong> ${esc(receiptData.student.classSection)}</div>
        </div>
        <div>
          <div><strong>Date:</strong> ${new Date(receiptData.paymentDate).toLocaleDateString()}</div>
          <div><strong>Payment Mode:</strong> ${esc(receiptData.mode)}</div>
          ${receiptData.razorpayPaymentId ? `<div><strong>Razorpay ID:</strong> ${esc(receiptData.razorpayPaymentId)}</div>` : ""}
          ${receiptData.transactionRef ? `<div><strong>Ref No:</strong> ${esc(receiptData.transactionRef)}</div>` : ""}
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Fee Head</th>
            <th>Billing Period</th>
            <th style="text-align: right;">Amount Paid</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <div style="font-size: 12px; color: #64748b;">
          * Computer-generated receipt. No signature required.
        </div>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a; background: #e0f2fe; padding: 12px 24px; border-radius: 8px;">
          Total Amount: ₹${receiptData.amountPaid.toLocaleString()}
        </div>
      </div>

      <div class="footer">
        Thank you for your payment! For any billing queries, please email fees@dreamacademy.edu
      </div>
    </div>
  </body>
  </html>
  `;
};
