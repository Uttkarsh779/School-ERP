import { useState } from "react";
import { useStartRegistrationPaymentMutation, useVerifyRegistrationPaymentMutation, type FamilyStatus } from "../../store/api/admissions.api";

// Window.Razorpay is declared in pages/erp/student/Fees/StudentFeesPage.tsx.
const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const messageOf = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message ?? fallback;

// Pays an application's registration fee with Razorpay; resolves with the updated status.
export const useRegistrationPayment = (schoolName: string) => {
  const [start] = useStartRegistrationPaymentMutation();
  const [verify] = useVerifyRegistrationPaymentMutation();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = (applicationNo: string, phone: string) =>
    new Promise<FamilyStatus | null>((resolve) => {
      setError(null);
      setPaying(true);
      const finish = (v: FamilyStatus | null, err?: string) => {
        setPaying(false);
        if (err) setError(err);
        resolve(v);
      };
      (async () => {
        try {
          const order = await start({ applicationNo, phone }).unwrap();
          if (order.mock) {
            // Local development only (RAZORPAY_MOCK_MODE): no payment window.
            return finish(await verify({ applicationNo, phone, razorpayOrderId: order.orderId, razorpayPaymentId: `pay_mock_${Date.now()}`, razorpaySignature: "mock" }).unwrap());
          }
          if (!(await loadRazorpay()) || !window.Razorpay) return finish(null, "Couldn't load the payment window. Check your connection and try again.");
          new window.Razorpay({
            key: order.keyId,
            amount: order.amountInPaise,
            currency: order.currency,
            name: schoolName,
            description: `Registration fee · ${applicationNo}`,
            order_id: order.orderId,
            prefill: { name: order.name, contact: order.contact, email: order.email ?? "" },
            theme: { color: "#1f3c6e" },
            handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
              try {
                finish(await verify({ applicationNo, phone, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature }).unwrap());
              } catch (e) {
                finish(null, messageOf(e, "We couldn't confirm the payment. If money was taken, it will be confirmed automatically — check the status again in a few minutes."));
              }
            },
            modal: { ondismiss: () => finish(null) },
          }).open();
        } catch (e) {
          finish(null, messageOf(e, "Couldn't start the payment. Please try again or pay at the school office."));
        }
      })();
    });

  return { pay, paying, error };
};
