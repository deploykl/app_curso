import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, enrollments, sessionAttendance } from "@/db/schema";
import { eq } from "drizzle-orm";

let alumnoId: string;
let otroId: string;
let cursoId: string;
let sessionId: string;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUserId = "";
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: currentUserId, role: "student", name: "Alumno" })),
}));

const acts = await import("@/modules/learning/actions");

beforeEach(async () => {
  await db.delete(sessionAttendance);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  const prof = await mk("Prof", "p@test.pe", "instructor");
  alumnoId = (await mk("Alumno", "a@test.pe", "student")).id;
  otroId = (await mk("Otro", "o@test.pe", "student")).id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-y", title: "Curso Y", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s] = await db.insert(classSessions).values({
    courseId: cursoId, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
  }).returning();
  sessionId = s.id;

  await db.insert(enrollments).values({ userId: alumnoId, courseId: cursoId, status: "active" });
});

describe("marcarProgreso", () => {
  it("inserta una fila de asistencia para el alumno inscrito", async () => {
    currentUserId = alumnoId;
    await acts.marcarProgreso(sessionId);
    const rows = await db.select().from(sessionAttendance);
    expect(rows).toHaveLength(1);
  });

  it("es idempotente: marcar dos veces no duplica la fila", async () => {
    currentUserId = alumnoId;
    await acts.marcarProgreso(sessionId);
    await acts.marcarProgreso(sessionId);
    const rows = await db.select().from(sessionAttendance);
    expect(rows).toHaveLength(1);
  });

  it("rechaza a quien no está inscrito", async () => {
    currentUserId = otroId;
    await expect(acts.marcarProgreso(sessionId)).rejects.toThrow(/no está inscrito/i);
    expect(await db.select().from(sessionAttendance)).toHaveLength(0);
  });

  it("rechaza una sesión inexistente", async () => {
    currentUserId = alumnoId;
    await expect(acts.marcarProgreso(crypto.randomUUID())).rejects.toThrow(/no encontrada/i);
  });
});
