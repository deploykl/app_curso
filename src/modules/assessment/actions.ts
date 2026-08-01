"use server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  courses, enrollments, exams, questions, questionOptions, examAttempts,
} from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError, type Role } from "@/modules/auth/guards";
import { examSettingsSchema, questionInputSchema, canPublishExam } from "./service";

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
