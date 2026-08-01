import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courses, exams, questions, questionOptions, user } from "@/db/schema";
import { canManageCourse, type Role } from "@/modules/auth/guards";

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
