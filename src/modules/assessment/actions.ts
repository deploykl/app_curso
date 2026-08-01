"use server";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  courses, enrollments, exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers,
} from "@/db/schema";
import { assertRole, requireUser } from "@/modules/auth/session";
import { assertEnrolled, canManageCourse, ForbiddenError, type Role } from "@/modules/auth/guards";
import { formatLima } from "@/lib/datetime";
import {
  barajarConSemilla, calcularNota, canPublishExam,
  evaluarElegibilidad, examSettingsSchema, questionInputSchema,
} from "./service";
import { cargarIntentoPropio } from "./queries";

/** Carga el curso comprobando que quien llama puede gestionarlo. */
async function loadOwnedCourse(userId: string, role: string, courseId: string) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new ForbiddenError("Curso no encontrado.");
  if (!canManageCourse(userId, role as Role, c.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return c;
}

async function loadExam(courseId: string) {
  const [ex] = await db.select().from(exams).where(eq(exams.courseId, courseId)).limit(1);
  if (!ex) throw new Error("Este curso todavía no tiene un examen configurado.");
  return ex;
}

/** Editar el banco con un intento vivo cambiaría el examen bajo los pies del alumno. */
async function assertSinIntentosEnCurso(courseId: string) {
  const rows = await db
    .select({ id: examAttempts.id })
    .from(examAttempts)
    .innerJoin(enrollments, eq(enrollments.id, examAttempts.enrollmentId))
    .where(and(eq(enrollments.courseId, courseId), eq(examAttempts.status, "in_progress")))
    .limit(1);
  if (rows.length > 0) {
    throw new Error("Hay un intento en curso: espera a que termine para editar el examen.");
  }
}

export async function guardarExamen(courseId: string, raw: unknown): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwnedCourse(u.id, u.role as string, courseId);
  const input = examSettingsSchema.parse(raw);

  await db
    .insert(exams)
    .values({ courseId, ...input })
    .onConflictDoUpdate({ target: exams.courseId, set: { ...input } });

  revalidatePath(`/instructor/cursos/${courseId}/examen`);
}

export async function guardarPregunta(
  courseId: string,
  questionId: string | null,
  raw: unknown
): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwnedCourse(u.id, u.role as string, courseId);
  const exam = await loadExam(courseId);
  await assertSinIntentosEnCurso(courseId);
  const input = questionInputSchema.parse(raw);

  await db.transaction(async (tx) => {
    let id = questionId;

    if (id) {
      const [existing] = await tx
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.id, id), eq(questions.examId, exam.id)))
        .limit(1);
      if (!existing) throw new Error("Esa pregunta no pertenece a este examen.");

      await tx
        .update(questions)
        .set({
          type: input.type,
          promptMd: input.promptMd,
          explanationMd: input.explanationMd,
          points: input.points,
        })
        .where(eq(questions.id, id));
      await tx.delete(questionOptions).where(eq(questionOptions.questionId, id));
    } else {
      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(questions)
        .where(eq(questions.examId, exam.id));

      const [created] = await tx
        .insert(questions)
        .values({
          examId: exam.id,
          type: input.type,
          promptMd: input.promptMd,
          explanationMd: input.explanationMd,
          points: input.points,
          orderIndex: Number(total),
        })
        .returning({ id: questions.id });
      id = created.id;
    }

    await tx.insert(questionOptions).values(
      input.options.map((o, i) => ({
        questionId: id!,
        text: o.text,
        isCorrect: o.isCorrect,
        orderIndex: i,
      }))
    );
  });

  revalidatePath(`/instructor/cursos/${courseId}/examen`);
}

export async function eliminarPregunta(courseId: string, questionId: string): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwnedCourse(u.id, u.role as string, courseId);

  // No usamos loadExam aquí: si el curso no tiene examen (o la pregunta es de
  // otro examen) es igualmente "no pertenece", no "examen no configurado".
  const [row] = await db
    .select({ id: questions.id, examCourseId: exams.courseId })
    .from(questions)
    .innerJoin(exams, eq(exams.id, questions.examId))
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!row || row.examCourseId !== courseId) {
    throw new Error("Esa pregunta no pertenece a este examen.");
  }

  await assertSinIntentosEnCurso(courseId);

  // question_options tiene ON DELETE CASCADE sobre question_id.
  await db.delete(questions).where(eq(questions.id, questionId));

  revalidatePath(`/instructor/cursos/${courseId}/examen`);
}

export async function publicarExamen(courseId: string): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwnedCourse(u.id, u.role as string, courseId);
  const exam = await loadExam(courseId);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(questions)
    .where(and(eq(questions.examId, exam.id), eq(questions.isActive, true)));

  const check = canPublishExam({
    questionCount: Number(total),
    questionsPerAttempt: exam.questionsPerAttempt,
  });
  if (!check.ok) throw new Error(check.reason);

  await db.update(exams).set({ isPublished: true }).where(eq(exams.id, exam.id));
  revalidatePath(`/instructor/cursos/${courseId}/examen`);
}

