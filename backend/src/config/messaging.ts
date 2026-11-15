// Everything about where reset codes are sent from (and, while testing, sent to) lives in
// .env, so changing the sender email, SMS account or test inbox/phone never needs a code change.

const env = (name: string) => (process.env[name] ?? "").trim();

export const mailConfig = () => ({
  // "smtp" sends real email; "console" only prints it in the server log (local development).
  provider: (env("EMAIL_PROVIDER") || (env("SMTP_USER") ? "smtp" : "console")).toLowerCase(),
  host: env("SMTP_HOST") || "smtp.gmail.com",
  port: Number(env("SMTP_PORT")) || 465,
  user: env("SMTP_USER"),
  // Gmail: an App Password (Google Account > Security > 2-Step Verification > App passwords),
  // not the normal account password. Google shows it with spaces; they are ignored.
  pass: env("SMTP_PASS").replace(/\s+/g, ""),
  from: env("MAIL_FROM") || env("SMTP_USER"),
});

export const smsConfig = () => ({
  // console | twilio | msg91 | fast2sms
  provider: (env("SMS_PROVIDER") || "console").toLowerCase(),
  defaultCountryCode: env("SMS_DEFAULT_COUNTRY_CODE") || "91",
  twilio: {
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
    from: env("TWILIO_FROM"), // a Twilio number like +1415..., or a Messaging Service SID (MG...)
  },
  msg91: {
    authKey: env("MSG91_AUTH_KEY"),
    templateId: env("MSG91_TEMPLATE_ID"), // DLT-approved OTP template; its variable must be ##OTP##
  },
  fast2sms: {
    apiKey: env("FAST2SMS_API_KEY"),
  },
});

// Test routing. While these are set, every reset code goes to this inbox / phone instead of
// the account's own, so real users are never messaged during testing. Clear them to go live.
export const testRouting = () => ({
  email: env("OTP_TEST_EMAIL"),
  phone: env("OTP_TEST_PHONE"),
});

export const schoolName = () => env("SCHOOL_NAME") || "RRS Intl School";
