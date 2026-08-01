import { z } from "zod";

// ---------------------------------------------------------------- calificación

export interface PreguntaCalificable {
  id: string;
  points: number;
}

export interface RespuestaCalificable {
  questionId: string;
  isCorrect: boolean;
}

/**
 * Σ puntos de las preguntas acertadas / Σ puntos del intento × 100.
 * `isCorrect` viene ya persistido por `responder`: aquí no se vuelve a comparar
 * contra la opción correcta, solo se suma.
 */
export function calcularNota(
  preguntas: PreguntaCalificable[],
  respuestas: RespuestaCalificable[],
  passingScore: number
): { scorePct: number; passed: boolean } {
  const puntosTotales = preguntas.reduce((acc, p) => acc + p.points, 0);
  if (puntosTotales <= 0) return { scorePct: 0, passed: false };

  const acertadas = new Set(respuestas.filter((r) => r.isCorrect).map((r) => r.questionId));
  const puntosObtenidos = preguntas
    .filter((p) => acertadas.has(p.id))
    .reduce((acc, p) => acc + p.points, 0);

  const scorePct = Math.round((puntosObtenidos / puntosTotales) * 10000) / 100;
  return { scorePct, passed: scorePct >= passingScore };
}

// ------------------------------------------------------------------- barajado

/** FNV-1a de 32 bits. Convierte la semilla de texto en un entero sin signo. */
function hashSemilla(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG mulberry32: determinista, suficiente para barajar un examen. */
function mulberry32(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates alimentado por una semilla. La misma semilla da siempre el mismo orden. */
export function barajarConSemilla<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSemilla(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Semilla del orden de opciones. No se persiste: se deriva del intento y la
 * pregunta, así recargar la página no re-baraja.
 */
export function semillaOpciones(attemptId: string, questionId: string): string {
  return `${attemptId}:${questionId}`;
}

// ---------------------------------------------------------------- elegibilidad

export interface ElegibilidadInput {
  intentosUsados: number;
  maxAttempts: number;
  ultimoIntentoAt: Date | null;
  lockoutHours: number;
  ahora?: Date;
}

export interface Elegibilidad {
  puedeIniciar: boolean;
  desbloqueaA: Date | null;
}

/**
 * Regla del spec §6.6: si los intentos usados alcanzan el máximo y el último fue
 * hace menos de `lockoutHours`, se bloquea hasta esa hora exacta. Pasado el
 * bloqueo se concede otro intento (y el bloqueo vuelve a aplicar tras él).
 */
export function evaluarElegibilidad(input: ElegibilidadInput): Elegibilidad {
  const { intentosUsados, maxAttempts, ultimoIntentoAt, lockoutHours } = input;
  const ahora = input.ahora ?? new Date();

  if (intentosUsados < maxAttempts) return { puedeIniciar: true, desbloqueaA: null };
  if (!ultimoIntentoAt) return { puedeIniciar: true, desbloqueaA: null };

  const desbloqueaA = new Date(ultimoIntentoAt.getTime() + lockoutHours * 3_600_000);
  if (ahora.getTime() >= desbloqueaA.getTime()) return { puedeIniciar: true, desbloqueaA: null };

  return { puedeIniciar: false, desbloqueaA };
}

// --------------------------------------------------------------------- entrada

export const examSettingsSchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres.").max(160, "El título es demasiado largo."),
  passingScore: z.number().int().min(1, "La nota de aprobación debe ser mayor a 0.").max(100, "La nota de aprobación no puede superar 100."),
  maxAttempts: z.number().int().min(1, "Debe permitir al menos 1 intento.").max(10, "No puede permitir más de 10 intentos."),
  lockoutHours: z.number().int().min(0, "Las horas de bloqueo no pueden ser negativas.").max(168, "Las horas de bloqueo no pueden superar 168."),
  timeLimitMinutes: z.number().int().min(1, "El límite de tiempo debe ser de al menos 1 minuto.").max(480, "El límite de tiempo no puede superar 480 minutos.").nullable(),
  questionsPerAttempt: z.number().int().min(1, "Debe pedir al menos 1 pregunta por intento.").max(200, "No puede pedir más de 200 preguntas por intento.").nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
});
export type ExamSettingsInput = z.infer<typeof examSettingsSchema>;

export const questionInputSchema = z
  .object({
    type: z.enum(["mcq", "true_false"]),
    promptMd: z.string().min(3, "El enunciado debe tener al menos 3 caracteres."),
    explanationMd: z.string().nullable(),
    points: z.number().int().min(1, "La pregunta debe valer al menos 1 punto.").max(100, "La pregunta no puede valer más de 100 puntos."),
    options: z
      .array(z.object({ text: z.string().min(1, "El texto de la opción no puede estar vacío."), isCorrect: z.boolean() }))
      .min(2, "Debe haber al menos 2 opciones.")
      .max(8, "No puede haber más de 8 opciones."),
  })
  .refine((q) => q.options.filter((o) => o.isCorrect).length === 1, {
    message: "Cada pregunta debe tener exactamente una opción correcta.",
    path: ["options"],
  })
  .refine((q) => q.type !== "true_false" || q.options.length === 2, {
    message: "Una pregunta de verdadero/falso debe tener exactamente dos opciones.",
    path: ["options"],
  });
export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Un examen no se publica vacío ni pidiendo más preguntas de las que tiene. */
export function canPublishExam(input: {
  questionCount: number;
  questionsPerAttempt: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.questionCount === 0) {
    return { ok: false, reason: "Agrega al menos una pregunta antes de publicar el examen." };
  }
  if (input.questionsPerAttempt !== null && input.questionsPerAttempt > input.questionCount) {
    return {
      ok: false,
      reason: `El examen pide ${input.questionsPerAttempt} preguntas por intento pero solo tiene ${input.questionCount}.`,
    };
  }
  return { ok: true };
}
