import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";
import { getMisCertificados } from "@/modules/certification/queries";

let alumnoId: string;
let otroId: string;

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
  const [otro] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe", emailVerified: true, role: "student",
  }).returning();
  alumnoId = alumno.id;
  otroId = otro.id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: c.id, status: "active",
  }).returning();

  await db.insert(certificates).values({
    enrollmentId: e.id, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
  });
});

describe("getMisCertificados", () => {
  it("devuelve solo los certificados del usuario que consulta", async () => {
    const propios = await getMisCertificados(alumnoId);
    expect(propios).toHaveLength(1);
    expect(propios[0].code).toBe("AB23-CD45");

    const ajenos = await getMisCertificados(otroId);
    expect(ajenos).toHaveLength(0);
  });
});
