import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, instructorProfiles, categories, courses, classSessions, enrollments } from "@/db/schema";
import { listPublishedCourses, getPublicCourse } from "@/modules/catalog/queries";

beforeEach(async () => {
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(instructorProfiles);
  await db.delete(categories);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Ana Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  await db.insert(instructorProfiles).values({
    userId: p.id, displayName: "Ana Instructora", status: "approved",
  });

  const [cat] = await db.insert(categories).values({
    slug: "ofimatica", name: "Ofimática",
  }).returning();

  const [pub] = await db.insert(courses).values({
    instructorId: p.id, categoryId: cat.id, slug: "excel", title: "Excel",
    priceCents: 19900, status: "published", publishedAt: new Date(),
    estimatedHours: "8.00", level: "basico",
  }).returning();

  await db.insert(courses).values({
    instructorId: p.id, slug: "borrador", title: "Borrador",
    priceCents: 9900, status: "draft", level: "basico",
  });

  await db.insert(classSessions).values({
    courseId: pub.id, orderIndex: 0, title: "Clase 1",
    startsAt: new Date("2020-01-01T15:00:00Z"), durationMinutes: 90,
    zoomUrl: "https://zoom.us/j/secreto", recordingUrl: "https://drive.google.com/secreto",
    isFreePreview: true,
  });
});

describe("listPublishedCourses", () => {
  it("solo devuelve cursos publicados", async () => {
    const rows = await listPublishedCourses({});
    expect(rows.map((r) => r.slug)).toEqual(["excel"]);
  });

  it("filtra por categoría", async () => {
    expect(await listPublishedCourses({ categorySlug: "ofimatica" })).toHaveLength(1);
    expect(await listPublishedCourses({ categorySlug: "diseno" })).toHaveLength(0);
  });

  it("filtra por nivel", async () => {
    expect(await listPublishedCourses({ level: "basico" })).toHaveLength(1);
    expect(await listPublishedCourses({ level: "avanzado" })).toHaveLength(0);
  });

  it("busca por texto en el título, sin distinguir mayúsculas", async () => {
    expect(await listPublishedCourses({ q: "exc" })).toHaveLength(1);
    expect(await listPublishedCourses({ q: "photoshop" })).toHaveLength(0);
  });

  it("incluye el nombre del instructor y el conteo de sesiones", async () => {
    const [c] = await listPublishedCourses({});
    expect(c.instructorName).toBe("Ana Instructora");
    expect(c.sessionCount).toBe(1);
  });
});

describe("getPublicCourse", () => {
  it("devuelve null para un curso en borrador", async () => {
    expect(await getPublicCourse("borrador")).toBeNull();
  });

  it("devuelve null para un slug inexistente", async () => {
    expect(await getPublicCourse("no-existe")).toBeNull();
  });

  it("NUNCA expone zoomUrl ni recordingUrl", async () => {
    const c = await getPublicCourse("excel");
    expect(c).not.toBeNull();
    const serializado = JSON.stringify(c);
    expect(serializado).not.toContain("secreto");
    expect(serializado).not.toContain("zoom.us");
    expect(serializado).not.toContain("drive.google.com");
    for (const s of c!.sessions) {
      expect(s).not.toHaveProperty("zoomUrl");
      expect(s).not.toHaveProperty("recordingUrl");
    }
  });

  it("sí indica si una sesión tiene grabación disponible", async () => {
    const c = await getPublicCourse("excel");
    expect(c!.sessions[0].hasRecording).toBe(true);
  });
});
