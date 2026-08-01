// Sin "use server" a propósito: lo invoca la acción enviarIntento y también el
// Server Component del intento cuando detecta que el tiempo venció. No es un endpoint.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, enrollments, questions, examAttempts, examAttemptQuestions, examAttemptAnswers } from "@/db/schema";
import { calcularNota } from "./service";
import { emitirCertificado } from "@/modules/certification/issuance";

export interface ResultadoCierre {
  scorePct: number;
  passed: boolean;
  yaEstaba: boolean;
}

/**
 * Califica y cierra el intento. Idempotente: si ya está enviado devuelve la nota
 * guardada sin recalcular ni tocar submittedAt.
 *
 * No comprueba permisos: el llamador ya verificó la propiedad del intento con
 * cargarIntentoPropio.
 */
export async function cerrarIntento(attemptId: string): Promise<ResultadoCierre> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, attemptId))
      .for("update")
      .limit(1);
    if (!attempt) throw new Error("Intento no encontrado.");

    if (attempt.status === "submitted") {
      return {
        scorePct: attempt.score === null ? 0 : Number(attempt.score),
        passed: attempt.passed ?? false,
        yaEstaba: true,
      };
    }

    const [exam] = await tx
      .select({ passingScore: exams.passingScore })
      .from(exams)
      .innerJoin(enrollments, eq(enrollments.courseId, exams.courseId))
      .where(eq(enrollments.id, attempt.enrollmentId))
      .limit(1);
    if (!exam) throw new Error("Examen no encontrado.");

    const preguntas = await tx
      .select({ id: questions.id, points: questions.points })
      .from(examAttemptQuestions)
      .innerJoin(questions, eq(questions.id, examAttemptQuestions.questionId))
      .where(eq(examAttemptQuestions.attemptId, attemptId))
      .orderBy(asc(examAttemptQuestions.orderIndex));

    const respuestas = await tx
      .select({
        questionId: examAttemptAnswers.questionId,
        isCorrect: examAttemptAnswers.isCorrect,
      })
      .from(examAttemptAnswers)
      .where(eq(examAttemptAnswers.attemptId, attemptId));

    const { scorePct, passed } = calcularNota(preguntas, respuestas, exam.passingScore);

    await tx
      .update(examAttempts)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        score: scorePct.toFixed(2),
        passed,
      })
      .where(eq(examAttempts.id, attemptId));

    if (passed) {
      await emitirCertificado(tx, attempt.enrollmentId, scorePct);
    }

    return { scorePct, passed, yaEstaba: false };
  });
}
