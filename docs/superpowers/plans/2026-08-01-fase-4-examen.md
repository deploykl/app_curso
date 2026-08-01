# Fase 4 — Examen · plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El instructor arma un banco de preguntas por curso y el alumno rinde el examen con barajado congelado, guardado incremental, límite de tiempo con auto-envío y pantalla de resultados.

**Architecture:** Módulo nuevo `src/modules/assessment/` con la separación de siempre — `service.ts` puro (sin `next/*` ni base de datos), `queries.ts` para lecturas, `grading.ts` para la transacción de calificación (sin `"use server"`, igual que `learning/jobs.ts`), `actions.ts` para las mutaciones. Las tablas ya existen y están migradas: **esta fase no genera migraciones**.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Drizzle ORM sobre Postgres nativo, Zod v4, Tailwind v4 + shadcn/ui, Vitest (unitario e integración contra Postgres real), Playwright.

## Global Constraints

- **Todo el texto de la interfaz va en español de Perú.** Mensajes de error incluidos.
- **Ninguna función exportada de un módulo `"use server"` recibe `userId` como parámetro.** Se resuelve dentro con `requireUser()` o `assertRole()`. Todo export de un módulo `"use server"` es un endpoint público sin autenticar.
- **`service.ts` no importa nada de `next/*` ni de `@/db`.** Se testea con Vitest sin servidor ni navegador.
- **`grading.ts` NO lleva `"use server"`.** Igual que `src/modules/learning/jobs.ts`: es lógica invocada desde una acción y desde un Server Component, no un endpoint.
- **`assertEnrolled(userId, courseId)` gatea toda entrada de alumno**, incluidas las acciones, no solo las páginas.
- **`is_correct` y `explanation_md` no se seleccionan en las consultas del intento en curso.** No se filtran después: no se leen.
- **El tiempo lo manda el servidor.** El cronómetro del cliente es cosmético.
- **Un `attemptId` que no pertenece al usuario responde `notFound()`**, no 403: no se confirma su existencia.
- Zona horaria de presentación: `America/Lima` vía `formatLima` de `@/lib/datetime`.
- Formato de commits: `tipo(ámbito): descripción en inglés, imperativo`.

## Estructura de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `src/modules/assessment/service.ts` | Nota, barajado determinista, elegibilidad, esquemas Zod. Puro. | 1 |
| `tests/unit/assessment-service.test.ts` | Tests del anterior. | 1 |
| `src/modules/assessment/queries.ts` | `getBancoPreguntas`, `getExamenDeCurso`, `getIntentoParaResolver`, `getResultado`. | 2, 4, 5, 6 |
| `src/modules/assessment/actions.ts` | CRUD del instructor + `iniciarIntento`, `responder`, `enviarIntento`. | 2, 4, 5, 6 |
| `src/modules/assessment/grading.ts` | `cerrarIntento(attemptId)`: transacción de calificación. Sin `"use server"`. | 6 |
| `src/modules/assessment/ui/*.tsx` | Formularios del instructor y pantalla del intento. | 3, 7 |
| `src/app/(instructor)/instructor/cursos/[id]/examen/page.tsx` | Panel del examen. | 3 |
| `src/app/(student)/curso/[slug]/examen/page.tsx` | Pantalla previa del alumno. | 7 |
| `src/app/(student)/curso/[slug]/examen/[attemptId]/page.tsx` | Resolver el intento. | 7 |
| `src/app/(student)/curso/[slug]/examen/[attemptId]/resultado/page.tsx` | Resultados. | 7 |
| `tests/integration/assessment-*.test.ts` | Instructor, inicio, respuesta, envío. | 2, 4, 5, 6 |
| `tests/e2e/examen.spec.ts` | Recorrido instructor → alumno. | 8 |

## Tablas existentes (referencia, ya migradas)

`exams(id, courseId UNIQUE, title, passingScore, maxAttempts, lockoutHours, timeLimitMinutes, questionsPerAttempt, shuffleQuestions, shuffleOptions, isPublished)` ·
`questions(id, examId, type, promptMd, explanationMd, points, orderIndex, isActive)` ·
`questionOptions(id, questionId, text, isCorrect, orderIndex)` ·
`examAttempts(id, enrollmentId, attemptNumber, startedAt, submittedAt, expiresAt, score, passed, status)` con `UNIQUE(enrollmentId, attemptNumber)` ·
`examAttemptQuestions(attemptId, questionId, orderIndex)` con `UNIQUE(attemptId, questionId)` ·
`examAttemptAnswers(id, attemptId, questionId, selectedOptionId, isCorrect, answeredAt)` con `UNIQUE(attemptId, questionId)`.

**Orden de borrado en los tests** (respeta las FK): `examAttemptAnswers` → `examAttemptQuestions` → `examAttempts` → `questionOptions` → `questions` → `exams` → `sessionAttendance` → `enrollments` → `classSessions` → `courses` → `user`.

---

### Task 1: Lógica pura del examen (`service.ts`)

**Files:**
- Create: `src/modules/assessment/service.ts`
- Test: `tests/unit/assessment-service.test.ts`

**Interfaces:**
- Consumes: nada. Es la base de la fase.
- Produces:
  - `calcularNota(preguntas: PreguntaCalificable[], respuestas: RespuestaCalificable[], passingScore: number): { scorePct: number; passed: boolean }`
  - `barajarConSemilla<T>(items: T[], seed: string): T[]`
  - `semillaOpciones(attemptId: string, questionId: string): string`
  - `evaluarElegibilidad(input: ElegibilidadInput): Elegibilidad`
  - `examSettingsSchema`, `questionInputSchema` (Zod)
  - Tipos `PreguntaCalificable { id: string; points: number }`, `RespuestaCalificable { questionId: string; isCorrect: boolean }`, `ElegibilidadInput`, `Elegibilidad`

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/assessment-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  calcularNota,
  barajarConSemilla,
  semillaOpciones,
  evaluarElegibilidad,
  examSettingsSchema,
  questionInputSchema,
} from "@/modules/assessment/service";

describe("calcularNota", () => {
  const preguntas = [
    { id: "a", points: 1 },
    { id: "b", points: 3 },
    { id: "c", points: 1 },
  ];

  it("pondera por puntos, no por cantidad de preguntas", () => {
    // Acierta solo "b": 3 de 5 puntos = 60%.
    const r = calcularNota(preguntas, [{ questionId: "b", isCorrect: true }], 70);
    expect(r.scorePct).toBe(60);
    expect(r.passed).toBe(false);
  });

  it("aprueba exactamente en el umbral", () => {
    // 70 de 100 puntos.
    const p = [{ id: "x", points: 70 }, { id: "y", points: 30 }];
    const r = calcularNota(p, [{ questionId: "x", isCorrect: true }], 70);
    expect(r.scorePct).toBe(70);
    expect(r.passed).toBe(true);
  });

  it("no aprueba justo debajo del umbral", () => {
    const p = [{ id: "x", points: 6999 }, { id: "y", points: 3001 }];
    const r = calcularNota(p, [{ questionId: "x", isCorrect: true }], 70);
    expect(r.scorePct).toBe(69.99);
    expect(r.passed).toBe(false);
  });

  it("ignora respuestas de preguntas que no están en el intento", () => {
    const r = calcularNota(preguntas, [{ questionId: "zzz", isCorrect: true }], 70);
    expect(r.scorePct).toBe(0);
  });

  it("ignora respuestas incorrectas", () => {
    const r = calcularNota(preguntas, [{ questionId: "b", isCorrect: false }], 70);
    expect(r.scorePct).toBe(0);
  });

  it("devuelve 0 y no aprueba si el total de puntos es 0", () => {
    expect(calcularNota([], [], 70)).toEqual({ scorePct: 0, passed: false });
  });

  it("redondea a dos decimales", () => {
    const p = [{ id: "a", points: 1 }, { id: "b", points: 1 }, { id: "c", points: 1 }];
    const r = calcularNota(p, [{ questionId: "a", isCorrect: true }], 70);
    expect(r.scorePct).toBe(33.33);
  });
});

