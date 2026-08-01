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
let enrollmentId: string;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUser = { id: "", role: "student" };
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ ...currentUser, name: "Alumno" })),
  assertRole: vi.fn(async () => ({ ...currentUser, name: "Alumno" })),
}));

const acts = await import("@/modules/assessment/actions");
const qs = await import("@/modules/assessment/queries");

/** Inserta una pregunta con dos opciones y devuelve sus ids. */
async function crearPregunta(prompt: string, orderIndex: number, points = 1) {
  const [q] = await db.insert(questions).values({
    examId, type: "mcq", promptMd: prompt, points, orderIndex,
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
    maxAttempts: 3, lockoutHours: 24, isPublished: true,
  }).returning();
  examId = ex.id;

  await crearPregunta("Pregunta 1", 0);
  await crearPregunta("Pregunta 2", 1);
  await crearPregunta("Pregunta 3", 2);

  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  }).returning();
  enrollmentId = e.id;

  currentUser = { id: alumnoId, role: "student" };
});

describe("iniciarIntento", () => {
  it("crea el intento y congela el orden de las preguntas", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);

    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.status).toBe("in_progress");
    expect(a.attemptNumber).toBe(1);

    const orden = await db.select().from(examAttemptQuestions)
      .where(eq(examAttemptQuestions.attemptId, attemptId));
    expect(orden).toHaveLength(3);
    expect(orden.map((o) => o.orderIndex).sort()).toEqual([0, 1, 2]);
  });

  it("devuelve el mismo intento si ya hay uno en curso (dos pestañas)", async () => {
    const a1 = await acts.iniciarIntento(cursoId);
    const a2 = await acts.iniciarIntento(cursoId);
    expect(a2).toBe(a1);
    expect(await db.select().from(examAttempts)).toHaveLength(1);
  });

  it("incrementa attemptNumber tras enviar el anterior", async () => {
    const a1 = await acts.iniciarIntento(cursoId);
    await db.update(examAttempts)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(examAttempts.id, a1));

    const a2 = await acts.iniciarIntento(cursoId);
    const [segundo] = await db.select().from(examAttempts).where(eq(examAttempts.id, a2));
    expect(segundo.attemptNumber).toBe(2);
  });

  it("respeta questionsPerAttempt", async () => {
    await db.update(exams).set({ questionsPerAttempt: 2 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);
    const orden = await db.select().from(examAttemptQuestions)
      .where(eq(examAttemptQuestions.attemptId, attemptId));
    expect(orden).toHaveLength(2);
  });

  it("fija expiresAt cuando hay límite de tiempo", async () => {
    await db.update(exams).set({ timeLimitMinutes: 30 }).where(eq(exams.id, examId));
    const attemptId = await acts.iniciarIntento(cursoId);
    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.expiresAt).not.toBeNull();
    const minutos = (a.expiresAt!.getTime() - a.startedAt.getTime()) / 60_000;
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThan(31);
  });

  it("deja expiresAt en null cuando no hay límite", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.expiresAt).toBeNull();
  });

  it("bloquea al agotar los intentos dentro de la ventana", async () => {
    for (let n = 1; n <= 3; n++) {
      await db.insert(examAttempts).values({
        enrollmentId, attemptNumber: n, status: "submitted",
        startedAt: new Date(), submittedAt: new Date(),
      });
    }
    await expect(acts.iniciarIntento(cursoId)).rejects.toThrow(/agotaste tus intentos/i);
  });

  it("permite un intento nuevo cuando el bloqueo ya expiró", async () => {
    const hace48h = new Date(Date.now() - 48 * 3_600_000);
    for (let n = 1; n <= 3; n++) {
      await db.insert(examAttempts).values({
        enrollmentId, attemptNumber: n, status: "submitted",
        startedAt: hace48h, submittedAt: hace48h,
      });
    }
    const attemptId = await acts.iniciarIntento(cursoId);
    const [a] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId));
    expect(a.attemptNumber).toBe(4);
  });

  it("rechaza a quien no está inscrito", async () => {
    currentUser = { id: otroId, role: "student" };
    await expect(acts.iniciarIntento(cursoId)).rejects.toThrow(/no está inscrito/i);
  });

  it("rechaza si el examen no está publicado", async () => {
    await db.update(exams).set({ isPublished: false }).where(eq(exams.id, examId));
    await expect(acts.iniciarIntento(cursoId)).rejects.toThrow(/no tiene un examen publicado/i);
  });

  it("rechaza si el examen no tiene preguntas activas", async () => {
    await db.update(questions).set({ isActive: false }).where(eq(questions.examId, examId));
    await expect(acts.iniciarIntento(cursoId)).rejects.toThrow(/no tiene preguntas/i);
  });

  it("dos llamadas concurrentes nunca truenan y devuelven el mismo intento", async () => {
    // No hay forma determinista de forzar la violación real de attempt_number_uq
    // desde fuera de la función (ambas llamadas leen `previos` de forma independiente
    // y Promise.all no garantiza que ambas lean antes de que la primera inserte).
    // Este test verifica la propiedad que sí podemos garantizar de forma determinista:
    // ninguna de las dos llamadas debe lanzar, y ambas deben converger al mismo
    // intento in_progress. Si el entorno llega a intercalarlas lo suficiente como
    // para chocar contra el unique constraint, este mismo test ejercita también la
    // ruta de recuperación (catch -> SELECT fuera de la tx) sin quedar marcado como
    // flaky en ningún caso: con o sin colisión real, la aserción final es la misma.
    const [a1, a2] = await Promise.all([
      acts.iniciarIntento(cursoId),
      acts.iniciarIntento(cursoId),
    ]);
    expect(a1).toBe(a2);

    const enCurso = await db
      .select()
      .from(examAttempts)
      .where(and(eq(examAttempts.enrollmentId, enrollmentId), eq(examAttempts.status, "in_progress")));
    expect(enCurso).toHaveLength(1);
  });
});

