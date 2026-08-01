import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers,
} from "@/db/schema";

let profId: string;
let otroProfId: string;
let cursoId: string;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUser = { id: "", role: "instructor" };
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ ...currentUser, name: "Prof" })),
  assertRole: vi.fn(async () => ({ ...currentUser, name: "Prof" })),
}));

const acts = await import("@/modules/assessment/actions");
const qs = await import("@/modules/assessment/queries");

const CONFIG = {
  title: "Examen final",
  passingScore: 70,
  maxAttempts: 3,
  lockoutHours: 24,
  timeLimitMinutes: null,
  questionsPerAttempt: null,
  shuffleQuestions: true,
  shuffleOptions: true,
};

const PREGUNTA = {
  type: "mcq" as const,
  promptMd: "¿Qué hace BUSCARV?",
  explanationMd: "Busca un valor en la primera columna de un rango.",
  points: 2,
  options: [
    { text: "Busca en la primera columna", isCorrect: true },
    { text: "Suma un rango", isCorrect: false },
  ],
};

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

  profId = (await mk("Prof", "p@test.pe", "instructor")).id;
  otroProfId = (await mk("Otro", "o@test.pe", "instructor")).id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "curso-examen", title: "Curso Examen", priceCents: 100,
  }).returning();
  cursoId = c.id;

  currentUser = { id: profId, role: "instructor" };
});

describe("guardarExamen", () => {
  it("crea el examen del curso la primera vez", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    const rows = await db.select().from(exams).where(eq(exams.courseId, cursoId));
    expect(rows).toHaveLength(1);
    expect(rows[0].passingScore).toBe(70);
    expect(rows[0].isPublished).toBe(false);
  });

  it("actualiza en lugar de duplicar al guardar dos veces", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarExamen(cursoId, { ...CONFIG, passingScore: 80 });
    const rows = await db.select().from(exams).where(eq(exams.courseId, cursoId));
    expect(rows).toHaveLength(1);
    expect(rows[0].passingScore).toBe(80);
  });

  it("rechaza a un instructor que no es dueño del curso", async () => {
    currentUser = { id: otroProfId, role: "instructor" };
    await expect(acts.guardarExamen(cursoId, CONFIG)).rejects.toThrow(/no puedes gestionar/i);
  });

  it("rechaza una configuración inválida", async () => {
    await expect(acts.guardarExamen(cursoId, { ...CONFIG, passingScore: 0 })).rejects.toThrow();
  });
});

describe("guardarPregunta", () => {
  beforeEach(async () => {
    await acts.guardarExamen(cursoId, CONFIG);
  });

  it("crea la pregunta con sus opciones", async () => {
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    const [q] = await db.select().from(questions);
    expect(q.promptMd).toBe("¿Qué hace BUSCARV?");
    expect(q.points).toBe(2);
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
    expect(opts).toHaveLength(2);
    expect(opts.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  it("asigna orderIndex incremental", async () => {
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    await acts.guardarPregunta(cursoId, null, { ...PREGUNTA, promptMd: "Segunda pregunta" });
    const rows = await db.select().from(questions);
    expect(rows.map((r) => r.orderIndex).sort()).toEqual([0, 1]);
  });

  it("reemplaza las opciones al editar", async () => {
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    const [q] = await db.select().from(questions);

    await acts.guardarPregunta(cursoId, q.id, {
      ...PREGUNTA,
      promptMd: "Pregunta editada",
      options: [
        { text: "A", isCorrect: false },
        { text: "B", isCorrect: false },
        { text: "C", isCorrect: true },
      ],
    });

    const [editada] = await db.select().from(questions);
    expect(editada.promptMd).toBe("Pregunta editada");
    const opts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
    expect(opts).toHaveLength(3);
    expect(opts.find((o) => o.isCorrect)?.text).toBe("C");
  });

  it("rechaza dos opciones correctas", async () => {
    await expect(
      acts.guardarPregunta(cursoId, null, {
        ...PREGUNTA,
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      })
    ).rejects.toThrow();
  });

  it("rechaza editar mientras hay un intento en curso", async () => {
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    const [q] = await db.select().from(questions);

    const [alumno] = await db.insert(user).values({
      id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
    }).returning();
    const [e] = await db.insert(enrollments).values({
      userId: alumno.id, courseId: cursoId, status: "active",
    }).returning();
    await db.insert(examAttempts).values({
      enrollmentId: e.id, attemptNumber: 1, status: "in_progress",
    });

    await expect(
      acts.guardarPregunta(cursoId, q.id, { ...PREGUNTA, promptMd: "No debería entrar" })
    ).rejects.toThrow(/intento en curso/i);
  });
});

describe("eliminarPregunta", () => {
  it("borra la pregunta y sus opciones", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    const [q] = await db.select().from(questions);

    await acts.eliminarPregunta(cursoId, q.id);

    expect(await db.select().from(questions)).toHaveLength(0);
    expect(await db.select().from(questionOptions)).toHaveLength(0);
  });

  it("rechaza borrar una pregunta de otro curso", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    const [q] = await db.select().from(questions);

    const [otroCurso] = await db.insert(courses).values({
      instructorId: profId, slug: "otro-curso", title: "Otro", priceCents: 100,
    }).returning();

    await expect(acts.eliminarPregunta(otroCurso.id, q.id)).rejects.toThrow(/no pertenece/i);
  });
});

describe("publicarExamen", () => {
  it("publica cuando hay preguntas", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    await acts.publicarExamen(cursoId);
    const [ex] = await db.select().from(exams);
    expect(ex.isPublished).toBe(true);
  });

  it("rechaza publicar un examen sin preguntas", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await expect(acts.publicarExamen(cursoId)).rejects.toThrow(/al menos una pregunta/i);
  });

  it("rechaza publicar si pide más preguntas por intento de las que hay", async () => {
    await acts.guardarExamen(cursoId, { ...CONFIG, questionsPerAttempt: 5 });
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    await expect(acts.publicarExamen(cursoId)).rejects.toThrow(/solo tiene 1/i);
  });

  it("despublicar lo devuelve a borrador", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarPregunta(cursoId, null, PREGUNTA);
    await acts.publicarExamen(cursoId);
    await acts.despublicarExamen(cursoId);
    const [ex] = await db.select().from(exams);
    expect(ex.isPublished).toBe(false);
  });
});

describe("getBancoPreguntas", () => {
  it("devuelve el examen con preguntas y opciones, incluida la correcta", async () => {
    await acts.guardarExamen(cursoId, CONFIG);
    await acts.guardarPregunta(cursoId, null, PREGUNTA);

    const banco = await qs.getBancoPreguntas(profId, cursoId);
    expect(banco).not.toBeNull();
    expect(banco!.examen!.title).toBe("Examen final");
    expect(banco!.preguntas).toHaveLength(1);
    expect(banco!.preguntas[0].opciones.find((o) => o.isCorrect)?.text)
      .toBe("Busca en la primera columna");
  });

  it("devuelve el curso sin examen todavía", async () => {
    const banco = await qs.getBancoPreguntas(profId, cursoId);
    expect(banco).not.toBeNull();
    expect(banco!.examen).toBeNull();
    expect(banco!.preguntas).toEqual([]);
  });

  it("devuelve null para quien no puede gestionar el curso", async () => {
    expect(await qs.getBancoPreguntas(otroProfId, cursoId)).toBeNull();
  });

  it("devuelve null para un curso inexistente", async () => {
    expect(await qs.getBancoPreguntas(profId, crypto.randomUUID())).toBeNull();
  });
});