describe("barajarConSemilla", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("es determinista: la misma semilla da el mismo orden", () => {
    expect(barajarConSemilla(items, "abc")).toEqual(barajarConSemilla(items, "abc"));
  });

  it("semillas distintas dan órdenes distintos", () => {
    expect(barajarConSemilla(items, "abc")).not.toEqual(barajarConSemilla(items, "xyz"));
  });

  it("conserva todos los elementos", () => {
    expect(barajarConSemilla(items, "abc").slice().sort((a, b) => a - b)).toEqual(items);
  });

  it("no muta el arreglo original", () => {
    const original = [1, 2, 3, 4, 5];
    barajarConSemilla(original, "abc");
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it("tolera arreglos vacíos y de un elemento", () => {
    expect(barajarConSemilla([], "abc")).toEqual([]);
    expect(barajarConSemilla(["solo"], "abc")).toEqual(["solo"]);
  });
});

describe("semillaOpciones", () => {
  it("depende del intento y de la pregunta", () => {
    expect(semillaOpciones("A", "1")).toBe(semillaOpciones("A", "1"));
    expect(semillaOpciones("A", "1")).not.toBe(semillaOpciones("A", "2"));
    expect(semillaOpciones("A", "1")).not.toBe(semillaOpciones("B", "1"));
  });
});

describe("evaluarElegibilidad", () => {
  const ahora = new Date("2026-08-01T12:00:00Z");

  it("permite iniciar mientras quedan intentos", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 2, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T11:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: true, desbloqueaA: null });
  });

  it("bloquea con la hora exacta de desbloqueo al agotar los intentos", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T10:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: false, desbloqueaA: new Date("2026-08-02T10:00:00Z") });
  });

  it("vuelve a permitir cuando el bloqueo ya expiró", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-07-30T10:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: true, desbloqueaA: null });
  });

  it("desbloquea justo al cumplirse la hora, no un instante después", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-07-31T12:00:00Z"), lockoutHours: 24, ahora,
      }).puedeIniciar
    ).toBe(true);
  });

  it("con lockoutHours = 0 nunca bloquea", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 9, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T11:59:00Z"), lockoutHours: 0, ahora,
      }).puedeIniciar
    ).toBe(true);
  });
});

describe("examSettingsSchema", () => {
  const base = {
    title: "Examen final",
    passingScore: 70,
    maxAttempts: 3,
    lockoutHours: 24,
    timeLimitMinutes: null,
    questionsPerAttempt: null,
    shuffleQuestions: true,
    shuffleOptions: true,
  };

  it("acepta una configuración válida", () => {
    expect(examSettingsSchema.parse(base).passingScore).toBe(70);
  });

  it("rechaza una nota de aprobación fuera de 1..100", () => {
    expect(() => examSettingsSchema.parse({ ...base, passingScore: 0 })).toThrow();
    expect(() => examSettingsSchema.parse({ ...base, passingScore: 101 })).toThrow();
  });

  it("rechaza cero intentos", () => {
    expect(() => examSettingsSchema.parse({ ...base, maxAttempts: 0 })).toThrow();
  });
});

describe("questionInputSchema", () => {
  const mcq = {
    type: "mcq" as const,
    promptMd: "¿Qué hace BUSCARV?",
    explanationMd: null,
    points: 1,
    options: [
      { text: "Busca en la primera columna", isCorrect: true },
      { text: "Suma un rango", isCorrect: false },
    ],
  };

  it("acepta una pregunta válida", () => {
    expect(questionInputSchema.parse(mcq).options).toHaveLength(2);
  });

  it("exige exactamente una opción correcta", () => {
    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        options: [
          { text: "a", isCorrect: true },
          { text: "b", isCorrect: true },
        ],
      })
    ).toThrow(/una opción correcta/i);

    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        options: [
          { text: "a", isCorrect: false },
          { text: "b", isCorrect: false },
        ],
      })
    ).toThrow(/una opción correcta/i);
  });

  it("exige al menos dos opciones", () => {
    expect(() =>
      questionInputSchema.parse({ ...mcq, options: [{ text: "a", isCorrect: true }] })
    ).toThrow();
  });

  it("obliga a verdadero/falso a tener exactamente dos opciones", () => {
    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        type: "true_false",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
          { text: "Depende", isCorrect: false },
        ],
      })
    ).toThrow(/verdadero\/falso/i);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/unit/assessment-service.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/assessment/service"`.

- [ ] **Step 3: Escribir la implementación**

Crea `src/modules/assessment/service.ts`:

```ts
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
  title: z.string().min(3).max(160),
  passingScore: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(10),
  lockoutHours: z.number().int().min(0).max(168),
  timeLimitMinutes: z.number().int().min(1).max(480).nullable(),
  questionsPerAttempt: z.number().int().min(1).max(200).nullable(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
});
export type ExamSettingsInput = z.infer<typeof examSettingsSchema>;

export const questionInputSchema = z
  .object({
    type: z.enum(["mcq", "true_false"]),
    promptMd: z.string().min(3),
    explanationMd: z.string().nullable(),
    points: z.number().int().min(1).max(100),
    options: z
      .array(z.object({ text: z.string().min(1), isCorrect: z.boolean() }))
      .min(2)
      .max(8),
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
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/unit/assessment-service.test.ts`
Esperado: PASA, 24 tests.

- [ ] **Step 5: Verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/modules/assessment/service.ts tests/unit/assessment-service.test.ts
git commit -m "feat(assessment): add pure exam scoring, seeded shuffle, and attempt eligibility"
```

---

### Task 2: Banco de preguntas del instructor (consultas y acciones)

**Files:**
- Create: `src/modules/assessment/queries.ts`
- Create: `src/modules/assessment/actions.ts`
- Test: `tests/integration/assessment-instructor.test.ts`

**Interfaces:**
- Consumes de Task 1: `examSettingsSchema`, `questionInputSchema`, `canPublishExam`.
- Consumes del código existente: `assertRole` de `@/modules/auth/session`, `canManageCourse` / `ForbiddenError` / `type Role` de `@/modules/auth/guards`.
- Produces:
  - `getBancoPreguntas(userId: string, courseId: string): Promise<BancoPreguntas | null>`
  - `guardarExamen(courseId: string, raw: unknown): Promise<void>`
  - `guardarPregunta(courseId: string, questionId: string | null, raw: unknown): Promise<void>`
  - `eliminarPregunta(courseId: string, questionId: string): Promise<void>`
  - `publicarExamen(courseId: string): Promise<void>` / `despublicarExamen(courseId: string): Promise<void>`
  - Tipos `BancoPreguntas`, `PreguntaDelBanco`

Nota de diseño: `guardarPregunta` **reemplaza las opciones por completo** (borra e inserta). Editar opciones en sitio obligaría a diferenciar altas, bajas y cambios; reemplazarlas es más simple y correcto. Las respuestas ya dadas apuntan a `question_options.id`, pero un examen en edición no debe tener intentos vivos — por eso `guardarPregunta` rechaza si el examen tiene algún intento `in_progress`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/assessment-instructor.test.ts`:

```ts
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
    expect(banco!.examen.title).toBe("Examen final");
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/assessment-instructor.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/assessment/actions"`.

- [ ] **Step 3: Escribir `queries.ts` con la parte del instructor**

Crea `src/modules/assessment/queries.ts`:

```ts
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
```

- [ ] **Step 4: Escribir `actions.ts` con el CRUD del instructor**

Crea `src/modules/assessment/actions.ts`:

```ts
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
  const exam = await loadExam(courseId);
  await assertSinIntentosEnCurso(courseId);

  const [q] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.examId, exam.id)))
    .limit(1);
  if (!q) throw new Error("Esa pregunta no pertenece a este examen.");

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
```

