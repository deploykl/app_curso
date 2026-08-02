import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, certificates,
} from "@/db/schema";

vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

let enrollmentId: string;
let enrollmentSinCertId: string;
let certificateId: string;

beforeEach(async () => {
  await db.delete(certificates);
  await db.delete(enrollments);
  await db.delete(courses);
  await db.delete(user);

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [c2] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-y", title: "Curso Y", priceCents: 100,
  }).returning();

  const [e1] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();
  enrollmentId = e1.id;

  const [cert] = await db.insert(certificates).values({
    enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
    pdfKey: "certificados/AB23-CD45/pdf/certificado.pdf",
  }).returning();
  certificateId = cert.id;

  // Inscripción a OTRO curso (el UNIQUE de enrollments es por usuario+curso),
  // sin certificado — cubre el camino "alumno nunca aprobó el examen".
  const [e2] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c2.id, status: "active",
  }).returning();
  enrollmentSinCertId = e2.id;
});

afterAll(async () => {
  await db.delete(certificates);
  await db.delete(enrollments);
  await db.delete(courses);
  await db.delete(user);
});

describe("revocarCertificadoTx", () => {
  it("revoca el certificado y devuelve la pdfKey anterior", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    const resultado = await db.transaction(async (tx) => {
      return revocarCertificadoTx(tx, enrollmentId, "Reembolso");
    });

    expect(resultado).toEqual({ pdfKey: "certificados/AB23-CD45/pdf/certificado.pdf" });

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokedAt).not.toBeNull();
    expect(cert.revokeReason).toBe("Reembolso");
    expect(cert.pdfKey).toBeNull();
  });

  it("no hace nada si la inscripción no tiene certificado", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    const resultado = await db.transaction(async (tx) => {
      return revocarCertificadoTx(tx, enrollmentSinCertId, "Reembolso");
    });

    expect(resultado).toBeNull();
  });

  it("es idempotente: no vuelve a escribir si ya estaba revocado", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    await db.transaction(async (tx) => revocarCertificadoTx(tx, enrollmentId, "Primer motivo"));
    const segundo = await db.transaction(async (tx) => revocarCertificadoTx(tx, enrollmentId, "Segundo motivo"));

    expect(segundo).toBeNull();
    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokeReason).toBe("Primer motivo");
  });
});
