import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers,
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

describe("responder", () => {
  it("guarda la respuesta con isCorrect calculado en el servidor", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);

    const [r] = await db.select().from(examAttemptAnswers)
      .where(eq(examAttemptAnswers.attemptId, attemptId));
    expect(r.selectedOptionId).toBe(p1.buenaId);
    expect(r.isCorrect).toBe(true);
  });

  it("no devuelve nada al cliente", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    expect(await acts.responder(attemptId, p1.questionId, p1.buenaId)).toBeUndefined();
  });

  it("cambiar de opción actualiza la fila en vez de duplicarla", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.buenaId);
    await acts.responder(attemptId, p1.questionId, p1.malaId);

    const filas = await db.select().from(examAttemptAnswers)
      .where(eq(examAttemptAnswers.attemptId, attemptId));
    expect(filas).toHaveLength(1);
    expect(filas[0].selectedOptionId).toBe(p1.malaId);
    expect(filas[0].isCorrect).toBe(false);
  });

  it("rechaza una opción que no pertenece a la pregunta", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await expect(acts.responder(attemptId, p1.questionId, p2.buenaId))
      .rejects.toThrow(/opción inválida/i);
  });

  it("rechaza una pregunta que no pertenece al intento", async () => {
    await db.update(exams).set({ questionsPerAttempt: 1 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);

    const enElIntento = await db.select().from(examAttemptQuestions)
      .where(eq(examAttemptQuestions.attemptId, attemptId));
    const fuera = enElIntento[0].questionId === p1.questionId ? p2 : p1;

    await expect(acts.responder(attemptId, fuera.questionId, fuera.buenaId))
      .rejects.toThrow(/no pertenece a este intento/i);
  });

  it("rechaza el intento de otro alumno", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    currentUser = { id: otroId, role: "student" };
    await expect(acts.responder(attemptId, p1.questionId, p1.buenaId))
      .rejects.toThrow(/no encontrado/i);
  });

  it("rechaza responder un intento ya enviado", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await db.update(examAttempts)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(examAttempts.id, attemptId));

    await expect(acts.responder(attemptId, p1.questionId, p1.buenaId))
      .rejects.toThrow(/ya fue enviado/i);
  });

  it("rechaza responder después de que venció el tiempo", async () => {
    await db.update(exams).set({ timeLimitMinutes: 30 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);
    await db.update(examAttempts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(examAttempts.id, attemptId));

    await expect(acts.responder(attemptId, p1.questionId, p1.buenaId))
      .rejects.toThrow(/tiempo/i);
  });
});

describe("getIntentoParaResolver", () => {
  it("devuelve las preguntas en el orden congelado", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    const a = await qs.getIntentoParaResolver(alumnoId, attemptId);

    const orden = await db.select().from(examAttemptQuestions)
      .where(eq(examAttemptQuestions.attemptId, attemptId));
    const esperado = orden.sort((x, y) => x.orderIndex - y.orderIndex).map((o) => o.questionId);

    expect(a!.preguntas.map((p) => p.id)).toEqual(esperado);
  });

  it("dos llamadas seguidas dan exactamente el mismo orden de opciones", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    const a1 = await qs.getIntentoParaResolver(alumnoId, attemptId);
    const a2 = await qs.getIntentoParaResolver(alumnoId, attemptId);
    expect(a1!.preguntas.map((p) => p.opciones.map((o) => o.id)))
      .toEqual(a2!.preguntas.map((p) => p.opciones.map((o) => o.id)));
  });

  it("NO expone isCorrect ni la explicación mientras el intento está en curso", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    const a = await qs.getIntentoParaResolver(alumnoId, attemptId);

    const serializado = JSON.stringify(a);
    expect(serializado).not.toMatch(/isCorrect/);
    expect(serializado).not.toMatch(/explanation/i);
    expect(serializado).not.toMatch(/Explicación de/);
  });

  it("incluye la opción ya seleccionada", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    await acts.responder(attemptId, p1.questionId, p1.malaId);

    const a = await qs.getIntentoParaResolver(alumnoId, attemptId);
    const pregunta = a!.preguntas.find((p) => p.id === p1.questionId);
    expect(pregunta!.seleccionadaId).toBe(p1.malaId);
    expect(a!.preguntas.find((p) => p.id === p2.questionId)!.seleccionadaId).toBeNull();
  });

  it("marca vencido cuando expiró el tiempo", async () => {
    await db.update(exams).set({ timeLimitMinutes: 30 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);
    await db.update(examAttempts)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(examAttempts.id, attemptId));

    const a = await qs.getIntentoParaResolver(alumnoId, attemptId);
    expect(a!.vencido).toBe(true);
  });

  it("devuelve null para el intento de otro alumno", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    expect(await qs.getIntentoParaResolver(otroId, attemptId)).toBeNull();
  });

  it("devuelve null para un attemptId inexistente", async () => {
    expect(await qs.getIntentoParaResolver(alumnoId, crypto.randomUUID())).toBeNull();
  });
});
