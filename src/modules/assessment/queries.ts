import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  courses, enrollments, exams, questions, questionOptions, examAttempts, user,
  examAttemptQuestions, examAttemptAnswers,
} from "@/db/schema";
import { assertEnrolled, canManageCourse, type Role } from "@/modules/auth/guards";
import { barajarConSemilla, evaluarElegibilidad, semillaOpciones } from "./service";

export interface OpcionDelBanco {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface PreguntaDelBanco {
  id: string;
  type: "mcq" | "true_false";
  promptMd: string;
  explanationMd: string | null;
  points: number;
  orderIndex: number;
  isActive: boolean;
  opciones: OpcionDelBanco[];
}

export interface BancoPreguntas {
  courseId: string;
  courseTitle: string;
  examen: {
    id: string;
    title: string;
    passingScore: number;
    maxAttempts: number;
    lockoutHours: number;
    timeLimitMinutes: number | null;
    questionsPerAttempt: number | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    isPublished: boolean;
  } | null;
  preguntas: PreguntaDelBanco[];
}

/** Vista del instructor. Devuelve null si el curso no existe o no lo gestiona. */
export async function getBancoPreguntas(
  userId: string,
  courseId: string
): Promise<BancoPreguntas | null> {
  const [course] = await db
    .select({ id: courses.id, title: courses.title, instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course) return null;

  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
  if (!u) return null;
  if (!canManageCourse(userId, (u.role ?? "student") as Role, course.instructorId)) return null;

  const [examen] = await db.select().from(exams).where(eq(exams.courseId, courseId)).limit(1);
  if (!examen) {
    return { courseId: course.id, courseTitle: course.title, examen: null, preguntas: [] };
  }

  const rawQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examen.id))
    .orderBy(asc(questions.orderIndex));

  // Una sola consulta para todas las opciones, filtrada por las preguntas de este examen.
  const questionIds = rawQuestions.map((q) => q.id);
  const todasLasOpciones = questionIds.length
    ? await db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, questionIds))
        .orderBy(asc(questionOptions.orderIndex))
    : [];

  const porPregunta = new Map<string, OpcionDelBanco[]>();
  for (const o of todasLasOpciones) {
    const lista = porPregunta.get(o.questionId) ?? [];
    lista.push({ id: o.id, text: o.text, isCorrect: o.isCorrect, orderIndex: o.orderIndex });
    porPregunta.set(o.questionId, lista);
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    examen: {
      id: examen.id,
      title: examen.title,
      passingScore: examen.passingScore,
      maxAttempts: examen.maxAttempts,
      lockoutHours: examen.lockoutHours,
      timeLimitMinutes: examen.timeLimitMinutes,
      questionsPerAttempt: examen.questionsPerAttempt,
      shuffleQuestions: examen.shuffleQuestions,
      shuffleOptions: examen.shuffleOptions,
      isPublished: examen.isPublished,
    },
    preguntas: rawQuestions.map((q) => ({
      id: q.id,
      type: q.type,
      promptMd: q.promptMd,
      explanationMd: q.explanationMd,
      points: q.points,
      orderIndex: q.orderIndex,
      isActive: q.isActive,
      opciones: porPregunta.get(q.id) ?? [],
    })),
  };
}

export interface IntentoResumen {
  id: string;
  attemptNumber: number;
  submittedAt: Date | null;
  scorePct: number | null;
  passed: boolean | null;
}

export interface ExamenPrevio {
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  examTitle: string;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  totalPreguntas: number;
  intentoEnCurso: string | null;
  intentos: IntentoResumen[];
  puedeIniciar: boolean;
  desbloqueaA: Date | null;
}

/**
 * Pantalla previa del alumno. Devuelve null si el curso no existe o el examen no
 * está publicado; lanza ForbiddenError si el usuario no está inscrito.
 */
export async function getExamenDeCurso(
  userId: string,
  slug: string
): Promise<ExamenPrevio | null> {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
    .from(courses)
    .where(eq(courses.slug, slug))
    .limit(1);
  if (!course) return null;

  await assertEnrolled(userId, course.id);

  const [exam] = await db.select().from(exams).where(eq(exams.courseId, course.id)).limit(1);
  if (!exam || !exam.isPublished) return null;

  const [{ value: totalPreguntas }] = await db
    .select({ value: count() })
    .from(questions)
    .where(and(eq(questions.examId, exam.id), eq(questions.isActive, true)));

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, userId),
      eq(enrollments.courseId, course.id),
      eq(enrollments.status, "active"),
    ))
    .limit(1);
  if (!enrollment) return null;

  const attempts = await db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.enrollmentId, enrollment.id))
    .orderBy(desc(examAttempts.startedAt));

  const enCurso = attempts.find((a) => a.status === "in_progress") ?? null;
  const eleg = evaluarElegibilidad({
    intentosUsados: attempts.length,
    maxAttempts: exam.maxAttempts,
    ultimoIntentoAt: attempts[0]?.startedAt ?? null,
    lockoutHours: exam.lockoutHours,
  });

  return {
    courseId: course.id,
    courseSlug: course.slug,
    courseTitle: course.title,
    examTitle: exam.title,
    passingScore: exam.passingScore,
    maxAttempts: exam.maxAttempts,
    timeLimitMinutes: exam.timeLimitMinutes,
    totalPreguntas: Number(totalPreguntas),
    intentoEnCurso: enCurso?.id ?? null,
    intentos: attempts
      .filter((a) => a.status === "submitted")
      .map((a) => ({
        id: a.id,
        attemptNumber: a.attemptNumber,
        submittedAt: a.submittedAt,
        scorePct: a.score === null ? null : Number(a.score),
        passed: a.passed,
      })),
    puedeIniciar: enCurso !== null || eleg.puedeIniciar,
    desbloqueaA: eleg.desbloqueaA,
  };
}

