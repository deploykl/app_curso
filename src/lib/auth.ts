import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha } from "better-auth/plugins";
import { db } from "@/db";
import { env } from "@/env";
import { sendEmail } from "@/modules/notifications/mailer";
import { verifyEmailTemplate } from "@/modules/notifications/templates/verify-email";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60 * 24, // 24h
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, html } = verifyEmailTemplate({ name: user.name, url });
      await sendEmail({ to: user.email, userId: user.id, template: "verify-email", subject, html });
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "student", input: false },
      active: { type: "boolean", defaultValue: true, input: false },
    },
  },
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY,
      endpoints: ["/sign-up/email"],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
