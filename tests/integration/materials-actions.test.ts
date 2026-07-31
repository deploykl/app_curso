import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, sessionMaterials, enrollments } from "@/db/schema";

let profId: string;
let alumnoId: string;
let otroId: string;
let sessionId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

const acts = await import("@/modules/materials/actions");

beforeEach(async () => {
  await db.delete(sessionMaterials);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  profId = (await mk("Prof", "p@test.pe", "instructor")).id;
  alumnoId = (await mk("Alumno", "a@test.pe", "student")).id;
  otroId = (await mk("Otro", "o@test.pe", "student")).id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "c", title: "Curso", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s] = await db.insert(classSessions).values({
    courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
  }).returning();
  sessionId = s.id;

  await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  });
});

describe("addLinkMaterial", () => {
  it("guarda un material de tipo enlace", async () => {
    await acts.addLinkMaterial(sessionId, {
      title: "Plantilla", externalUrl: "https://drive.google.com/x",
    });
    const rows = await db.select().from(sessionMaterials);
    expect(rows).toHaveLength(1);
    expect(rows[0].fileKey).toBeNull();
    expect(rows[0].externalUrl).toBe("https://drive.google.com/x");
  });

  it("rechaza un enlace http", async () => {
    await expect(
      acts.addLinkMaterial(sessionId, { title: "X", externalUrl: "http://insegur.o/x" })
    ).rejects.toThrow();
  });
});

describe("getMaterialDownloadUrl", () => {
  it("devuelve URL firmada a un alumno inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    const url = await acts.getMaterialDownloadUrl(alumnoId, m.id);
    expect(url).toContain("materials/x/guia.pdf");
  });

  it("niega a quien no está inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    await expect(acts.getMaterialDownloadUrl(otroId, m.id)).rejects.toThrow(/no está inscrito/i);
  });

  it("niega si la inscripción fue revocada", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    await db.update(enrollments).set({ status: "revoked" });
    await expect(acts.getMaterialDownloadUrl(alumnoId, m.id)).rejects.toThrow(/no está inscrito/i);
  });
});
