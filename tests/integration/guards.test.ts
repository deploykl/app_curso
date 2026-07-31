import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, courses, enrollments } from "@/db/schema";
import { isEnrolled, assertEnrolled, canManageCourse } from "@/modules/auth/guards";

let alumnoId: string;
let otroId: string;
let cursoId: string;

beforeEach(async () => {
  await db.delete(enrollments);
  await db.delete(courses);
  await db.delete(user);

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  const [o] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  const [inst] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();

  alumnoId = a.id; otroId = o.id;

  const [c] = await db.insert(courses).values({
    instructorId: inst.id, slug: "curso-x", title: "Curso X",
    priceCents: 19900, status: "published",
  }).returning();
  cursoId = c.id;

  await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  });
});

describe("isEnrolled", () => {
  it("es true para una inscripción activa", async () => {
    expect(await isEnrolled(alumnoId, cursoId)).toBe(true);
  });

  it("es false para quien no está inscrito", async () => {
    expect(await isEnrolled(otroId, cursoId)).toBe(false);
  });

  it("es false si la inscripción fue revocada", async () => {
    await db.update(enrollments).set({ status: "revoked" });
    expect(await isEnrolled(alumnoId, cursoId)).toBe(false);
  });

  it("es false si fue reembolsada", async () => {
    await db.update(enrollments).set({ status: "refunded" });
    expect(await isEnrolled(alumnoId, cursoId)).toBe(false);
  });
});

describe("assertEnrolled", () => {
  it("no lanza para un inscrito", async () => {
    await expect(assertEnrolled(alumnoId, cursoId)).resolves.toBeUndefined();
  });

  it("lanza para quien no lo está", async () => {
    await expect(assertEnrolled(otroId, cursoId)).rejects.toThrow(/no está inscrito/i);
  });
});

describe("canManageCourse", () => {
  it("el dueño puede", () => {
    expect(canManageCourse("u1", "instructor", "u1")).toBe(true);
  });

  it("otro instructor no puede", () => {
    expect(canManageCourse("u2", "instructor", "u1")).toBe(false);
  });

  it("un admin puede cualquiera", () => {
    expect(canManageCourse("u2", "admin", "u1")).toBe(true);
  });

  it("un alumno nunca puede, ni siendo el id igual", () => {
    expect(canManageCourse("u1", "student", "u1")).toBe(false);
  });
});
