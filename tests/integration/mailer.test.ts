import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { sendEmail } from "@/modules/notifications/mailer";

beforeEach(async () => {
  await db.delete(emailLog);
});

describe("sendEmail", () => {
  it("envía y registra en email_log", async () => {
    const res = await sendEmail({
      to: "alumno@test.pe",
      template: "verify-email",
      subject: "Verifica tu correo",
      html: "<p>hola</p>",
    });
    expect(res.ok).toBe(true);

    const rows = await db.select().from(emailLog).where(eq(emailLog.toEmail, "alumno@test.pe"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].template).toBe("verify-email");
  });

  it("no lanza cuando el SMTP falla, y lo registra", async () => {
    const res = await sendEmail({
      to: "no-existe@invalid.invalid",
      template: "test",
      subject: "x",
      html: "x",
    });
    // Devuelve una forma estable y no lanza
    expect(typeof res.ok).toBe("boolean");
    const rows = await db.select().from(emailLog);
    expect(rows.length).toBeGreaterThan(0);
  });
});
