import { describe, it, expect, beforeEach, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, classSessions, enrollments } from "@/db/schema";

let profId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const acts = await import("@/modules/catalog/session-actions");

beforeEach(async () => {
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "c", title: "Curso", priceCents: 100,
  }).returning();
  cursoId = c.id;
});

describe("createClassSession", () => {
  it("asigna orderIndex incremental empezando en 0", async () => {
    for (const t of ["Clase 1", "Clase 2", "Clase 3"]) {
      await acts.createClassSession(cursoId, {
        title: t, startsAtLocal: "2026-08-15T10:00",
        durationMinutes: 90, isFreePreview: false,
      });
    }
    const rows = await db.select().from(classSessions)
      .where(eq(classSessions.courseId, cursoId)).orderBy(asc(classSessions.orderIndex));
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
  });

  it("guarda la hora convertida a UTC desde Lima", async () => {
    await acts.createClassSession(cursoId, {
      title: "Clase", startsAtLocal: "2026-08-15T10:00",
      durationMinutes: 60, isFreePreview: false,
    });
    const [s] = await db.select().from(classSessions);
    expect(s.startsAt?.toISOString()).toBe("2026-08-15T15:00:00.000Z");
  });

  it("rechaza un enlace que no sea de videollamada", async () => {
    await expect(acts.createClassSession(cursoId, {
      title: "Clase", startsAtLocal: "2026-08-15T10:00", durationMinutes: 60,
      zoomUrl: "https://evil.com/j/1", isFreePreview: false,
    })).rejects.toThrow();
  });
});

describe("setRecordingUrl", () => {
  it("guarda la grabación y marca la sesión como completada", async () => {
    const [s] = await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
    }).returning();

    await acts.setRecordingUrl(s.id, "https://drive.google.com/file/abc");
    const [after] = await db.select().from(classSessions).where(eq(classSessions.id, s.id));
    expect(after.recordingUrl).toBe("https://drive.google.com/file/abc");
    expect(after.status).toBe("completed");
    expect(after.recordingAddedAt).not.toBeNull();
  });

  it("rechaza un enlace sin https", async () => {
    const [s] = await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
    }).returning();
    await expect(acts.setRecordingUrl(s.id, "http://insegur.o/x")).rejects.toThrow(/https/i);
  });
});

describe("reorderClassSessions", () => {
  it("reasigna los índices en el orden recibido", async () => {
    const ids: string[] = [];
    for (const t of ["A", "B", "C"]) {
      const [s] = await db.insert(classSessions).values({
        courseId: cursoId, title: t, startsAt: new Date(),
        durationMinutes: 60, orderIndex: ids.length,
      }).returning();
      ids.push(s.id);
    }
    await acts.reorderClassSessions(cursoId, [ids[2], ids[0], ids[1]]);
    const rows = await db.select().from(classSessions).orderBy(asc(classSessions.orderIndex));
    expect(rows.map((r) => r.title)).toEqual(["C", "A", "B"]);
  });
});