Los imports `asc` e `inArray` se usan en las tasks siguientes de este mismo archivo; si
tu linter se queja ahora, quítalos y vuelve a agregarlos cuando hagan falta.

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/assessment-instructor.test.ts`
Esperado: PASA, 18 tests.

- [ ] **Step 6: Verificar tipos y lint**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint`
Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/modules/assessment/queries.ts src/modules/assessment/actions.ts tests/integration/assessment-instructor.test.ts
git commit -m "feat(assessment): add instructor question bank queries and CRUD actions"
```

---

### Task 3: Panel del examen en el instructor (UI)

**Files:**
- Create: `src/modules/assessment/ui/exam-settings-form.tsx`
- Create: `src/modules/assessment/ui/question-form.tsx`
- Create: `src/modules/assessment/ui/question-list.tsx`
- Create: `src/app/(instructor)/instructor/cursos/[id]/examen/page.tsx`
- Modify: `src/app/(instructor)/instructor/cursos/[id]/page.tsx` (agregar el enlace al examen)

**Interfaces:**
- Consumes de Task 2: `getBancoPreguntas`, `guardarExamen`, `guardarPregunta`, `eliminarPregunta`, `publicarExamen`, `despublicarExamen`, tipos `BancoPreguntas` y `PreguntaDelBanco`.
- Produces: nada que consuman otras tasks. Es pantalla.

Sigue el patrón exacto de `src/modules/catalog/ui/session-form.tsx`: componente cliente,
`useTransition`, `toast` de `sonner`, `router.refresh()`, error en `<p className="text-sm text-destructive">`.

- [ ] **Step 1: Crear el formulario de configuración**

Crea `src/modules/assessment/ui/exam-settings-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarExamen } from "@/modules/assessment/actions";

interface ExamSettingsValues {
  title: string;
  passingScore: number;
  maxAttempts: number;
  lockoutHours: number;
  timeLimitMinutes: number | null;
  questionsPerAttempt: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

const VACIO: ExamSettingsValues = {
  title: "Examen final",
  passingScore: 70,
  maxAttempts: 3,
  lockoutHours: 24,
  timeLimitMinutes: null,
  questionsPerAttempt: null,
  shuffleQuestions: true,
  shuffleOptions: true,
};

/** "" -> null; "12" -> 12. Los campos opcionales van vacíos, no en cero. */
function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const s = String(valor ?? "").trim();
  return s === "" ? null : Number(s);
}

