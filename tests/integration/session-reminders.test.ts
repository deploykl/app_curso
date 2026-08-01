import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, enrollments, sessionRemindersSent } from "@/db/schema";
import { eq } from "drizzle-orm";

const sendEmailMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/modules/notifications/mailer", () => ({ sendEmail: sendEmailMock }));

const { sendSessionReminders, reminderWindows } = await import("@/modules/learning/jobs");

let alumnoId: string;
let cursoId: string;

beforeEach(async () => {
  sendEmailMock.mockClear();
  await db.delete(sessionRemindersSent);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  const prof = await mk("Prof", "p@test.pe", "instructor");
  const alumno = await mk("Alumno", "a@test.pe", "student");
  alumnoId = alumno.id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-z", title: "Curso Z", priceCents: 100,
  }).returning();
  cursoId = c.id;

  await db.insert(enrollments).values({ userId: alumnoId, courseId: cursoId, status: "active" });
});

describe("reminderWindows", () => {
  it("calcula las ventanas de 24h y 1h con el solapamiento del spec", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const w = reminderWindows(now);
    expect(w.kind24h.from.toISOString()).toBe("2026-08-01T23:15:00.000Z");
    expect(w.kind24h.to.toISOString()).toBe("2026-08-02T00:45:00.000Z");
    expect(w.kind1h.from.toISOString()).toBe("2026-08-01T00:45:00.000Z");
    expect(w.kind1h.to.toISOString()).toBe("2026-08-01T01:15:00.000Z");
  });
});

describe("sendSessionReminders", () => {
  it("envía un recordatorio de 24h a un alumno inscrito con sesión en esa ventana", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", status: "scheduled",
      startsAt: new Date("2026-08-02T00:00:00Z"), durationMinutes: 60,
      zoomUrl: "https://zoom.us/j/1",
    });

    const result = await sendSessionReminders(now);
    expect(result.sent24h).toBe(1);
    expect(result.sent1h).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(sessionRemindersSent);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("24h");
  });

  it("no reenvía si ya se envió (ON CONFLICT DO NOTHING)", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", status: "scheduled",
      startsAt: new Date("2026-08-02T00:00:00Z"), durationMinutes: 60,
    });

    await sendSessionReminders(now);
    sendEmailMock.mockClear();
    const second = await sendSessionReminders(now);

    expect(second.sent24h).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await db.select().from(sessionRemindersSent)).toHaveLength(1);
  });

  it("ignora sesiones fuera de ambas ventanas", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase lejana", status: "scheduled",
      startsAt: new Date("2026-09-01T00:00:00Z"), durationMinutes: 60,
    });

    const result = await sendSessionReminders(now);
    expect(result.sent24h).toBe(0);
    expect(result.sent1h).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
