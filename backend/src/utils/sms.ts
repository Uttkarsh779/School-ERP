import { smsConfig } from "../config/messaging";

// One function to send an SMS; the provider is picked by SMS_PROVIDER in .env.
// Adding a provider = one more case below, nothing else changes.

// "98765 43210", "098765-43210", "+91 9876543210", "919876543210" -> "+919876543210".
// Returns null when the value can't be a phone number.
export const normalizePhone = (raw: string | null | undefined, defaultCountryCode = smsConfig().defaultCountryCode): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;
  return null;
};

// "+919876543210" -> "+91 ******3210"
export const maskPhone = (phone: string) => `${phone.slice(0, -10)} ******${phone.slice(-4)}`;

const failIfNotOk = async (res: Response, provider: string) => {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  throw new Error(`${provider} SMS failed (${res.status}): ${body.slice(0, 300)}`);
};

// `otp` is passed separately because Indian OTP routes (MSG91, Fast2SMS) send a code into a
// pre-approved template rather than free text.
export const sendSms = async (to: string, text: string, otp?: string): Promise<void> => {
  const cfg = smsConfig();
  const phone = normalizePhone(to, cfg.defaultCountryCode);
  if (!phone) throw new Error(`Not a valid phone number: ${to}`);

  switch (cfg.provider) {
    case "console": {
      console.log(`[SMS:console] to=${phone}\n${text}`);
      return;
    }

    case "twilio": {
      const { accountSid, authToken, from } = cfg.twilio;
      if (!accountSid || !authToken || !from) throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM must be set");
      const form = new URLSearchParams({ To: phone, Body: text });
      form.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      return failIfNotOk(res, "Twilio");
    }

    case "msg91": {
      const { authKey, templateId } = cfg.msg91;
      if (!authKey || !templateId) throw new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID must be set");
      if (!otp) throw new Error("MSG91 sends OTPs only (template based)");
      const url = new URL("https://control.msg91.com/api/v5/otp");
      url.searchParams.set("template_id", templateId);
      url.searchParams.set("mobile", phone.slice(1)); // MSG91 wants 91XXXXXXXXXX, no "+"
      url.searchParams.set("otp", otp);
      const res = await fetch(url, { method: "POST", headers: { authkey: authKey, "Content-Type": "application/json" } });
      await failIfNotOk(res, "MSG91");
      const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (body.type === "error") throw new Error(`MSG91 SMS failed: ${body.message ?? "unknown error"}`);
      return;
    }

    case "fast2sms": {
      const { apiKey } = cfg.fast2sms;
      if (!apiKey) throw new Error("FAST2SMS_API_KEY must be set");
      if (!otp) throw new Error("Fast2SMS OTP route sends OTPs only");
      if (!phone.startsWith("+91")) throw new Error("Fast2SMS only sends to Indian numbers");
      const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: { authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ route: "otp", variables_values: otp, numbers: phone.slice(3) }),
      });
      await failIfNotOk(res, "Fast2SMS");
      const body = (await res.json().catch(() => ({}))) as { return?: boolean; message?: unknown };
      if (body.return === false) throw new Error(`Fast2SMS SMS failed: ${JSON.stringify(body.message)}`);
      return;
    }

    default:
      throw new Error(`Unknown SMS_PROVIDER "${cfg.provider}"`);
  }
};
