import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";

const r2Send = vi.fn(async (_command: { input: Record<string, unknown> }) => ({}));

vi.mock("@/lib/r2", () => ({
  r2: { send: r2Send },
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

let enrollmentId: string;

beforeEach(async () => {
  r2Send.mockClear();
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
  it("genera un PDF y devuelve una key de R2 (R2 mockeado, sin credenciales reales)", async () => {
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
    expect(r2Send).toHaveBeenCalledTimes(1);
    const command = r2Send.mock.calls[0][0];
    expect(command.input.Bucket).toBeDefined();
    expect(command.input.Key).toBe("certificados/AB23-CD45/pdf/certificado.pdf");
    expect(command.input.ContentType).toBe("application/pdf");
    expect(Buffer.isBuffer(command.input.Body)).toBe(true);
  });
});

describe("GET /api/certificados/[code]/pdf", () => {
  it("devuelve 404 para un certificado revocado sin tocar R2", async () => {
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