export interface ContextoIntento {
  attemptId: string;
  enrollmentId: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  examId: string;
  examTitle: string;
  passingScore: number;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date | null;
  score: string | null;
  passed: boolean | null;
}

/**
 * Carga el intento comprobando que pertenece al usuario. Devuelve null si no existe
 * o es de otra persona: quien pregunta no debe poder distinguir ambos casos.
 */
export async function cargarIntentoPropio(
  userId: string,
  attemptId: string
): Promise<ContextoIntento | null> {
  const [row] = await db
    .select({
      attemptId: examAttempts.id,
      enrollmentId: examAttempts.enrollmentId,
      status: examAttempts.status,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      expiresAt: examAttempts.expiresAt,
      score: examAttempts.score,
      passed: examAttempts.passed,
      userId: enrollments.userId,
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      examId: exams.id,
      examTitle: exams.title,
      passingScore: exams.passingScore,
    })
    .from(examAttempts)
    .innerJoin(enrollments, eq(enrollments.id, examAttempts.enrollmentId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(exams, eq(exams.courseId, courses.id))
    .where(eq(examAttempts.id, attemptId))
    .limit(1);

  if (!row || row.userId !== userId) return null;

  await assertEnrolled(userId, row.courseId);

  const { userId: _descartado, ...ctx } = row;
  return ctx;
}

export interface OpcionParaResolver {
  id: string;
  text: string;
}

export interface PreguntaParaResolver {
  id: string;
  numero: number;
  type: "mcq" | "true_false";
  promptMd: string;
  points: number;
  opciones: OpcionParaResolver[];
  seleccionadaId: string | null;
}

export interface IntentoParaResolver {
  attemptId: string;
  courseSlug: string;
  courseTitle: string;
  examTitle: string;
  expiresAt: Date | null;
  vencido: boolean;
  preguntas: PreguntaParaResolver[];
}

/**
 * Vista del intento en curso. NO selecciona questionOptions.isCorrect ni
 * questions.explanationMd: no se filtran después, no se leen.
 */
export async function getIntentoParaResolver(
  userId: string,
  attemptId: string
): Promise<IntentoParaResolver | null> {
  const ctx = await cargarIntentoPropio(userId, attemptId);
  if (!ctx) return null;

  const [exam] = await db
    .select({ shuffleOptions: exams.shuffleOptions })
    .from(exams)
    .where(eq(exams.id, ctx.examId))
    .limit(1);

  const filas = await db
    .select({
      id: questions.id,
      type: questions.type,
      promptMd: questions.promptMd,
      points: questions.points,
      orderIndex: examAttemptQuestions.orderIndex,
    })
    .from(examAttemptQuestions)
    .innerJoin(questions, eq(questions.id, examAttemptQuestions.questionId))
    .where(eq(examAttemptQuestions.attemptId, attemptId))
    .orderBy(asc(examAttemptQuestions.orderIndex));

  const questionIds = filas.map((f) => f.id);

  const opciones = questionIds.length
    ? await db
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          text: questionOptions.text,
          orderIndex: questionOptions.orderIndex,
        })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, questionIds))
        .orderBy(asc(questionOptions.orderIndex))
    : [];

  const respuestas = questionIds.length
    ? await db
        .select({
          questionId: examAttemptAnswers.questionId,
          selectedOptionId: examAttemptAnswers.selectedOptionId,
        })
        .from(examAttemptAnswers)
        .where(eq(examAttemptAnswers.attemptId, attemptId))
    : [];
  const seleccionadas = new Map(respuestas.map((r) => [r.questionId, r.selectedOptionId]));

  const porPregunta = new Map<string, OpcionParaResolver[]>();
  for (const o of opciones) {
    const lista = porPregunta.get(o.questionId) ?? [];
    lista.push({ id: o.id, text: o.text });
    porPregunta.set(o.questionId, lista);
  }

  return {
    attemptId: ctx.attemptId,
    courseSlug: ctx.courseSlug,
    courseTitle: ctx.courseTitle,
    examTitle: ctx.examTitle,
    expiresAt: ctx.expiresAt,
    vencido: ctx.expiresAt !== null && Date.now() > ctx.expiresAt.getTime(),
    preguntas: filas.map((f, i) => {
      const suyas = porPregunta.get(f.id) ?? [];
      return {
        id: f.id,
        numero: i + 1,
        type: f.type,
        promptMd: f.promptMd,
        points: f.points,
        opciones: exam?.shuffleOptions
          ? barajarConSemilla(suyas, semillaOpciones(attemptId, f.id))
          : suyas,
        seleccionadaId: seleccionadas.get(f.id) ?? null,
      };
    }),
  };
}