describe("getExamenDeCurso", () => {
  it("devuelve la configuración y el estado de elegibilidad", async () => {
    const previo = await qs.getExamenDeCurso(alumnoId, "curso-examen");
    expect(previo).not.toBeNull();
    expect(previo!.examTitle).toBe("Examen final");
    expect(previo!.passingScore).toBe(70);
    expect(previo!.totalPreguntas).toBe(3);
    expect(previo!.puedeIniciar).toBe(true);
    expect(previo!.intentoEnCurso).toBeNull();
    expect(previo!.intentos).toEqual([]);
  });

  it("expone el intento en curso", async () => {
    const attemptId = await acts.iniciarIntento(cursoId);
    const previo = await qs.getExamenDeCurso(alumnoId, "curso-examen");
    expect(previo!.intentoEnCurso).toBe(attemptId);
  });

  it("lista los intentos ya enviados con su nota", async () => {
    await db.insert(examAttempts).values({
      enrollmentId, attemptNumber: 1, status: "submitted",
      submittedAt: new Date(), score: "80.00", passed: true,
    });
    const previo = await qs.getExamenDeCurso(alumnoId, "curso-examen");
    expect(previo!.intentos).toHaveLength(1);
    expect(previo!.intentos[0].scorePct).toBe(80);
    expect(previo!.intentos[0].passed).toBe(true);
  });

  it("devuelve la hora de desbloqueo cuando está bloqueado", async () => {
    const hace1h = new Date(Date.now() - 3_600_000);
    for (let n = 1; n <= 3; n++) {
      await db.insert(examAttempts).values({
        enrollmentId, attemptNumber: n, status: "submitted",
        startedAt: hace1h, submittedAt: hace1h,
      });
    }
    const previo = await qs.getExamenDeCurso(alumnoId, "curso-examen");
    expect(previo!.puedeIniciar).toBe(false);
    expect(previo!.desbloqueaA).toBeInstanceOf(Date);
  });

  it("lanza ForbiddenError para quien no está inscrito", async () => {
    const { ForbiddenError } = await import("@/modules/auth/guards");
    await expect(qs.getExamenDeCurso(otroId, "curso-examen")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("devuelve null si el curso no existe", async () => {
    expect(await qs.getExamenDeCurso(alumnoId, "no-existe")).toBeNull();
  });

  it("devuelve null si el examen no está publicado", async () => {
    await db.update(exams).set({ isPublished: false }).where(eq(exams.id, examId));
    expect(await qs.getExamenDeCurso(alumnoId, "curso-examen")).toBeNull();
  });
});
