import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, classSessions, enrollments, orders, orderItems } from "@/db/schema";

let profId: string;
let otroProfId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createCourse, publishCourse, updateCourse, deleteCourse } = await import("@/modules/catalog/actions");

beforeEach(async () => {
  // order_items/orders pueden quedar de otro archivo de test (mismo suite,
  // misma DB, `fileParallelism: false`) referenciando `courses` por FK.
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  const [o] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;
  otroProfId = o.id;
});

describe("createCourse", () => {
  it("crea el curso en borrador con slug derivado del título", async () => {
    const r = await createCourse({ title: "Diseño Gráfico Básico", level: "basico", priceSoles: "199" });
    const [c] = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(c.slug).toBe("diseno-grafico-basico");
    expect(c.status).toBe("draft");
    expect(c.priceCents).toBe(19900);
  });

  it("desambigua slugs repetidos", async () => {
    await createCourse({ title: "Excel", level: "basico", priceSoles: "100" });
    const r2 = await createCourse({ title: "Excel", level: "basico", priceSoles: "100" });
    const [c2] = await db.select().from(courses).where(eq(courses.id, r2.id));
    expect(c2.slug).toBe("excel-2");
  });
});

describe("publishCourse", () => {
  it("rechaza publicar sin sesiones", async () => {
    const r = await createCourse({ title: "Sin clases", level: "basico", priceSoles: "50" });
    await expect(publishCourse(r.id)).rejects.toThrow(/al menos una sesión/i);
  });

  it("publica cuando está completo", async () => {
    const r = await createCourse({ title: "Completo", level: "basico", priceSoles: "50" });
    await db.insert(classSessions).values({
      courseId: r.id, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
    });
    await publishCourse(r.id);
    const [c] = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(c.status).toBe("published");
    expect(c.publishedAt).not.toBeNull();
  });
});

describe("deleteCourse", () => {
  it("elimina un curso sin inscripciones ni órdenes", async () => {
    const r = await createCourse({ title: "Borrar Este", level: "basico", priceSoles: "50" });
    await db.insert(classSessions).values({
      courseId: r.id, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
    });

    await deleteCourse(r.id);

    const rows = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(rows).toHaveLength(0);
    const sessions = await db.select().from(classSessions).where(eq(classSessions.courseId, r.id));
    expect(sessions).toHaveLength(0);
  });

  it("rechaza eliminar un curso con alumnos inscritos", async () => {
    const r = await createCourse({ title: "Con Alumnos", level: "basico", priceSoles: "50" });
    const [alumno] = await db.insert(user).values({
      id: crypto.randomUUID(), name: "Alumno", email: "al@test.pe",
      emailVerified: true, role: "student",
    }).returning();
    await db.insert(enrollments).values({ userId: alumno.id, courseId: r.id, status: "active" });

    await expect(deleteCourse(r.id)).rejects.toThrow(/alumnos inscritos/i);
    const rows = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(rows).toHaveLength(1);
  });

  it("un instructor no puede eliminar el curso de otro", async () => {
    const [ajeno] = await db.insert(courses).values({
      instructorId: otroProfId, slug: "ajeno-borrar", title: "Ajeno", priceCents: 100,
    }).returning();
    await expect(deleteCourse(ajeno.id)).rejects.toThrow(/no puedes gestionar/i);
  });
});

describe("propiedad del curso", () => {
  it("un instructor no puede editar el curso de otro", async () => {
    const [ajeno] = await db.insert(courses).values({
      instructorId: otroProfId, slug: "ajeno", title: "Ajeno", priceCents: 100,
    }).returning();

    await expect(
      updateCourse(ajeno.id, { title: "Secuestrado", level: "basico", priceSoles: "1" })
    ).rejects.toThrow(/no puedes gestionar/i);
  });
});
