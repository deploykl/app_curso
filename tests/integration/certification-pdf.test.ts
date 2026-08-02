import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";

const putObject = vi.fn<(key: string, body: Buffer, contentType: string) => Promise<void>>(
  async () => {}
);

vi.mock("@/lib/r2", () => ({
  usingR2: false,
  putObject,
  getObject: vi.fn(async () => Buffer.from("")),
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

let enrollmentId: string;

beforeEach(async () => {
  putObject.mockClear();
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
  enrollmentId = e.id;
});

describe("generarYSubirPdf", () => {
  it("genera un PDF y lo sube al almacenamiento (mockeado)", async () => {
    const { generarYSubirPdf } = await import("@/modules/certification/pdf");

    const key = await generarYSubirPdf({
      code: "AB23-CD45",
      studentName: "Alumno",
      courseTitle: "Curso X",
      instructorName: "Prof",
      academyName: "Academia Demo",
      hours: 10,
      finalScore: 90,
      issuedAt: new Date(),
    });

    expect(key).toBe("certificados/AB23-CD45/pdf/certificado.pdf");
    expect(putObject).toHaveBeenCalledTimes(1);
    const [subidaKey, body, contentType] = putObject.mock.calls[0];
    expect(subidaKey).toBe("certificados/AB23-CD45/pdf/certificado.pdf");
    expect(contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(body)).toBe(true);
  });
});

describe("GET /api/certificados/[code]/pdf", () => {
  it("devuelve 404 para un certificado revocado sin tocar el almacenamiento", async () => {
    const [cert] = await db.insert(certificates).values({
      enrollmentId,
      code: "REVOKED-1",
      studentName: "Alumno",
      courseTitle: "Curso X",
      instructorName: "Prof",
      academyName: "Academia Demo",
      hours: "10",
      finalScore: "90",
      revokedAt: new Date(),
      revokeReason: "prueba",
    }).returning();

    const { GET } = await import("@/app/api/certificados/[code]/pdf/route");

    const res = await GET(new Request(`http://localhost/api/certificados/${cert.code}/pdf`), {
      params: Promise.resolve({ code: cert.code }),
    });

    expect(res.status).toBe(404);
  });
});
