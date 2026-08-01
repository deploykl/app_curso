import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers,
  instructorProfiles,
} from "@/db/schema";

let alumnoId: string;
let otroId: string;
let cursoId: string;
let examId: string;
let p1: { questionId: string; buenaId: string; malaId: string };
let p2: { questionId: string; buenaId: string; malaId: string };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUser = { id: "", role: "student" };
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ ...currentUser, name: "Alumno" })),
  assertRole: vi.fn(async () => ({ ...currentUser, name: "Alumno" })),
}));

const acts = await import("@/modules/assessment/actions");
const qs = await import("@/modules/assessment/queries");
const grading = await import("@/modules/assessment/grading");

async function crearPregunta(prompt: string, orderIndex: number, points = 1) {
  const [q] = await db.insert(questions).values({
    examId, type: "mcq", promptMd: prompt,
    explanationMd: `Explicación de ${prompt}`, points, orderIndex,
  }).returning();
  const [buena] = await db.insert(questionOptions).values({
    questionId: q.id, text: "Correcta", isCorrect: true, orderIndex: 0,
  }).returning();
  const [mala] = await db.insert(questionOptions).values({
    questionId: q.id, text: "Incorrecta", isCorrect: false, orderIndex: 1,
  }).returning();
  return { questionId: q.id, buenaId: buena.id, malaId: mala.id };
}

beforeEach(async () => {
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

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  const prof = await mk("Prof", "p@test.pe", "instructor");
  await db.insert(instructorProfiles).values({
    userId: prof.id, displayName: "Prof", status: "approved",
  });
  alumnoId = (await mk("Alumno", "a@test.pe", "student")).id;
  otroId = (await mk("Otro", "o@test.pe", "student")).id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-examen", title: "Curso Examen", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [ex] = await db.insert(exams).values({
    courseId: cursoId, title: "Examen final", passingScore: 70,
    maxAttempts: 3, lockoutHours: 24, isPublished: true, shuffleQuestions: false,
  }).returning();
  examId = ex.id;

  p1 = await crearPregunta("Pregunta 1", 0);
  p2 = await crearPregunta("Pregunta 2", 1);

  await db.insert(enrollments).values({ userId: alumnoId, courseId: cursoId, status: "active" });
  await db.insert(enrollments).values({ userId: otroId, courseId: cursoId, status: "active" });

  currentUser = { id: alumnoId, role: "student" };
});

describe("enviarIntento", () => {
  it("califica sobre el total de puntos del intento", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);
    await acts.responder(attemptId, p2.questionId, p2.malaId);

    await acts.enviarIntento(attemptId);

    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.status).toBe("submitted");
    expect(Number(a.score)).toBe(50);
    expect(a.passed).toBe(false);
    expect(a.submittedAt).not.toBeNull();
  });

  it("aprueba cuando la nota alcanza el umbral", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);
    await acts.responder(attemptId, p2.questionId, p2.buenaId);

    await acts.enviarIntento(attemptId);

    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(Number(a.score)).toBe(100);
    expect(a.passed).toBe(true);
  });

  it("las preguntas sin responder cuentan como incorrectas", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);

    await acts.enviarIntento(attemptId);

    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(Number(a.score)).toBe(50);
  });

  it("es idempotente: enviar dos veces no cambia la nota ni el submittedAt", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);
    await acts.enviarIntento(attemptId);

    const [primero] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));

    await acts.enviarIntento(attemptId);

    const [segundo] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(segundo.score).toBe(primero.score);
    expect(segundo.submittedAt!.getTime()).toBe(primero.submittedAt!.getTime());
  });

  it("un intento vencido se califica solo con lo respondido a tiempo", async () => {
    await db.update(exams).set({ timeLimitMinutes: 30 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);

    await db.update(examAttempts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(examAttempts.id, attemptId));

    const r = await grading.cerrarIntento(attemptId);
    expect(r.scorePct).toBe(50);

    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.status).toBe("submitted");
  });

  it("rechaza el intento de otro alumno", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    currentUser = { id: otroId, role: "student" };
    await expect(acts.enviarIntento(attemptId)).rejects.toThrow(/no encontrado/i);
  });
});

describe("getResultado", () => {
  it("devuelve nota, aciertos y explicaciones tras enviar", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);
    await acts.responder(attemptId, p2.questionId, p2.malaId);
    await acts.enviarIntento(attemptId);

    const r = await qs.getResultado(alumnoId, attemptId);
    expect(r).not.toBeNull();
    expect(r!.scorePct).toBe(50);
    expect(r!.passed).toBe(false);
    expect(r!.passingScore).toBe(70);
    expect(r!.preguntas).toHaveLength(2);

    const primera = r!.preguntas.find((p) => p.id === p1.questionId)!;
    expect(primera.acerto).toBe(true);
    expect(primera.explanationMd).toBe("Explicación de Pregunta 1");
    expect(primera.opciones.find((o) => o.isCorrect)!.id).toBe(p1.buenaId);

    const segunda = r!.preguntas.find((p) => p.id === p2.questionId)!;
    expect(segunda.acerto).toBe(false);
    expect(segunda.seleccionadaId).toBe(p2.malaId);
  });

  it("devuelve null si el intento sigue en curso", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    expect(await qs.getResultado(alumnoId, attemptId)).toBeNull();
  });

  it("devuelve null para el intento de otro alumno", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.enviarIntento(attemptId);
    expect(await qs.getResultado(otroId, attemptId)).toBeNull();
  });
});
