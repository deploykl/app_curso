import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";
import { getCertificadoPublico } from "@/modules/certification/queries";

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

describe("getCertificadoPublico", () => {
  it("devuelve los datos impresos para un código válido", async () => {
    await db.insert(certificates).values({
      enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
      instructorName: "Prof", academyName: "Academia Demo", hours: "10.00", finalScore: "90.00",
      paidAt: new Date(),
    });

    const r = await getCertificadoPublico("AB23-CD45");
    expect(r).not.toBeNull();
    expect(r!.estado).toBe("valido");
    if (r!.estado === "valido") {
      expect(r!.studentName).toBe("Alumno");
      expect(r!.courseTitle).toBe("Curso X");
      expect(r!.finalScore).toBe(90);
      expect(JSON.stringify(r)).not.toMatch(/@/); // sin email
      expect(Object.keys(r!).sort()).toEqual(
        ["academyName", "courseTitle", "estado", "finalScore", "hours", "instructorName", "issuedAt", "studentName"].sort()
      );
    }
  });

  it("devuelve estado revocado con la fecha", async () => {
    await db.insert(certificates).values({
      enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
      instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
      revokedAt: new Date("2026-05-01T00:00:00Z"), revokeReason: "Reembolso",
    });

    const r = await getCertificadoPublico("AB23-CD45");
    expect(r!.estado).toBe("revocado");
    if (r!.estado === "revocado") {
      expect(r!.revokedAt).toEqual(new Date("2026-05-01T00:00:00Z"));
      expect(Object.keys(r!).sort()).toEqual(["estado", "revokedAt"].sort());
    }
  });

  it("devuelve pendiente_pago sin filtrar datos si el certificado no fue pagado", async () => {
    await db.insert(certificates).values({
      enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
      instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
    });

    const r = await getCertificadoPublico("AB23-CD45");
    expect(r!.estado).toBe("pendiente_pago");
    expect(Object.keys(r!).sort()).toEqual(["estado"]);
  });

  it("devuelve null para un código inexistente", async () => {
    expect(await getCertificadoPublico("ZZZZ-ZZZZ")).toBeNull();
  });
});
