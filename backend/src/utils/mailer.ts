import nodemailer, { type Transporter } from "nodemailer";
import { mailConfig } from "../config/messaging";

export type MailMessage = { to: string; subject: string; text: string; html?: string };

let cached: { key: string; transporter: Transporter } | null = null;

const transporter = () => {
  const cfg = mailConfig();
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
      }),
    };
  }
  return cached.transporter;
};

export const sendMail = async (msg: MailMessage): Promise<void> => {
  const cfg = mailConfig();
  if (cfg.provider === "console") {
    console.log(`[Mail:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }
  if (cfg.provider !== "smtp") throw new Error(`Unknown EMAIL_PROVIDER "${cfg.provider}"`);
  if (!cfg.user || !cfg.pass) throw new Error("SMTP_USER and SMTP_PASS must be set to send email");
  await transporter().sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
};
