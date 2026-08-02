import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";

let currentUser = { id: "", role: "admin" };
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ ...currentUser, name: "Admin" })),
  assertRole: vi.fn(async () => ({ ...currentUser, name: "Admin" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

const acts = await import("@/modules/certification/actions");
const qs = await import("@/modules/certification/queries");

let certificateId: string;

beforeEach(async () => {
  await db.delete(certificates);
  await db.delete(examAttemptAnswers);
  await db.delete(examAttemptQuestions);
  await db.delete(examAttempts);
  await db.delete(questionOptions);
  await db.delete(questions);
  await db.delete(exams);
  await db.delete(sessionAttendance);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const adminId = crypto.randomUUID();
  await db.insert(user).values({
    id: adminId, name: "Admin", email: "adm@test.pe", emailVerified: true, role: "admin",
  });
  currentUser = { id: adminId, role: "admin" };

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();

  const [cert] = await db.insert(certificates).values({
    enrollmentId: e.id, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
  }).returning();
  certificateId = cert.id;
});

describe("listarCertificados", () => {
  it("devuelve todos los certificados emitidos", async () => {
    const rows = await qs.listarCertificados();
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("AB23-CD45");
  });
});

describe("revocarCertificado", () => {
  it("fija revokedAt y revokeReason", async () => {
    await acts.revocarCertificado(certificateId, "Reembolso aprobado");

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokedAt).not.toBeNull();
    expect(cert.revokeReason).toBe("Reembolso aprobado");
  });

  it("rechaza sin motivo", async () => {
    await expect(acts.revocarCertificado(certificateId, "")).rejects.toThrow(/motivo/i);
  });

  it("rechaza un certificado inexistente", async () => {
    await expect(acts.revocarCertificado(crypto.randomUUID(), "Motivo")).rejects.toThrow(/no encontrado/i);
  });

  it("borra el pdfKey al revocar un certificado que ya tenía PDF generado", async () => {
    // Simula que ya se había generado y subido un PDF antes de la
    // revocación (no invocamos R2 real; `deleteObject` está mockeado).
    await db.update(certificates)
      .set({ pdfKey: `certificados/AB23-CD45/pdf/certificado.pdf` })
      .where(eq(certificates.id, certificateId));

    await acts.revocarCertificado(certificateId, "Reembolso aprobado");

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.pdfKey).toBeNull();
    expect(cert.revokedAt).not.toBeNull();

    const { deleteObject } = await import("@/lib/r2");
    expect(deleteObject).toHaveBeenCalledWith("certificados/AB23-CD45/pdf/certificado.pdf");
  });
});