export function ExamSettingsForm({
  courseId,
  initialValues,
}: {
  courseId: string;
  initialValues?: ExamSettingsValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const v = initialValues ?? VACIO;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const raw = {
      title: String(form.get("title") ?? ""),
      passingScore: Number(form.get("passingScore") ?? 70),
      maxAttempts: Number(form.get("maxAttempts") ?? 3),
      lockoutHours: Number(form.get("lockoutHours") ?? 24),
      timeLimitMinutes: numeroOpcional(form.get("timeLimitMinutes")),
      questionsPerAttempt: numeroOpcional(form.get("questionsPerAttempt")),
      shuffleQuestions: form.get("shuffleQuestions") === "on",
      shuffleOptions: form.get("shuffleOptions") === "on",
    };

    startTransition(async () => {
      try {
        await guardarExamen(courseId, raw);
        toast.success("Examen guardado.");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos guardar el examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título del examen</Label>
        <Input id="title" name="title" required minLength={3} defaultValue={v.title} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="passingScore">Nota de aprobación (%)</Label>
          <Input id="passingScore" name="passingScore" type="number" min={1} max={100} required
                 defaultValue={v.passingScore} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="maxAttempts">Intentos permitidos</Label>
          <Input id="maxAttempts" name="maxAttempts" type="number" min={1} max={10} required
                 defaultValue={v.maxAttempts} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lockoutHours">Bloqueo tras agotarlos (horas)</Label>
          <Input id="lockoutHours" name="lockoutHours" type="number" min={0} max={168} required
                 defaultValue={v.lockoutHours} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="timeLimitMinutes">Límite de tiempo (min)</Label>
          <Input id="timeLimitMinutes" name="timeLimitMinutes" type="number" min={1} max={480}
                 defaultValue={v.timeLimitMinutes ?? ""} />
          <p className="text-xs text-muted-foreground">Déjalo vacío para no limitar el tiempo.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="questionsPerAttempt">Preguntas por intento</Label>
          <Input id="questionsPerAttempt" name="questionsPerAttempt" type="number" min={1} max={200}
                 defaultValue={v.questionsPerAttempt ?? ""} />
          <p className="text-xs text-muted-foreground">Vacío = todas las preguntas del banco.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shuffleQuestions" defaultChecked={v.shuffleQuestions} />
        Barajar el orden de las preguntas
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shuffleOptions" defaultChecked={v.shuffleOptions} />
        Barajar el orden de las opciones
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar configuración"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Crear el formulario de pregunta**

Crea `src/modules/assessment/ui/question-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { guardarPregunta } from "@/modules/assessment/actions";

export interface QuestionFormValues {
  type: "mcq" | "true_false";
  promptMd: string;
  explanationMd: string | null;
  points: number;
  opciones: { text: string; isCorrect: boolean }[];
}

const VERDADERO_FALSO = [
  { text: "Verdadero", isCorrect: true },
  { text: "Falso", isCorrect: false },
];

export function QuestionForm({
  courseId,
  questionId,
  initialValues,
  onDone,
}: {
  courseId: string;
  questionId?: string;
  initialValues?: QuestionFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState<"mcq" | "true_false">(initialValues?.type ?? "mcq");
  const [opciones, setOpciones] = useState(
    initialValues?.opciones ?? [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ]
  );

  function cambiarTipo(nuevo: "mcq" | "true_false") {
    setTipo(nuevo);
    if (nuevo === "true_false") setOpciones(VERDADERO_FALSO);
  }

  function marcarCorrecta(indice: number) {
    setOpciones((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === indice })));
  }

  function cambiarTexto(indice: number, text: string) {
    setOpciones((prev) => prev.map((o, i) => (i === indice ? { ...o, text } : o)));
  }

  function agregarOpcion() {
    setOpciones((prev) => (prev.length >= 8 ? prev : [...prev, { text: "", isCorrect: false }]));
  }

  function quitarOpcion(indice: number) {
    setOpciones((prev) => {
      if (prev.length <= 2) return prev;
      const resto = prev.filter((_, i) => i !== indice);
      return resto.some((o) => o.isCorrect)
        ? resto
        : resto.map((o, i) => ({ ...o, isCorrect: i === 0 }));
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const raw = {
      type: tipo,
      promptMd: String(form.get("promptMd") ?? ""),
      explanationMd: String(form.get("explanationMd") ?? "").trim() || null,
      points: Number(form.get("points") ?? 1),
      options: opciones.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    };

    startTransition(async () => {
      try {
        await guardarPregunta(courseId, questionId ?? null, raw);
        toast.success(questionId ? "Pregunta actualizada." : "Pregunta agregada.");
        if (!questionId) {
          (e.target as HTMLFormElement).reset();
          setOpciones([
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
          ]);
        }
        router.refresh();
        onDone?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos guardar la pregunta.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Tipo</Label>
          <select
            id="type"
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as "mcq" | "true_false")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="mcq">Opción múltiple</option>
            <option value="true_false">Verdadero / Falso</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="points">Puntos</Label>
          <Input id="points" name="points" type="number" min={1} max={100} required
                 defaultValue={initialValues?.points ?? 1} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="promptMd">Enunciado</Label>
        <Textarea id="promptMd" name="promptMd" rows={2} required
                  defaultValue={initialValues?.promptMd ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Opciones</Label>
        <p className="text-xs text-muted-foreground">Marca el círculo de la opción correcta.</p>
        {opciones.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correcta"
              checked={o.isCorrect}
              onChange={() => marcarCorrecta(i)}
              aria-label={`Marcar opción ${i + 1} como correcta`}
            />
            <Input
              value={o.text}
              onChange={(e) => cambiarTexto(i, e.target.value)}
              placeholder={`Opción ${i + 1}`}
              required
              readOnly={tipo === "true_false"}
            />
            {tipo === "mcq" && opciones.length > 2 && (
              <Button type="button" variant="ghost" onClick={() => quitarOpcion(i)}>
                Quitar
              </Button>
            )}
          </div>
        ))}
        {tipo === "mcq" && opciones.length < 8 && (
          <Button type="button" variant="outline" onClick={agregarOpcion} className="self-start">
            Agregar opción
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="explanationMd">Explicación (se muestra en los resultados)</Label>
        <Textarea id="explanationMd" name="explanationMd" rows={2}
                  defaultValue={initialValues?.explanationMd ?? ""} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : questionId ? "Guardar cambios" : "Agregar pregunta"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Crear la lista de preguntas**

Crea `src/modules/assessment/ui/question-list.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eliminarPregunta } from "@/modules/assessment/actions";
import { QuestionForm, type QuestionFormValues } from "./question-form";

export interface PreguntaListItem {
  id: string;
  type: "mcq" | "true_false";
  promptMd: string;
  explanationMd: string | null;
  points: number;
  opciones: { id: string; text: string; isCorrect: boolean }[];
}

export function QuestionList({
  courseId,
  preguntas,
}: {
  courseId: string;
  preguntas: PreguntaListItem[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function borrar(id: string) {
    startTransition(async () => {
      try {
        await eliminarPregunta(courseId, id);
        toast.success("Pregunta eliminada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos eliminar la pregunta.");
      }
    });
  }

  if (preguntas.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay preguntas. Agrega la primera abajo.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {preguntas.map((p, i) => {
        const valores: QuestionFormValues = {
          type: p.type,
          promptMd: p.promptMd,
          explanationMd: p.explanationMd,
          points: p.points,
          opciones: p.opciones.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
        };

        return (
          <li key={p.id} className="rounded-md border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {i + 1}. {p.promptMd}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {p.type === "mcq" ? "Opción múltiple" : "Verdadero / Falso"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.points} {p.points === 1 ? "punto" : "puntos"}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                  {p.opciones.map((o) => (
                    <li key={o.id}>
                      {o.isCorrect ? "✓ " : "· "}
                      {o.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditando(editando === p.id ? null : p.id)}
                >
                  {editando === p.id ? "Cerrar" : "Editar"}
                </Button>
                <Button type="button" variant="ghost" disabled={isPending} onClick={() => borrar(p.id)}>
                  Eliminar
                </Button>
              </div>
            </div>

            {editando === p.id && (
              <div className="mt-4">
                <QuestionForm
                  courseId={courseId}
                  questionId={p.id}
                  initialValues={valores}
                  onDone={() => setEditando(null)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Crear la página del examen del instructor**

Crea `src/app/(instructor)/instructor/cursos/[id]/examen/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { getBancoPreguntas } from "@/modules/assessment/queries";
import { Badge } from "@/components/ui/badge";
import { ExamSettingsForm } from "@/modules/assessment/ui/exam-settings-form";
import { QuestionForm } from "@/modules/assessment/ui/question-form";
import { QuestionList } from "@/modules/assessment/ui/question-list";
import { PublishExamButton } from "@/modules/assessment/ui/publish-exam-button";

export default async function ExamenInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await requireUser();
  const banco = await getBancoPreguntas(u.id, id);
  if (!banco) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Examen — {banco.courseTitle}</h1>
        <Link href={`/instructor/cursos/${banco.courseId}`} className="text-sm text-primary hover:underline">
          Volver al curso
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Configuración</h2>
          {banco.examen && (
            <Badge variant={banco.examen.isPublished ? "default" : "secondary"}>
              {banco.examen.isPublished ? "Publicado" : "Borrador"}
            </Badge>
          )}
        </div>
        <ExamSettingsForm
          courseId={banco.courseId}
          initialValues={
            banco.examen
              ? {
                  title: banco.examen.title,
                  passingScore: banco.examen.passingScore,
                  maxAttempts: banco.examen.maxAttempts,
                  lockoutHours: banco.examen.lockoutHours,
                  timeLimitMinutes: banco.examen.timeLimitMinutes,
                  questionsPerAttempt: banco.examen.questionsPerAttempt,
                  shuffleQuestions: banco.examen.shuffleQuestions,
                  shuffleOptions: banco.examen.shuffleOptions,
                }
              : undefined
          }
        />
      </section>

      {banco.examen ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Banco de preguntas</h2>
            <QuestionList
              courseId={banco.courseId}
              preguntas={banco.preguntas.map((p) => ({
                id: p.id,
                type: p.type,
                promptMd: p.promptMd,
                explanationMd: p.explanationMd,
                points: p.points,
                opciones: p.opciones.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
              }))}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Agregar pregunta</h2>
            <QuestionForm courseId={banco.courseId} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Publicación</h2>
            <p className="text-sm text-muted-foreground">
              Mientras el examen esté en borrador, tus alumnos no lo ven.
            </p>
            <PublishExamButton courseId={banco.courseId} isPublished={banco.examen.isPublished} />
          </section>
        </>
      ) : (
        <p className="text-muted-foreground">
          Guarda la configuración para empezar a agregar preguntas.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Crear el botón de publicar**

Crea `src/modules/assessment/ui/publish-exam-button.tsx`:

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicarExamen, despublicarExamen } from "@/modules/assessment/actions";

export function PublishExamButton({
  courseId,
  isPublished,
}: {
  courseId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        if (isPublished) {
          await despublicarExamen(courseId);
          toast.success("Examen despublicado.");
        } else {
          await publicarExamen(courseId);
          toast.success("Examen publicado.");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos cambiar el estado del examen.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={isPublished ? "outline" : "default"}
      disabled={isPending}
      onClick={onClick}
      className="self-start"
    >
      {isPending ? "Guardando..." : isPublished ? "Despublicar examen" : "Publicar examen"}
    </Button>
  );
}
```

- [ ] **Step 6: Enlazar el examen desde la página del curso**

Abre `src/app/(instructor)/instructor/cursos/[id]/page.tsx` y localiza el enlace existente
hacia `/instructor/cursos/${...}/sesiones`. Agrega justo después, dentro del mismo
contenedor de enlaces, uno equivalente al examen:

```tsx
<Link
  href={`/instructor/cursos/${course.id}/examen`}
  className="text-sm text-primary hover:underline"
>
  Examen
</Link>
```

Usa el mismo nombre de variable del curso que ya emplea ese archivo (no lo renombres) y
respeta las clases del enlace vecino si difieren de las de arriba.

- [ ] **Step 7: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/instructor/cursos/[id]/examen` aparece en el listado del build.

- [ ] **Step 8: Verificación manual**

Ejecuta `pnpm dev`, entra como `prof@test.pe` / `prof12345`, abre el curso "Excel desde cero",
haz clic en **Examen**, guarda la configuración, agrega una pregunta con dos opciones y
publica. Confirma que al recargar todo sigue ahí y que el badge cambia a "Publicado".

- [ ] **Step 9: Commit**

```bash
git add src/modules/assessment/ui src/app/\(instructor\)/instructor/cursos/\[id\]
git commit -m "feat(assessment): add instructor exam panel with settings, question bank, and publishing"
```

---

### Task 4: Iniciar intento y pantalla previa del alumno

**Files:**
- Modify: `src/modules/assessment/queries.ts` (agregar `getExamenDeCurso`)
- Modify: `src/modules/assessment/actions.ts` (agregar `iniciarIntento`)
- Test: `tests/integration/assessment-intento.test.ts`

**Interfaces:**
- Consumes de Task 1: `barajarConSemilla`, `evaluarElegibilidad`.
- Consumes del código existente: `requireUser`, `assertEnrolled`, `formatLima` de `@/lib/datetime`.
- Produces:
  - `getExamenDeCurso(userId: string, slug: string): Promise<ExamenPrevio | null>`
  - `iniciarIntento(courseId: string): Promise<string>` — devuelve el `attemptId`
  - Tipo `ExamenPrevio`

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/assessment-intento.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/assessment-intento.test.ts`
Esperado: FALLA con `acts.iniciarIntento is not a function`.

- [ ] **Step 3: Agregar `getExamenDeCurso` a `queries.ts`**

Añade al final de `src/modules/assessment/queries.ts` (y suma `desc`, `enrollments`,
`examAttempts` y `assertEnrolled` a los imports del archivo):

```ts
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
```

Imports a agregar en la cabecera del archivo:

```ts
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  courses, enrollments, exams, questions, questionOptions, examAttempts, user,
} from "@/db/schema";
import { assertEnrolled, canManageCourse, type Role } from "@/modules/auth/guards";
import { evaluarElegibilidad } from "./service";
```

- [ ] **Step 4: Agregar `iniciarIntento` a `actions.ts`**

Añade al final de `src/modules/assessment/actions.ts`:

```ts
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
```

Imports a agregar en la cabecera de `actions.ts`:

```ts
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
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
```

(`calcularNota`, `examAttemptAnswers` y `questionOptions` se usan en las Tasks 5 y 6.)

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/assessment-intento.test.ts`
Esperado: PASA, 18 tests.

- [ ] **Step 6: Verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/modules/assessment tests/integration/assessment-intento.test.ts
git commit -m "feat(assessment): add attempt start with frozen shuffle and lockout eligibility"
```

---

### Task 5: Responder y leer el intento en curso

**Files:**
- Modify: `src/modules/assessment/queries.ts` (agregar `getIntentoParaResolver`)
- Modify: `src/modules/assessment/actions.ts` (agregar `responder`)
- Test: `tests/integration/assessment-responder.test.ts`

**Interfaces:**
- Consumes de Task 1: `barajarConSemilla`, `semillaOpciones`.
- Consumes de Task 4: `iniciarIntento` (para armar los tests).
- Produces:
  - `getIntentoParaResolver(userId: string, attemptId: string): Promise<IntentoParaResolver | null>`
  - `responder(attemptId: string, questionId: string, optionId: string): Promise<void>`
  - Tipos `IntentoParaResolver`, `PreguntaParaResolver`, `OpcionParaResolver`

**Invariante central de esta task:** `getIntentoParaResolver` **no selecciona**
`questionOptions.isCorrect` ni `questions.explanationMd`. `responder` devuelve `void`:
nunca dice si acertaste.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/assessment-responder.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/assessment-responder.test.ts`
Esperado: FALLA con `acts.responder is not a function`.

- [ ] **Step 3: Agregar el ayudante de propiedad del intento en `queries.ts`**

Añade a `src/modules/assessment/queries.ts`:

```ts
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
```

- [ ] **Step 4: Agregar `getIntentoParaResolver` a `queries.ts`**

```ts
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
```

Agrega a los imports de `queries.ts`: `examAttemptQuestions`, `examAttemptAnswers` de
`@/db/schema`; `barajarConSemilla`, `semillaOpciones` de `./service`.

- [ ] **Step 5: Agregar `responder` a `actions.ts`**

```ts
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
```

Agrega `cargarIntentoPropio` al import de `./queries` en `actions.ts`:

```ts
import { cargarIntentoPropio } from "./queries";
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/assessment-responder.test.ts`
Esperado: PASA, 15 tests.

- [ ] **Step 7: Verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/modules/assessment tests/integration/assessment-responder.test.ts
git commit -m "feat(assessment): add incremental answer saving and leak-free in-progress attempt view"
```

---

### Task 6: Calificar y enviar el intento

**Files:**
- Create: `src/modules/assessment/grading.ts`
- Modify: `src/modules/assessment/queries.ts` (agregar `getResultado`)
- Modify: `src/modules/assessment/actions.ts` (agregar `enviarIntento`)
- Test: `tests/integration/assessment-envio.test.ts`

**Interfaces:**
- Consumes de Task 1: `calcularNota`. De Task 5: `cargarIntentoPropio`.
- Produces:
  - `cerrarIntento(attemptId: string): Promise<{ scorePct: number; passed: boolean }>` — en `grading.ts`, **sin `"use server"`**
  - `enviarIntento(attemptId: string): Promise<void>` — en `actions.ts`
  - `getResultado(userId: string, attemptId: string): Promise<ResultadoIntento | null>`
  - Tipos `ResultadoIntento`, `ResultadoPregunta`

**Por qué `grading.ts` existe:** la calificación la disparan dos llamadores — la acción
`enviarIntento` (el alumno pulsa Enviar) y el Server Component del intento cuando detecta
que el tiempo venció. Un Server Component no puede llamar `revalidatePath` durante el
render, así que la transacción vive en un módulo plano y cada llamador decide qué hace
después. Mismo patrón que `src/modules/learning/jobs.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/assessment-envio.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/assessment-envio.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/assessment/grading"`.

- [ ] **Step 3: Escribir `grading.ts`**

Crea `src/modules/assessment/grading.ts`:

```ts
// Sin "use server" a propósito: lo invoca la acción enviarIntento y también el
// Server Component del intento cuando detecta que el tiempo venció. No es un endpoint.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, enrollments, questions, examAttempts, examAttemptQuestions, examAttemptAnswers } from "@/db/schema";
import { calcularNota } from "./service";

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

    // FASE 5 — certificación: aquí va `if (passed) await emitirCertificado(tx, attempt.enrollmentId)`.
    // Se deja fuera a propósito: la emisión, el código verificable y el PDF son el
    // alcance completo de la Fase 5. La pantalla de resultados ya anuncia el certificado.

    return { scorePct, passed, yaEstaba: false };
  });
}
```

- [ ] **Step 4: Agregar `enviarIntento` a `actions.ts`**

```ts
export async function enviarIntento(attemptId: string): Promise<void> {
  const u = await requireUser();
  const ctx = await cargarIntentoPropio(u.id, attemptId);
  if (!ctx) throw new Error("Intento no encontrado.");

  await cerrarIntento(attemptId);

  revalidatePath(`/curso/${ctx.courseSlug}/examen`);
  revalidatePath(`/curso/${ctx.courseSlug}/examen/${attemptId}/resultado`);
}
```

Agrega el import: `import { cerrarIntento } from "./grading";`

- [ ] **Step 5: Agregar `getResultado` a `queries.ts`**

```ts
export interface OpcionResultado {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface ResultadoPregunta {
  id: string;
  numero: number;
  promptMd: string;
  points: number;
  explanationMd: string | null;
  opciones: OpcionResultado[];
  seleccionadaId: string | null;
  acerto: boolean;
}

export interface ResultadoIntento {
  attemptId: string;
  courseSlug: string;
  courseTitle: string;
  examTitle: string;
  scorePct: number;
  passed: boolean;
  passingScore: number;
  submittedAt: Date;
  preguntas: ResultadoPregunta[];
}

/**
 * Resultados de un intento ya enviado. Aquí sí viajan isCorrect y la explicación:
 * el intento está cerrado y la nota, calculada.
 */
export async function getResultado(
  userId: string,
  attemptId: string
): Promise<ResultadoIntento | null> {
  const ctx = await cargarIntentoPropio(userId, attemptId);
  if (!ctx) return null;
  if (ctx.status !== "submitted" || ctx.submittedAt === null) return null;

  const filas = await db
    .select({
      id: questions.id,
      promptMd: questions.promptMd,
      explanationMd: questions.explanationMd,
      points: questions.points,
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
          isCorrect: questionOptions.isCorrect,
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
          isCorrect: examAttemptAnswers.isCorrect,
        })
        .from(examAttemptAnswers)
        .where(eq(examAttemptAnswers.attemptId, attemptId))
    : [];
  const porPreguntaRespuesta = new Map(respuestas.map((r) => [r.questionId, r]));

  const porPreguntaOpciones = new Map<string, OpcionResultado[]>();
  for (const o of opciones) {
    const lista = porPreguntaOpciones.get(o.questionId) ?? [];
    lista.push({ id: o.id, text: o.text, isCorrect: o.isCorrect });
    porPreguntaOpciones.set(o.questionId, lista);
  }

  return {
    attemptId: ctx.attemptId,
    courseSlug: ctx.courseSlug,
    courseTitle: ctx.courseTitle,
    examTitle: ctx.examTitle,
    scorePct: ctx.score === null ? 0 : Number(ctx.score),
    passed: ctx.passed ?? false,
    passingScore: ctx.passingScore,
    submittedAt: ctx.submittedAt,
    preguntas: filas.map((f, i) => {
      const r = porPreguntaRespuesta.get(f.id);
      return {
        id: f.id,
        numero: i + 1,
        promptMd: f.promptMd,
        points: f.points,
        explanationMd: f.explanationMd,
        opciones: porPreguntaOpciones.get(f.id) ?? [],
        seleccionadaId: r?.selectedOptionId ?? null,
        acerto: r?.isCorrect ?? false,
      };
    }),
  };
}
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/assessment-envio.test.ts`
Esperado: PASA, 9 tests.

- [ ] **Step 7: Correr toda la suite y verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores de tipos; toda la suite en verde.

- [ ] **Step 8: Commit**

```bash
git add src/modules/assessment tests/integration/assessment-envio.test.ts
git commit -m "feat(assessment): add idempotent attempt grading and results query"
```

---

### Task 7: Pantallas del alumno

**Files:**
- Create: `src/modules/assessment/ui/iniciar-intento-button.tsx`
- Create: `src/modules/assessment/ui/cuenta-regresiva.tsx`
- Create: `src/modules/assessment/ui/intento-runner.tsx`
- Create: `src/app/(student)/curso/[slug]/examen/page.tsx`
- Create: `src/app/(student)/curso/[slug]/examen/[attemptId]/page.tsx`
- Create: `src/app/(student)/curso/[slug]/examen/[attemptId]/resultado/page.tsx`

**Interfaces:**
- Consumes: `getExamenDeCurso`, `getIntentoParaResolver`, `getResultado` (Tasks 4-6);
  `iniciarIntento`, `responder`, `enviarIntento` (Tasks 4-6); `cerrarIntento` (Task 6);
  `ForbiddenError` de `@/modules/auth/guards`; `formatLima` de `@/lib/datetime`.
- Produces: nada que consuman otras tasks salvo el E2E.

**Patrón de acceso, idéntico al de la Fase 3:** tanto `ForbiddenError` como un `null`
llevan a `notFound()`. Un alumno no inscrito no puede distinguir "no existe" de "no tengo
acceso".

- [ ] **Step 1: Crear el botón de iniciar intento**

Crea `src/modules/assessment/ui/iniciar-intento-button.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { iniciarIntento } from "@/modules/assessment/actions";

export function IniciarIntentoButton({
  courseId,
  courseSlug,
  label,
}: {
  courseId: string;
  courseSlug: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onClick() {
    setError("");
    startTransition(async () => {
      try {
        const attemptId = await iniciarIntento(courseId);
        router.push(`/curso/${courseSlug}/examen/${attemptId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos iniciar el examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" disabled={isPending} onClick={onClick} className="self-start">
        {isPending ? "Abriendo..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Crear la cuenta regresiva**

Crea `src/modules/assessment/ui/cuenta-regresiva.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

function formatear(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/**
 * Cronómetro puramente cosmético: la autoridad sobre el tiempo es el servidor.
 * Al llegar a cero recarga la página, que ya auto-envía el intento vencido.
 */
export function CuentaRegresiva({ expiresAtISO }: { expiresAtISO: string }) {
  const expiresAt = new Date(expiresAtISO).getTime();
  const [restante, setRestante] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const ms = expiresAt - Date.now();
      setRestante(ms);
      if (ms <= 0) {
        clearInterval(id);
        window.location.reload();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const urgente = restante <= 60_000;

  return (
    <span
      role="timer"
      aria-live="off"
      className={urgente ? "font-mono text-sm text-destructive" : "font-mono text-sm text-muted-foreground"}
    >
      ⏱ {formatear(restante)}
    </span>
  );
}
```

- [ ] **Step 3: Crear la pantalla del intento (una pregunta a la vez)**

Crea `src/modules/assessment/ui/intento-runner.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { responder, enviarIntento } from "@/modules/assessment/actions";
import { CuentaRegresiva } from "./cuenta-regresiva";

export interface PreguntaRunner {
  id: string;
  numero: number;
  promptMd: string;
  points: number;
  opciones: { id: string; text: string }[];
  seleccionadaId: string | null;
}

export function IntentoRunner({
  attemptId,
  courseSlug,
  examTitle,
  courseTitle,
  expiresAtISO,
  preguntas,
}: {
  attemptId: string;
  courseSlug: string;
  examTitle: string;
  courseTitle: string;
  expiresAtISO: string | null;
  preguntas: PreguntaRunner[];
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(preguntas.map((p) => [p.id, p.seleccionadaId]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const actual = preguntas[indice];
  const respondidas = preguntas.filter((p) => respuestas[p.id]).length;

  function elegir(questionId: string, optionId: string) {
    const previo = respuestas[questionId] ?? null;
    setRespuestas((r) => ({ ...r, [questionId]: optionId }));
    setGuardando(questionId);
    setError("");

    responder(attemptId, questionId, optionId)
      .then(() => setGuardando(null))
      .catch((err) => {
        setRespuestas((r) => ({ ...r, [questionId]: previo }));
        setGuardando(null);
        const message = err instanceof Error ? err.message : "No pudimos guardar tu respuesta.";
        setError(message);
        toast.error(message);
      });
  }

  function enviar() {
    setError("");
    startTransition(async () => {
      try {
        await enviarIntento(attemptId);
        router.push(`/curso/${courseSlug}/examen/${attemptId}/resultado`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos enviar tu examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">{examTitle}</h1>
          <p className="text-sm text-muted-foreground">{courseTitle}</p>
        </div>
        {expiresAtISO && <CuentaRegresiva expiresAtISO={expiresAtISO} />}
      </div>

      <p className="text-sm text-muted-foreground">
        Pregunta {actual.numero} de {preguntas.length} · {respondidas} respondidas
      </p>

      <div className="flex flex-col gap-4 rounded-md border border-border p-4">
        <p className="font-medium">{actual.promptMd}</p>
        <ul className="flex flex-col gap-2">
          {actual.opciones.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-muted">
                <input
                  type="radio"
                  name={`pregunta-${actual.id}`}
                  checked={respuestas[actual.id] === o.id}
                  onChange={() => elegir(actual.id, o.id)}
                />
                <span>{o.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="h-4 text-xs text-muted-foreground">
          {guardando === actual.id ? "Guardando..." : respuestas[actual.id] ? "✓ guardado" : ""}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Ir a una pregunta">
        {preguntas.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndice(i)}
            aria-current={i === indice ? "true" : undefined}
            className={
              i === indice
                ? "size-9 rounded-md border border-primary bg-primary text-sm text-primary-foreground"
                : respuestas[p.id]
                  ? "size-9 rounded-md border border-primary text-sm"
                  : "size-9 rounded-md border border-border text-sm text-muted-foreground"
            }
          >
            {p.numero}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={indice === 0}
          onClick={() => setIndice((i) => i - 1)}
        >
          ‹ Anterior
        </Button>

        {indice < preguntas.length - 1 ? (
          <Button type="button" onClick={() => setIndice((i) => i + 1)}>
            Siguiente ›
          </Button>
        ) : (
          <Button type="button" disabled={isPending} onClick={enviar}>
            {isPending ? "Enviando..." : "Enviar examen"}
          </Button>
        )}
      </div>

      {respondidas < preguntas.length && indice === preguntas.length - 1 && (
        <p className="text-sm text-muted-foreground">
          Te faltan {preguntas.length - respondidas} preguntas por responder. Si envías ahora,
          contarán como incorrectas.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Crear la pantalla previa**

Crea `src/app/(student)/curso/[slug]/examen/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getExamenDeCurso } from "@/modules/assessment/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { IniciarIntentoButton } from "@/modules/assessment/ui/iniciar-intento-button";

export default async function ExamenPreviaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = await requireUser();

  let previo;
  try {
    previo = await getExamenDeCurso(u.id, slug);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!previo) notFound();

  const aprobado = previo.intentos.some((i) => i.passed);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">{previo.examTitle}</h1>
          <p className="text-sm text-muted-foreground">{previo.courseTitle}</p>
        </div>
        <Link href={`/curso/${previo.courseSlug}/aprender`} className="text-sm text-primary hover:underline">
          Volver a la agenda
        </Link>
      </div>

      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>{previo.totalPreguntas} preguntas.</li>
        <li>Necesitas {previo.passingScore}% para aprobar.</li>
        <li>Hasta {previo.maxAttempts} intentos.</li>
        <li>
          {previo.timeLimitMinutes
            ? `Tienes ${previo.timeLimitMinutes} minutos por intento.`
            : "Sin límite de tiempo."}
        </li>
      </ul>

      {aprobado && (
        <div className="rounded-md border border-border p-4">
          <p className="font-medium">Ya aprobaste este examen. ¡Felicitaciones!</p>
          <p className="text-sm text-muted-foreground">Tu certificado estará disponible pronto.</p>
        </div>
      )}

      {previo.intentoEnCurso ? (
        <IniciarIntentoButton
          courseId={previo.courseId}
          courseSlug={previo.courseSlug}
          label="Continuar mi intento"
        />
      ) : previo.puedeIniciar ? (
        <IniciarIntentoButton
          courseId={previo.courseId}
          courseSlug={previo.courseSlug}
          label={previo.intentos.length === 0 ? "Iniciar examen" : "Intentar de nuevo"}
        />
      ) : (
        <p className="text-sm text-destructive">
          Agotaste tus intentos. Podrás volver a intentarlo el{" "}
          {previo.desbloqueaA ? formatLima(previo.desbloqueaA) : "más adelante"}.
        </p>
      )}

      {previo.intentos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Tus intentos</h2>
          <ul className="flex flex-col gap-2">
            {previo.intentos.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <span className="text-sm">
                  Intento {i.attemptNumber}
                  {i.submittedAt && ` · ${formatLima(i.submittedAt)}`}
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant={i.passed ? "default" : "secondary"}>
                    {i.passed ? "Aprobado" : "Desaprobado"}
                  </Badge>
                  <span className="text-sm font-medium">{i.scorePct ?? 0}%</span>
                  <Link
                    href={`/curso/${previo.courseSlug}/examen/${i.id}/resultado`}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver resultado
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Crear la página del intento**

Crea `src/app/(student)/curso/[slug]/examen/[attemptId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getIntentoParaResolver, cargarIntentoPropio } from "@/modules/assessment/queries";
import { cerrarIntento } from "@/modules/assessment/grading";
import { IntentoRunner } from "@/modules/assessment/ui/intento-runner";

export default async function IntentoPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const u = await requireUser();

  let ctx;
  try {
    ctx = await cargarIntentoPropio(u.id, attemptId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!ctx || ctx.courseSlug !== slug) notFound();

  // Ya enviado: los resultados viven en su propia ruta.
  if (ctx.status === "submitted") {
    redirect(`/curso/${slug}/examen/${attemptId}/resultado`);
  }

  // El tiempo lo manda el servidor: un intento vencido se cierra y se califica
  // con lo que el alumno alcanzó a responder.
  if (ctx.expiresAt && Date.now() > ctx.expiresAt.getTime()) {
    await cerrarIntento(attemptId);
    redirect(`/curso/${slug}/examen/${attemptId}/resultado`);
  }

  const intento = await getIntentoParaResolver(u.id, attemptId);
  if (!intento) notFound();

  return (
    <IntentoRunner
      attemptId={intento.attemptId}
      courseSlug={intento.courseSlug}
      courseTitle={intento.courseTitle}
      examTitle={intento.examTitle}
      expiresAtISO={intento.expiresAt ? intento.expiresAt.toISOString() : null}
      preguntas={intento.preguntas.map((p) => ({
        id: p.id,
        numero: p.numero,
        promptMd: p.promptMd,
        points: p.points,
        opciones: p.opciones,
        seleccionadaId: p.seleccionadaId,
      }))}
    />
  );
}
```

**Nota para quien implemente:** `redirect()` de Next lanza una excepción de control de
flujo. No envuelvas las llamadas a `redirect` en un `try/catch` que trague errores.

- [ ] **Step 6: Crear la página de resultados**

Crea `src/app/(student)/curso/[slug]/examen/[attemptId]/resultado/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getResultado } from "@/modules/assessment/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const u = await requireUser();

  let resultado;
  try {
    resultado = await getResultado(u.id, attemptId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!resultado || resultado.courseSlug !== slug) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">Resultado — {resultado.examTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {resultado.courseTitle} · {formatLima(resultado.submittedAt)}
          </p>
        </div>
        <Link href={`/curso/${slug}/examen`} className="text-sm text-primary hover:underline">
          Volver al examen
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-semibold">{resultado.scorePct}%</span>
          <Badge variant={resultado.passed ? "default" : "secondary"}>
            {resultado.passed ? "Aprobado" : "Desaprobado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Necesitabas {resultado.passingScore}% para aprobar.
        </p>
        {resultado.passed && (
          <p className="text-sm text-muted-foreground">Tu certificado estará disponible pronto.</p>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Revisión</h2>
        <ul className="flex flex-col gap-4">
          {resultado.preguntas.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium">
                  {p.numero}. {p.promptMd}
                </p>
                <Badge variant={p.acerto ? "default" : "secondary"}>
                  {p.acerto ? "Correcta" : "Incorrecta"}
                </Badge>
              </div>

              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {p.opciones.map((o) => {
                  const elegida = o.id === p.seleccionadaId;
                  const clase = o.isCorrect
                    ? "text-foreground"
                    : elegida
                      ? "text-destructive"
                      : "text-muted-foreground";
                  return (
                    <li key={o.id} className={clase}>
                      {o.isCorrect ? "✓ " : elegida ? "✗ " : "· "}
                      {o.text}
                      {elegida && <span className="ml-2 text-xs">(tu respuesta)</span>}
                    </li>
                  );
                })}
              </ul>

              {p.explanationMd && (
                <p className="mt-3 text-sm text-muted-foreground">{p.explanationMd}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; aparecen `/curso/[slug]/examen`, `/curso/[slug]/examen/[attemptId]`
y `/curso/[slug]/examen/[attemptId]/resultado` en el listado de rutas.

- [ ] **Step 8: Verificación manual del no-filtrado**

Con `pnpm dev`, entra como alumno inscrito, inicia el examen y usa "Ver código fuente"
del navegador (Ctrl+U) sobre la página del intento. Busca el texto de la explicación de
una pregunta y la cadena `isCorrect`: **no deben aparecer**. Recarga la página y confirma
que el orden de preguntas y opciones no cambia.

- [ ] **Step 9: Commit**

```bash
git add src/modules/assessment/ui src/app/\(student\)/curso
git commit -m "feat(assessment): add student exam screens with one-question flow, timer, and results"
```

---

### Task 8: Enlace desde la agenda y E2E

**Files:**
- Modify: `src/app/(student)/curso/[slug]/aprender/page.tsx`
- Modify: `src/modules/learning/queries.ts` (agregar `tieneExamenPublicado` a `CourseAgenda`)
- Create: `tests/e2e/examen.spec.ts`

**Interfaces:**
- Consumes todo lo anterior.
- Produces: nada.

Sin este enlace, el examen sería una URL que nadie puede alcanzar navegando — el mismo
error que la Fase 3 cometió con los paneles.

- [ ] **Step 1: Exponer si el curso tiene examen publicado**

En `src/app/(student)/curso/[slug]/aprender/page.tsx` la agenda viene de
`getCourseAgenda` (`src/modules/learning/queries.ts`). Agrega el campo a la interfaz
`CourseAgenda`:

```ts
export interface CourseAgenda {
  courseId: string;
  slug: string;
  title: string;
  tieneExamenPublicado: boolean;
  sessions: AgendaSession[];
}
```

Dentro de `getCourseAgenda`, después de calcular `materialCounts` y antes del `return`,
agrega la consulta:

```ts
  const examenPublicado = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.courseId, course.id), eq(exams.isPublished, true)))
    .limit(1);
```

y en el objeto devuelto añade `tieneExamenPublicado: examenPublicado.length > 0,`.
Suma `exams` al import de `@/db/schema` en ese archivo.

- [ ] **Step 2: Agregar el enlace en la agenda**

En `src/app/(student)/curso/[slug]/aprender/page.tsx`, reemplaza la línea del título:

```tsx
      <h1 className="text-2xl font-semibold">{agenda.title}</h1>
```

por:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{agenda.title}</h1>
        {agenda.tieneExamenPublicado && (
          <Link
            href={`/curso/${slug}/examen`}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Rendir el examen
          </Link>
        )}
      </div>
```

- [ ] **Step 3: Ajustar el test existente de la agenda**

`tests/integration/learning-queries.test.ts` afirma sobre el objeto de `getCourseAgenda`.
Ejecuta `pnpm vitest run tests/integration/learning-queries.test.ts` y, si alguna
aserción compara el objeto completo con `toEqual`, agrégale `tieneExamenPublicado: false`.
Si solo comprueba campos sueltos, no hay nada que cambiar. Añade además este caso al
`describe` de `getCourseAgenda`:

```ts
  it("marca tieneExamenPublicado cuando el curso tiene examen publicado", async () => {
    const { exams } = await import("@/db/schema");
    await db.insert(exams).values({
      courseId: cursoId, title: "Examen final", isPublished: true,
    });
    const agenda = await getCourseAgenda(alumnoId, "curso-x");
    expect(agenda!.tieneExamenPublicado).toBe(true);
  });
```

Usa los nombres de variable que ya existan en ese archivo para el curso, el alumno y el
slug (no los inventes: ábrelo y cópialos).

- [ ] **Step 4: Escribir el E2E**

Crea `tests/e2e/examen.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, ALUMNO, PROF } from "./fixtures";

async function getDbHandles() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local" });
  const [{ db }, schema, { eq, and }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const schemaExports = (schema as Record<string, unknown>).default ?? schema;
  return { db, eq, and, ...(schemaExports as typeof schema) };
}

test.describe("examen", () => {
  let enrollmentId: string | undefined;
  let examId: string | undefined;
  let creamosLaInscripcion = false;

  test.afterAll(async () => {
    const { db, eq, exams, enrollments, examAttempts } = await getDbHandles();
    if (enrollmentId) {
      await db.delete(examAttempts).where(eq(examAttempts.enrollmentId, enrollmentId));
    }
    // questions, question_options y exam_attempt_* caen por ON DELETE CASCADE del examen.
    if (examId) await db.delete(exams).where(eq(exams.id, examId));
    if (enrollmentId && creamosLaInscripcion) {
      await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
    }
  });

  test("el instructor arma el examen y el alumno lo rinde y aprueba", async ({ page }) => {
    const { db, eq, and, user, courses, enrollments, exams } = await getDbHandles();

    const [alumno] = await db.select({ id: user.id }).from(user)
      .where(eq(user.email, ALUMNO.email)).limit(1);
    const [curso] = await db.select({ id: courses.id, slug: courses.slug })
      .from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);

    // Estado limpio: este curso no debe arrastrar un examen de una corrida anterior.
    await db.delete(exams).where(eq(exams.courseId, curso.id));

    const [existing] = await db.select({ id: enrollments.id }).from(enrollments)
      .where(and(eq(enrollments.userId, alumno.id), eq(enrollments.courseId, curso.id))).limit(1);
    if (existing) {
      enrollmentId = existing.id;
      await db.update(enrollments).set({ status: "active" }).where(eq(enrollments.id, existing.id));
    } else {
      const [created] = await db.insert(enrollments)
        .values({ userId: alumno.id, courseId: curso.id, status: "active" })
        .returning({ id: enrollments.id });
      enrollmentId = created.id;
      creamosLaInscripcion = true;
    }

    // ---------------------------------------------------------------- instructor
    await login(page, PROF.email, PROF.password);
    await page.goto("/instructor");
    await page.getByRole("link", { name: /editar/i }).first().click();
    await page.getByRole("link", { name: "Examen" }).click();
    await expect(page).toHaveURL(/\/instructor\/cursos\/.+\/examen$/);

    await page.getByLabel("Título del examen").fill("Examen de Excel");
    await page.getByLabel("Nota de aprobación (%)").fill("50");
    await page.getByRole("button", { name: /guardar configuración/i }).click();
    await expect(page.getByRole("heading", { name: "Banco de preguntas" })).toBeVisible();

    await page.getByLabel("Enunciado").fill("¿Excel es una hoja de cálculo?");
    await page.getByPlaceholder("Opción 1").fill("Sí");
    await page.getByPlaceholder("Opción 2").fill("No");
    await page.getByRole("button", { name: /agregar pregunta/i }).click();
    await expect(page.getByText("¿Excel es una hoja de cálculo?")).toBeVisible();

    await page.getByRole("button", { name: /publicar examen/i }).click();
    await expect(page.getByText("Publicado")).toBeVisible();

    const [ex] = await db.select({ id: exams.id }).from(exams)
      .where(eq(exams.courseId, curso.id)).limit(1);
    examId = ex.id;

    // -------------------------------------------------------------------- alumno
    await login(page, ALUMNO.email, ALUMNO.password);
    await page.goto(`/curso/${curso.slug}/aprender`);
    await page.getByRole("link", { name: /rendir el examen/i }).click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/examen`);
    await expect(page.getByText(/necesitas 50% para aprobar/i)).toBeVisible();

    await page.getByRole("button", { name: /iniciar examen/i }).click();
    await expect(page).toHaveURL(/\/examen\/[0-9a-f-]+$/);

    // Invariante: la página del intento no revela la respuesta correcta.
    const html = await page.content();
    expect(html).not.toContain("isCorrect");

    await page.getByRole("radio").first().check();
    await expect(page.getByText("✓ guardado")).toBeVisible();

    await page.getByRole("button", { name: /enviar examen/i }).click();
    await expect(page).toHaveURL(/\/resultado$/);
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText("Aprobado")).toBeVisible();
    await expect(page.getByText(/certificado estará disponible pronto/i)).toBeVisible();
  });
});
```

**Nota:** la primera opción del formulario del instructor queda marcada como correcta por
defecto, por eso el alumno acierta al elegir la primera opción — salvo que el barajado la
mueva. Para que el E2E sea determinista, en el formulario del instructor **desmarca**
"Barajar el orden de las opciones" antes de guardar la configuración:

```ts
    await page.getByLabel(/barajar el orden de las opciones/i).uncheck();
```

Agrega esa línea justo antes del clic en "Guardar configuración".

- [ ] **Step 5: Correr el E2E**

Ejecuta: `pnpm test:e2e tests/e2e/examen.spec.ts`
Esperado: PASA. Si algún selector no engancha, ajusta el selector — no el código de
producción — y deja anotado el cambio.

- [ ] **Step 6: Correr toda la verificación**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Esperado: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "test: add E2E for exam authoring and student attempt, link exam from agenda"
```

---

## Auto-revisión

**Cobertura del spec §6.6 y del diseño de la fase:**

| Requisito | Cubierto en |
|---|---|
| `iniciarIntento` con `assertEnrolled` | Task 4 |
| Un `in_progress` devuelve ESE intento, no crea otro | Task 4, test "dos pestañas" |
| Bloqueo con la hora exacta de desbloqueo | Task 1 (`evaluarElegibilidad`), Task 4 |
| Selección de preguntas `is_active` y `questions_per_attempt` | Task 4 |
| Barajado persistido en `exam_attempt_questions` | Task 4 |
| Orden de opciones derivado de semilla estable | Task 1 (`semillaOpciones`), Task 5 |
| `expires_at` si hay `time_limit_minutes` | Task 4; rechazo en Task 5; auto-envío en Tasks 6 y 7 |
| `responder` hace upsert y no devuelve `is_correct` | Task 5 |
| `enviarIntento`: nota, `passed`, `submitted_at`, transacción | Task 6 |
| Pantalla de resultados con fallos y explicación | Task 6 (`getResultado`), Task 7 |
| Invariante: `is_correct` nunca al cliente antes de enviar | Task 5 (test de `JSON.stringify`), Task 8 (E2E sobre el HTML) |
| Invariante: recargar no re-baraja | Task 5, test "mismo orden de opciones" |
| Banco de preguntas en el panel del instructor | Tasks 2 y 3 |
| Certificado como hueco deliberado | Task 6, comentario en `grading.ts`; Task 7, copy de la pantalla |

**Huecos deliberados, no olvidos:** `emitirCertificado` no se implementa (Fase 5), y el
comentario en `grading.ts` marca el punto exacto de inserción dentro de la transacción.
`attemptStatus` incluye `"abandoned"`, que esta fase nunca escribe: sin un cron que
recorra intentos huérfanos no hay quién lo asigne, y el auto-envío del vencido los cierra
como `submitted` con la nota real, que es más útil para el alumno que perderlos.

**Consistencia de nombres verificada:** `calcularNota` / `barajarConSemilla` /
`semillaOpciones` / `evaluarElegibilidad` / `canPublishExam` (Task 1, usados en 2, 4, 5, 6) ·
`cargarIntentoPropio` (Task 5, usado en 5, 6, 7) · `cerrarIntento` (Task 6, usado en 6 y 7) ·
`getExamenDeCurso` / `getIntentoParaResolver` / `getResultado` / `getBancoPreguntas`
(Tasks 2, 4, 5, 6, usados en 3, 7, 8) · `iniciarIntento` / `responder` / `enviarIntento`
(Tasks 4, 5, 6, usados en 7 y 8) · `tieneExamenPublicado` (Task 8, un solo consumidor).

**Siguiente plan:** Fase 5 — certificados (emisión idempotente dentro de la transacción
del examen, código legible de 8 caracteres, PDF perezoso con QR en R2, `/verificar/[code]`
público y revocación).
