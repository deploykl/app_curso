import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
  instructorProfiles,
} from "@/db/schema";
import { emitirCertificado } from "@/modules/certification/issuance";

let profId: string;
let alumnoId: string;
let cursoId: string;
let enrollmentId: string;

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

  profId = crypto.randomUUID();
  await db.insert(user).values({
    id: profId, name: "Prof Ana", email: "p@test.pe", emailVerified: true, role: "instructor",
  });
  await db.insert(instructorProfiles).values({
    userId: profId, displayName: "Ana Torres", status: "approved",
  });

  alumnoId = crypto.randomUUID();
  await db.insert(user).values({
    id: alumnoId, name: "Luis Salas", email: "a@test.pe", emailVerified: true, role: "student",
  });

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "excel-desde-cero", title: "Excel desde cero",
    priceCents: 100, estimatedHours: "12.50",
  }).returning();
  cursoId = c.id;

  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  }).returning();
  enrollmentId = e.id;
});

describe("emitirCertificado", () => {
  it("crea el certificado con los snapshots correctos", async () => {
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });

    const [cert] = await db.select().from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId));
    expect(cert).toBeDefined();
    expect(cert.studentName).toBe("Luis Salas");
    expect(cert.courseTitle).toBe("Excel desde cero");
    expect(cert.instructorName).toBe("Ana Torres");
    expect(Number(cert.finalScore)).toBe(87.5);
    expect(Number(cert.hours)).toBe(12.5);
    expect(cert.pdfKey).toBeNull();
    expect(cert.revokedAt).toBeNull();
    expect(cert.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("es idempotente: llamarlo dos veces no crea un segundo certificado", async () => {
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });

    const rows = await db.select().from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId));
    expect(rows).toHaveLength(1);
  });
});
