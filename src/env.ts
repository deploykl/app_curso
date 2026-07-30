import { z } from "zod";

const schema = z.object({
  ACADEMIA_NAME: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().min(1),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default(""),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  YAPE_MAX_CENTS: z.coerce.number().int().positive(),
  CRON_SECRET: z.string().min(8),
});

export const env = schema.parse(process.env);
