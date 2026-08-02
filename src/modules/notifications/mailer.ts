import nodemailer from "nodemailer";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/env";

// SMTP_HOST="json" no abre ninguna conexión: nodemailer serializa el mensaje y
// devuelve un messageId. Es lo que usan los tests para no depender de MailHog
// ni, mucho menos, mandar correo real desde la suite.
const transport =
  env.SMTP_HOST === "json"
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        // 465 es TLS directo; 587 negocia STARTTLS.
        secure: env.SMTP_PORT === 465,
        // Si hay credenciales, nunca las mandamos por un canal sin cifrar.
        // MailHog (sin usuario) sigue funcionando en texto plano.
        requireTLS: Boolean(env.SMTP_USER),
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      });

export interface SendEmailInput {
  to: string;
  userId?: string;
  template: string;
  subject: string;
  html: string;
  /** Alternativa en texto plano. Si no llega, se deriva del HTML. */
  text?: string;
}

/** Fallback de texto plano para que ningún correo salga solo en HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean }> {
  try {
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
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
