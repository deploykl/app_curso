import nodemailer from "nodemailer";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

export interface SendEmailInput {
  to: string;
  userId?: string;
  template: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean }> {
  try {
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    await db.insert(emailLog).values({
      userId: input.userId ?? null,
      toEmail: input.to,
      template: input.template,
      subject: input.subject,
      providerId: info.messageId,
      status: "sent",
    });
    return { ok: true };
  } catch (e) {
    await db.insert(emailLog).values({
      userId: input.userId ?? null,
      toEmail: input.to,
      template: input.template,
      subject: input.subject,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}