export async function despublicarExamen(courseId: string): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwnedCourse(u.id, u.role as string, courseId);
  const exam = await loadExam(courseId);

  await db.update(exams).set({ isPublished: false }).where(eq(exams.id, exam.id));
  revalidatePath(`/instructor/cursos/${courseId}/examen`);
}

export async function iniciarIntento(courseId: string): Promise<string> {
  const u = await requireUser();
  await assertEnrolled(u.id, courseId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, u.id),
      eq(enrollments.courseId, courseId),
      eq(enrollments.status, "active"),
    ))
    .limit(1);
  if (!enrollment) throw new Error("Inscripción no encontrada.");

  const [exam] = await db.select().from(exams).where(eq(exams.courseId, courseId)).limit(1);
  if (!exam || !exam.isPublished) {
    throw new Error("Este curso todavía no tiene un examen publicado.");
  }

  const previos = await db
    .select({ id: examAttempts.id, attemptNumber: examAttempts.attemptNumber,
              startedAt: examAttempts.startedAt, status: examAttempts.status })
    .from(examAttempts)
    .where(eq(examAttempts.enrollmentId, enrollment.id))
    .orderBy(desc(examAttempts.startedAt));

  // Invariante: un intento in_progress no genera otro.
  const enCurso = previos.find((p) => p.status === "in_progress");
  if (enCurso) return enCurso.id;

  const eleg = evaluarElegibilidad({
    intentosUsados: previos.length,
    maxAttempts: exam.maxAttempts,
    ultimoIntentoAt: previos[0]?.startedAt ?? null,
    lockoutHours: exam.lockoutHours,
  });
  if (!eleg.puedeIniciar) {
    throw new Error(
      `Agotaste tus intentos. Podrás volver a intentarlo el ${formatLima(eleg.desbloqueaA!)}.`
    );
  }

  const banco = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.examId, exam.id), eq(questions.isActive, true)))
    .orderBy(asc(questions.orderIndex));
  if (banco.length === 0) throw new Error("El examen no tiene preguntas.");

  const attemptNumber = previos.reduce((max, p) => Math.max(max, p.attemptNumber), 0) + 1;
  const ordenadas = exam.shuffleQuestions
    ? barajarConSemilla(banco, `${enrollment.id}:${attemptNumber}`)
    : banco;
  const elegidas = exam.questionsPerAttempt
    ? ordenadas.slice(0, exam.questionsPerAttempt)
    : ordenadas;

  const expiresAt = exam.timeLimitMinutes
    ? new Date(Date.now() + exam.timeLimitMinutes * 60_000)
    : null;

  const attemptId = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(examAttempts)
      .values({ enrollmentId: enrollment.id, attemptNumber, expiresAt, status: "in_progress" })
      .returning({ id: examAttempts.id });

    await tx.insert(examAttemptQuestions).values(
      elegidas.map((q, i) => ({ attemptId: a.id, questionId: q.id, orderIndex: i }))
    );
    return a.id;
  });

  const [course] = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  revalidatePath(`/curso/${course.slug}/examen`);

  return attemptId;
}

export async function responder(
  attemptId: string,
  questionId: string,
  optionId: string
): Promise<void> {
  const u = await requireUser();
  const ctx = await cargarIntentoPropio(u.id, attemptId);
  if (!ctx) throw new Error("Intento no encontrado.");
  if (ctx.status !== "in_progress") throw new Error("Este intento ya fue enviado.");
  if (ctx.expiresAt && Date.now() > ctx.expiresAt.getTime()) {
    throw new Error("El tiempo del examen terminó.");
  }

  const [enElIntento] = await db
    .select({ questionId: examAttemptQuestions.questionId })
    .from(examAttemptQuestions)
    .where(and(
      eq(examAttemptQuestions.attemptId, attemptId),
      eq(examAttemptQuestions.questionId, questionId),
    ))
    .limit(1);
  if (!enElIntento) throw new Error("Esa pregunta no pertenece a este intento.");

  const [opcion] = await db
    .select({ id: questionOptions.id, isCorrect: questionOptions.isCorrect })
    .from(questionOptions)
    .where(and(eq(questionOptions.id, optionId), eq(questionOptions.questionId, questionId)))
    .limit(1);
  if (!opcion) throw new Error("Opción inválida.");

  await db
    .insert(examAttemptAnswers)
    .values({
      attemptId,
      questionId,
      selectedOptionId: optionId,
      isCorrect: opcion.isCorrect,
    })
    .onConflictDoUpdate({
      target: [examAttemptAnswers.attemptId, examAttemptAnswers.questionId],
      set: { selectedOptionId: optionId, isCorrect: opcion.isCorrect, answeredAt: new Date() },
    });

  // Sin revalidatePath a propósito: revalidar re-renderizaría el examen a mitad.
  // Y sin valor de retorno: isCorrect no viaja al cliente.
}
