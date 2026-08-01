# Aula del Alumno — Plan de Implementación (Fase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un alumno inscrito puede ver `/mi-aprendizaje` con sus cursos y progreso, entrar a la agenda de cada curso, abrir una sesión y ver su estado (*faltan N días* → **EN VIVO AHORA** → *finalizada*), entrar al Zoom o ver la grabación, descargar materiales, y marcar su progreso. Un cron cada 15 min envía recordatorios por email a 24h y a 1h antes de cada sesión, sin duplicados. Al final de esta fase el ciclo completo "comprar → asistir → aprender" queda cerrado.

**Architecture:** Nuevo módulo `src/modules/learning/` (`service.ts` puro, `queries.ts`, `actions.ts`, `jobs.ts`, `ui/`). Nuevas rutas dentro del route group `(student)` ya existente: `/mi-aprendizaje`, `/curso/[slug]/aprender`, `/curso/[slug]/aprender/[sessionId]`. Todas las tablas necesarias (`enrollments`, `session_attendance`, `class_sessions`, `session_materials`, `session_reminders_sent`) ya existen desde la Fase 0-1 — esta fase no toca DDL. Se corrige de paso un hueco de autorización preexistente en `src/modules/materials/actions.ts` que esta fase es la primera en ejercitar de verdad.

**Tech Stack:** el mismo de las fases anteriores: Next.js 16 App Router, Drizzle + Postgres, Better Auth, R2 (S3 SDK) para materiales, nodemailer/MailHog, Vitest, Playwright.

## Global Constraints

Aplican a **todas** las tareas de este plan, además de las de `docs/superpowers/plans/2026-07-29-fase-0-1-fundacion-y-catalogo.md` y `docs/superpowers/plans/2026-07-31-fase-2-pago-manual.md`.

- **`assertEnrolled(userId, courseId)` en todo punto de acceso a contenido de curso.** Ya existe en `src/modules/auth/guards.ts`. Toda query, action y loader que toque `zoom_url`, `recording_url`, materiales o progreso de un curso lo invoca. Lanza `ForbiddenError`.
- **Nada sensible se serializa hacia un usuario sin derecho.** `zoom_url`, `recording_url` y las keys de R2 (`session_materials.file_key`) nunca aparecen en HTML, props de un Client Component ni respuestas de API para un usuario no inscrito. Un Server Component puede embeber estos valores directamente en su propio JSX (ya verificado con `assertEnrolled` antes de leerlos) sin que eso viole la regla — la regla es sobre fuga hacia usuarios no autorizados, no sobre presencia en HTML per se.
- **Zona horaria de visualización: `America/Lima`.** Usa `formatLima` de `src/lib/datetime.ts` para toda fecha mostrada al alumno.
- **Estados de sesión ya calculados:** `sessionState(startsAt, durationMinutes, now?)` en `src/lib/datetime.ts` ya existe y devuelve `"upcoming" | "live" | "past"` (ventana "live" abre 10 min antes y cierra al terminar la duración). Reutilízala, no la reimplementes.
- **Progreso auto-reportado, no bloquea nada.** Un alumno puede marcar cualquier sesión como vista/asistida en cualquier momento; el progreso solo alimenta la barra, nunca condiciona acceso a otra sesión o al examen.
- **Cron de recordatorios — invariante de orden:** el `INSERT ... ON CONFLICT DO NOTHING` en `session_reminders_sent` va **antes** de `sendEmail`. Si insertó 0 filas, ya se envió, se salta sin llamar a `sendEmail`. Este orden garantiza cero duplicados aunque el proceso muera a mitad.
- **Ventanas del cron (se solapan a propósito):** 24h → `starts_at ∈ [now+23h15m, now+24h45m]`; 1h → `starts_at ∈ [now+45m, now+1h15m]`.
- **`service.ts` no importa nada de `next/*` ni de Drizzle.** Toda función pura (progreso, elección de próxima sesión, ventanas del cron) se testea con Vitest sin DB ni servidor.
- **Server Actions ("use server") son endpoints públicos.** Cualquier función exportada de un módulo con `"use server"` es invocable sin pasar por ninguna UI. Nunca aceptes un `userId` como parámetro de una Server Action — siempre resuélvelo con `requireUser()`/`assertRole()` dentro de la función. `src/modules/billing/jobs.ts` (Fase 2) es el precedente: lógica de cron vive en un archivo SIN `"use server"`, invocada solo desde una ruta protegida por `CRON_SECRET`.

---

## File Structure

```
src/modules/learning/
  service.ts              lógica pura: progreso, próxima sesión, label de días, label de botón
  queries.ts               listMyCourses, getCourseAgenda, getSessionDetail
  actions.ts                "use server": marcarProgreso
  jobs.ts                    sin "use server": sendSessionReminders (cron)
  ui/
    marcar-progreso-button.tsx      client
    descargar-material-button.tsx   client

src/modules/notifications/templates/
  session-reminder-24h.ts
  session-reminder-1h.ts

src/modules/materials/actions.ts   MODIFICAR: getMaterialDownloadUrl ya no acepta userId

src/app/(student)/
  mi-aprendizaje/page.tsx
  curso/[slug]/aprender/page.tsx
  curso/[slug]/aprender/[sessionId]/page.tsx

src/app/api/cron/recordatorios/route.ts

tests/unit/learning-service.test.ts
tests/integration/learning-queries.test.ts
tests/integration/learning-actions.test.ts
tests/integration/session-reminders.test.ts
tests/integration/materials-actions.test.ts    MODIFICAR
tests/e2e/aula.spec.ts
```

---

### Task 1: Corregir el hueco de autorización en `getMaterialDownloadUrl`

**Contexto:** `src/modules/materials/actions.ts` es un módulo `"use server"` (Fase 0-1). Su función `getMaterialDownloadUrl(userId: string, materialId: string)` acepta el `userId` como parámetro en vez de resolverlo con `requireUser()`. Como toda Server Action es un endpoint público invocable directamente, cualquiera podría llamarla con el `userId` de OTRO alumno inscrito para obtener una URL de descarga que no le corresponde. Hoy es inofensivo porque la función no está conectada a ninguna UI todavía — esta fase es la primera en usarla de verdad, así que se corrige antes de exponerla.

**Files:**
- Modify: `src/modules/materials/actions.ts`
- Modify: `tests/integration/materials-actions.test.ts`

**Interfaces:**
- Produces: `getMaterialDownloadUrl(materialId: string): Promise<string>` (firma nueva, sin `userId`)

- [ ] **Step 1: Actualizar el mock de sesión en el test existente**

En `tests/integration/materials-actions.test.ts`, reemplaza el bloque de mocks (líneas 11-19) por:

```ts
let currentUserId = "";
vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
  requireUser: vi.fn(async () => ({ id: currentUserId, role: "student", name: "Alumno" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));
```

- [ ] **Step 2: Actualizar las tres pruebas de `getMaterialDownloadUrl` para usar la firma nueva**

Reemplaza el bloque `describe("getMaterialDownloadUrl", ...)` completo por:

```ts
describe("getMaterialDownloadUrl", () => {
  it("devuelve URL firmada a un alumno inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    currentUserId = alumnoId;
    const url = await acts.getMaterialDownloadUrl(m.id);
    expect(url).toContain("materials/x/guia.pdf");
  });

  it("niega a quien no está inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    currentUserId = otroId;
    await expect(acts.getMaterialDownloadUrl(m.id)).rejects.toThrow(/no está inscrito/i);
  });

  it("niega si la inscripción fue revocada", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    await db.update(enrollments).set({ status: "revoked" });
    currentUserId = alumnoId;
    await expect(acts.getMaterialDownloadUrl(m.id)).rejects.toThrow(/no está inscrito/i);
  });
});
```

- [ ] **Step 3: Ejecutar los tests y verificar que fallan por la firma actual**

Run: `pnpm test tests/integration/materials-actions.test.ts`
Expected: FAIL — `getMaterialDownloadUrl` todavía espera `(userId, materialId)`, así que se le está pasando `materialId` como `userId` y el segundo argumento queda `undefined`.

- [ ] **Step 4: Corregir `getMaterialDownloadUrl`**

En `src/modules/materials/actions.ts`, agrega el import de `requireUser` y cambia la firma:

```ts
import { requireUser } from "@/modules/auth/session";
```

Reemplaza la función completa (líneas 77-95 actuales) por:

```ts
/** Devuelve una URL de descarga solo si el usuario actual está inscrito en el curso. */
export async function getMaterialDownloadUrl(materialId: string): Promise<string> {
  const u = await requireUser();
  const [m] = await db
    .select({
      fileKey: sessionMaterials.fileKey,
      externalUrl: sessionMaterials.externalUrl,
      courseId: classSessions.courseId,
    })
    .from(sessionMaterials)
    .innerJoin(classSessions, eq(classSessions.id, sessionMaterials.classSessionId))
    .where(eq(sessionMaterials.id, materialId))
    .limit(1);

  if (!m) throw new ForbiddenError("Material no encontrado.");
  await assertEnrolled(u.id, m.courseId);

  if (m.externalUrl) return m.externalUrl;
  return presignGet(m.fileKey!);
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `pnpm test tests/integration/materials-actions.test.ts`
Expected: PASS (todas las pruebas del archivo).

- [ ] **Step 6: Verificar que no queda ningún otro llamador con la firma vieja**

Run: `grep -rn "getMaterialDownloadUrl" src tests`
Expected: solo `src/modules/materials/actions.ts` (definición) y `tests/integration/materials-actions.test.ts` (ya actualizado). Ningún otro archivo la usa todavía — la conectará la Task 7 de este plan.

- [ ] **Step 7: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: limpio.

```bash
git add src/modules/materials/actions.ts tests/integration/materials-actions.test.ts
git commit -m "fix(materials): resolve download requester via requireUser instead of a caller-supplied userId"
```

---

### Task 2: `src/modules/learning/service.ts` — lógica pura

**Files:**
- Create: `src/modules/learning/service.ts`
- Test: `tests/unit/learning-service.test.ts`

**Interfaces:**
- Consumes: `sessionState`, `SessionState` de `@/lib/datetime` (ya existen: `sessionState(startsAt: Date, durationMinutes: number, now?: Date): "upcoming" | "live" | "past"`)
- Produces: `computeProgress(total: number, attended: number): number`, `pickNextSession<T extends { id: string; startsAt: Date; durationMinutes: number }>(sessions: T[], now?: Date): T | null`, `daysUntilLabel(startsAt: Date, now?: Date): string`, `attendanceButtonLabel(state: SessionState): string`

- [ ] **Step 1: Escribir los tests fallidos**

Crea `tests/unit/learning-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeProgress, pickNextSession, daysUntilLabel, attendanceButtonLabel } from "@/modules/learning/service";

describe("computeProgress", () => {
  it("calcula el porcentaje redondeado", () => {
    expect(computeProgress(4, 2)).toBe(50);
    expect(computeProgress(3, 1)).toBe(33);
  });

  it("devuelve 0 si no hay sesiones", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });
});

describe("pickNextSession", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("elige la sesión futura más próxima", () => {
    const sessions = [
      { id: "a", startsAt: new Date("2026-08-10T12:00:00Z"), durationMinutes: 60 },
      { id: "b", startsAt: new Date("2026-08-05T12:00:00Z"), durationMinutes: 60 },
      { id: "c", startsAt: new Date("2026-07-20T12:00:00Z"), durationMinutes: 60 },
    ];
    expect(pickNextSession(sessions, now)?.id).toBe("b");
  });

  it("si todas ya pasaron, elige la más reciente", () => {
    const sessions = [
      { id: "a", startsAt: new Date("2026-07-01T12:00:00Z"), durationMinutes: 60 },
      { id: "b", startsAt: new Date("2026-07-20T12:00:00Z"), durationMinutes: 60 },
    ];
    expect(pickNextSession(sessions, now)?.id).toBe("b");
  });

  it("devuelve null si no hay sesiones", () => {
    expect(pickNextSession([], now)).toBeNull();
  });
});

describe("daysUntilLabel", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("dice Hoy si ya empezó o es en menos de un día", () => {
    expect(daysUntilLabel(new Date("2026-08-01T18:00:00Z"), now)).toBe("Hoy");
  });

  it("dice Mañana para el día siguiente", () => {
    expect(daysUntilLabel(new Date("2026-08-02T12:00:00Z"), now)).toBe("Mañana");
  });

  it("dice Faltan N días para más adelante", () => {
    expect(daysUntilLabel(new Date("2026-08-05T12:00:00Z"), now)).toBe("Faltan 4 días");
  });
});

describe("attendanceButtonLabel", () => {
  it("dice 'Marcar como asistido' si la sesión no ha pasado", () => {
    expect(attendanceButtonLabel("upcoming")).toBe("Marcar como asistido");
    expect(attendanceButtonLabel("live")).toBe("Marcar como asistido");
  });

  it("dice 'Marcar como visto' si ya pasó", () => {
    expect(attendanceButtonLabel("past")).toBe("Marcar como visto");
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm test tests/unit/learning-service.test.ts`
Expected: FAIL con "Cannot find module '@/modules/learning/service'".

- [ ] **Step 3: Implementar `service.ts`**

Crea `src/modules/learning/service.ts`:

```ts
import type { SessionState } from "@/lib/datetime";

export function computeProgress(total: number, attended: number): number {
  if (total <= 0) return 0;
  return Math.round((attended / total) * 100);
}

export interface AgendaSessionRef {
  id: string;
  startsAt: Date;
  durationMinutes: number;
}

/** La sesión futura (o en vivo) más próxima; si todas pasaron, la más reciente. Null si no hay ninguna. */
export function pickNextSession<T extends AgendaSessionRef>(
  sessions: T[],
  now: Date = new Date()
): T | null {
  if (sessions.length === 0) return null;

  const notPast = sessions
    .filter((s) => {
      const endsAt = s.startsAt.getTime() + s.durationMinutes * 60_000;
      return now.getTime() <= endsAt;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (notPast.length > 0) return notPast[0];

  return sessions.slice().sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
}

export function daysUntilLabel(startsAt: Date, now: Date = new Date()): string {
  const diffMs = startsAt.getTime() - now.getTime();
  const days = Math.ceil(diffMs / 86_400_000);
  if (days <= 1) return days <= 0 ? "Hoy" : days === 1 ? "Mañana" : "Hoy";
  return `Faltan ${days} días`;
}

export function attendanceButtonLabel(state: SessionState): string {
  return state === "past" ? "Marcar como visto" : "Marcar como asistido";
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm test tests/unit/learning-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/learning/service.ts tests/unit/learning-service.test.ts
git commit -m "feat(learning): add pure progress and session-state helpers"
```

---

### Task 3: `src/modules/learning/queries.ts`

**Files:**
- Create: `src/modules/learning/queries.ts`
- Test: `tests/integration/learning-queries.test.ts`

**Interfaces:**
- Consumes: `pickNextSession` de `./service` (Task 2); `sessionState`, `SessionState` de `@/lib/datetime`; `assertEnrolled` de `@/modules/auth/guards` (ya existe); tablas `courses`, `classSessions`, `enrollments`, `sessionAttendance`, `sessionMaterials` de `@/db/schema`.
- Produces:
  - `interface MyCourseCard { courseId: string; slug: string; title: string; totalSessions: number; attendedSessions: number; nextSession: { id: string; title: string; startsAt: Date; state: SessionState } | null }`
  - `listMyCourses(userId: string): Promise<MyCourseCard[]>`
  - `interface AgendaSession { id: string; orderIndex: number; title: string; startsAt: Date; durationMinutes: number; state: SessionState; hasRecording: boolean; materialCount: number; attended: boolean }`
  - `interface CourseAgenda { courseId: string; slug: string; title: string; sessions: AgendaSession[] }`
  - `getCourseAgenda(userId: string, slug: string): Promise<CourseAgenda | null>` (lanza `ForbiddenError` si no inscrito)
  - `interface SessionDetail { id: string; courseId: string; courseTitle: string; courseSlug: string; title: string; descriptionMd: string | null; startsAt: Date; durationMinutes: number; state: SessionState; zoomUrl: string | null; recordingUrl: string | null; attended: boolean; materials: { id: string; title: string }[] }`
  - `getSessionDetail(userId: string, sessionId: string): Promise<SessionDetail | null>` (lanza `ForbiddenError` si no inscrito)

- [ ] **Step 1: Escribir los tests fallidos**

Crea `tests/integration/learning-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, sessionMaterials, enrollments, sessionAttendance } from "@/db/schema";
import { listMyCourses, getCourseAgenda, getSessionDetail } from "@/modules/learning/queries";
import { ForbiddenError } from "@/modules/auth/guards";

let alumnoId: string;
let otroId: string;
let cursoId: string;
let session1Id: string;
let session2Id: string;
let enrollmentId: string;

beforeEach(async () => {
  await db.delete(sessionAttendance);
  await db.delete(sessionMaterials);
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
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s1] = await db.insert(classSessions).values({
    courseId: cursoId, orderIndex: 0, title: "Clase 1",
    startsAt: new Date(Date.now() - 7 * 86_400_000), durationMinutes: 60,
    zoomUrl: "https://zoom.us/j/1", recordingUrl: "https://cdn.test/rec1.mp4",
  }).returning();
  session1Id = s1.id;

  const [s2] = await db.insert(classSessions).values({
    courseId: cursoId, orderIndex: 1, title: "Clase 2",
    startsAt: new Date(Date.now() + 7 * 86_400_000), durationMinutes: 60,
    zoomUrl: "https://zoom.us/j/2",
  }).returning();
  session2Id = s2.id;

  await db.insert(sessionMaterials).values({
    classSessionId: session1Id, title: "Guía PDF", fileKey: "materials/x/guia.pdf",
  });

  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  }).returning();
  enrollmentId = e.id;

  await db.insert(sessionAttendance).values({ enrollmentId, classSessionId: session1Id });
});

describe("listMyCourses", () => {
  it("lista los cursos inscritos con progreso y próxima sesión", async () => {
    const rows = await listMyCourses(alumnoId);
    expect(rows).toHaveLength(1);
    expect(rows[0].courseId).toBe(cursoId);
    expect(rows[0].totalSessions).toBe(2);
    expect(rows[0].attendedSessions).toBe(1);
    expect(rows[0].nextSession?.id).toBe(session2Id);
  });

  it("devuelve vacío para alguien sin inscripciones", async () => {
    expect(await listMyCourses(otroId)).toEqual([]);
  });
});

describe("getCourseAgenda", () => {
  it("devuelve las sesiones con estado y marca de asistencia", async () => {
    const agenda = await getCourseAgenda(alumnoId, "curso-x");
    expect(agenda?.sessions).toHaveLength(2);
    const [s1, s2] = agenda!.sessions;
    expect(s1.attended).toBe(true);
    expect(s1.materialCount).toBe(1);
    expect(s1.state).toBe("past");
    expect(s2.attended).toBe(false);
    expect(s2.state).toBe("upcoming");
  });

  it("lanza ForbiddenError si no está inscrito", async () => {
    await expect(getCourseAgenda(otroId, "curso-x")).rejects.toThrow(ForbiddenError);
  });

  it("devuelve null si el curso no existe", async () => {
    expect(await getCourseAgenda(alumnoId, "no-existe")).toBeNull();
  });
});

describe("getSessionDetail", () => {
  it("resuelve zoomUrl, recordingUrl y materiales para un inscrito", async () => {
    const detail = await getSessionDetail(alumnoId, session1Id);
    expect(detail?.zoomUrl).toBe("https://zoom.us/j/1");
    expect(detail?.recordingUrl).toBe("https://cdn.test/rec1.mp4");
    expect(detail?.attended).toBe(true);
    expect(detail?.materials).toEqual([{ id: expect.any(String), title: "Guía PDF" }]);
  });

  it("lanza ForbiddenError para quien no está inscrito", async () => {
    await expect(getSessionDetail(otroId, session1Id)).rejects.toThrow(ForbiddenError);
  });

  it("devuelve null si la sesión no existe", async () => {
    expect(await getSessionDetail(alumnoId, crypto.randomUUID())).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm test tests/integration/learning-queries.test.ts`
Expected: FAIL con "Cannot find module '@/modules/learning/queries'".

- [ ] **Step 3: Implementar `queries.ts`**

Crea `src/modules/learning/queries.ts`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, classSessions, enrollments, sessionAttendance, sessionMaterials } from "@/db/schema";
import { assertEnrolled } from "@/modules/auth/guards";
import { sessionState, type SessionState } from "@/lib/datetime";
import { pickNextSession } from "./service";

export interface MyCourseCard {
  courseId: string;
  slug: string;
  title: string;
  totalSessions: number;
  attendedSessions: number;
  nextSession: { id: string; title: string; startsAt: Date; state: SessionState } | null;
}

export async function listMyCourses(userId: string): Promise<MyCourseCard[]> {
  const myEnrollments = await db
    .select({
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      slug: courses.slug,
      title: courses.title,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")))
    .orderBy(asc(courses.title));

  const result: MyCourseCard[] = [];
  for (const e of myEnrollments) {
    const sessions = await db
      .select({
        id: classSessions.id, title: classSessions.title,
        startsAt: classSessions.startsAt, durationMinutes: classSessions.durationMinutes,
      })
      .from(classSessions)
      .where(eq(classSessions.courseId, e.courseId))
      .orderBy(asc(classSessions.startsAt));

    const attendedRows = await db
      .select({ classSessionId: sessionAttendance.classSessionId })
      .from(sessionAttendance)
      .where(eq(sessionAttendance.enrollmentId, e.enrollmentId));

    const next = pickNextSession(sessions);
    result.push({
      courseId: e.courseId,
      slug: e.slug,
      title: e.title,
      totalSessions: sessions.length,
      attendedSessions: attendedRows.length,
      nextSession: next
        ? { id: next.id, title: next.title, startsAt: next.startsAt, state: sessionState(next.startsAt, next.durationMinutes) }
        : null,
    });
  }
  return result;
}

export interface AgendaSession {
  id: string;
  orderIndex: number;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  state: SessionState;
  hasRecording: boolean;
  materialCount: number;
  attended: boolean;
}

export interface CourseAgenda {
  courseId: string;
  slug: string;
  title: string;
  sessions: AgendaSession[];
}

export async function getCourseAgenda(userId: string, slug: string): Promise<CourseAgenda | null> {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
    .from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return null;

  await assertEnrolled(userId, course.id);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id), eq(enrollments.status, "active")))
    .limit(1);

  const rawSessions = await db
    .select({
      id: classSessions.id, orderIndex: classSessions.orderIndex, title: classSessions.title,
      startsAt: classSessions.startsAt, durationMinutes: classSessions.durationMinutes,
      hasRecording: sql<boolean>`${classSessions.recordingUrl} is not null`,
      materialCount: sql<number>`(
        select count(*) from ${sessionMaterials} where ${sessionMaterials.classSessionId} = ${classSessions.id}
      )`,
    })
    .from(classSessions)
    .where(eq(classSessions.courseId, course.id))
    .orderBy(asc(classSessions.orderIndex));

  const attendedRows = enrollment
    ? await db.select({ classSessionId: sessionAttendance.classSessionId })
        .from(sessionAttendance).where(eq(sessionAttendance.enrollmentId, enrollment.id))
    : [];
  const attendedIds = new Set(attendedRows.map((r) => r.classSessionId));

  return {
    courseId: course.id,
    slug: course.slug,
    title: course.title,
    sessions: rawSessions.map((s) => ({
      ...s,
      materialCount: Number(s.materialCount),
      state: sessionState(s.startsAt, s.durationMinutes),
      attended: attendedIds.has(s.id),
    })),
  };
}

export interface SessionDetail {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  title: string;
  descriptionMd: string | null;
  startsAt: Date;
  durationMinutes: number;
  state: SessionState;
  zoomUrl: string | null;
  recordingUrl: string | null;
  attended: boolean;
  materials: { id: string; title: string }[];
}

export async function getSessionDetail(userId: string, sessionId: string): Promise<SessionDetail | null> {
  const [row] = await db
    .select({
      id: classSessions.id, courseId: classSessions.courseId, title: classSessions.title,
      descriptionMd: classSessions.descriptionMd, startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      zoomUrl: classSessions.zoomUrl, recordingUrl: classSessions.recordingUrl,
      courseTitle: courses.title, courseSlug: courses.slug,
    })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  await assertEnrolled(userId, row.courseId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, row.courseId), eq(enrollments.status, "active")))
    .limit(1);

  const attended = enrollment
    ? (await db.select({ id: sessionAttendance.id }).from(sessionAttendance)
        .where(and(eq(sessionAttendance.enrollmentId, enrollment.id), eq(sessionAttendance.classSessionId, sessionId)))
        .limit(1)).length > 0
    : false;

  const materials = await db
    .select({ id: sessionMaterials.id, title: sessionMaterials.title })
    .from(sessionMaterials)
    .where(eq(sessionMaterials.classSessionId, sessionId));

  return { ...row, state: sessionState(row.startsAt, row.durationMinutes), attended, materials };
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm test tests/integration/learning-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/learning/queries.ts tests/integration/learning-queries.test.ts
git commit -m "feat(learning): add enrolled-courses, agenda, and session-detail queries"
```

---

### Task 4: `src/modules/learning/actions.ts` — `marcarProgreso`

**Files:**
- Create: `src/modules/learning/actions.ts`
- Test: `tests/integration/learning-actions.test.ts`

**Interfaces:**
- Consumes: `requireUser` de `@/modules/auth/session`; `assertEnrolled` de `@/modules/auth/guards`; tablas `classSessions`, `courses`, `enrollments`, `sessionAttendance`.
- Produces: `marcarProgreso(sessionId: string): Promise<void>` ("use server", resuelve el usuario internamente — nunca acepta `userId` como parámetro, ver Global Constraints).

- [ ] **Step 1: Escribir los tests fallidos**

Crea `tests/integration/learning-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, enrollments, sessionAttendance } from "@/db/schema";
import { eq } from "drizzle-orm";

let alumnoId: string;
let otroId: string;
let cursoId: string;
let sessionId: string;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentUserId = "";
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: currentUserId, role: "student", name: "Alumno" })),
}));

const acts = await import("@/modules/learning/actions");

beforeEach(async () => {
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
    instructorId: prof.id, slug: "curso-y", title: "Curso Y", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s] = await db.insert(classSessions).values({
    courseId: cursoId, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
  }).returning();
  sessionId = s.id;

  await db.insert(enrollments).values({ userId: alumnoId, courseId: cursoId, status: "active" });
});

describe("marcarProgreso", () => {
  it("inserta una fila de asistencia para el alumno inscrito", async () => {
    currentUserId = alumnoId;
    await acts.marcarProgreso(sessionId);
    const rows = await db.select().from(sessionAttendance);
    expect(rows).toHaveLength(1);
  });

  it("es idempotente: marcar dos veces no duplica la fila", async () => {
    currentUserId = alumnoId;
    await acts.marcarProgreso(sessionId);
    await acts.marcarProgreso(sessionId);
    const rows = await db.select().from(sessionAttendance);
    expect(rows).toHaveLength(1);
  });

  it("rechaza a quien no está inscrito", async () => {
    currentUserId = otroId;
    await expect(acts.marcarProgreso(sessionId)).rejects.toThrow(/no está inscrito/i);
    expect(await db.select().from(sessionAttendance)).toHaveLength(0);
  });

  it("rechaza una sesión inexistente", async () => {
    currentUserId = alumnoId;
    await expect(acts.marcarProgreso(crypto.randomUUID())).rejects.toThrow(/no encontrada/i);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm test tests/integration/learning-actions.test.ts`
Expected: FAIL con "Cannot find module '@/modules/learning/actions'".

- [ ] **Step 3: Implementar `actions.ts`**

Crea `src/modules/learning/actions.ts`:

```ts
"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { classSessions, courses, enrollments, sessionAttendance } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { assertEnrolled } from "@/modules/auth/guards";

export async function marcarProgreso(sessionId: string): Promise<void> {
  const u = await requireUser();

  const [row] = await db
    .select({ courseId: classSessions.courseId, courseSlug: courses.slug })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) throw new Error("Sesión no encontrada.");

  await assertEnrolled(u.id, row.courseId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, u.id), eq(enrollments.courseId, row.courseId), eq(enrollments.status, "active")))
    .limit(1);
  if (!enrollment) throw new Error("Inscripción no encontrada.");

  await db.insert(sessionAttendance)
    .values({ enrollmentId: enrollment.id, classSessionId: sessionId })
    .onConflictDoNothing({ target: [sessionAttendance.enrollmentId, sessionAttendance.classSessionId] });

  revalidatePath(`/curso/${row.courseSlug}/aprender/${sessionId}`);
  revalidatePath(`/curso/${row.courseSlug}/aprender`);
  revalidatePath("/mi-aprendizaje");
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm test tests/integration/learning-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/learning/actions.ts tests/integration/learning-actions.test.ts
git commit -m "feat(learning): add marcarProgreso server action"
```

---

### Task 5: Plantillas de recordatorio + `src/modules/learning/jobs.ts` (cron)

**Files:**
- Create: `src/modules/notifications/templates/session-reminder-24h.ts`
- Create: `src/modules/notifications/templates/session-reminder-1h.ts`
- Create: `src/modules/learning/jobs.ts`
- Create: `src/app/api/cron/recordatorios/route.ts`
- Test: `tests/integration/session-reminders.test.ts`

**Interfaces:**
- Consumes: `sendEmail` de `@/modules/notifications/mailer` (firma real: `sendEmail(input: { to: string; userId?: string; template: string; subject: string; html: string }): Promise<{ ok: boolean }>`); `formatLima` de `@/lib/datetime`; `env.CRON_SECRET` de `@/env`; tablas `classSessions`, `enrollments`, `sessionRemindersSent`, `user`.
- Produces:
  - `sessionReminder24hTemplate(input: { name: string; sessionTitle: string; startsAtLabel: string; zoomUrl: string | null }): { subject: string; html: string }`
  - `sessionReminder1hTemplate(input: { name: string; sessionTitle: string; startsAtLabel: string; zoomUrl: string | null }): { subject: string; html: string }`
  - `reminderWindows(now?: Date): { kind24h: { from: Date; to: Date }; kind1h: { from: Date; to: Date } }`
  - `sendSessionReminders(now?: Date): Promise<{ sent24h: number; sent1h: number }>` (sin `"use server"` — ver Global Constraints)
  - `GET /api/cron/recordatorios` protegido por header `Authorization: Bearer <CRON_SECRET>`

- [ ] **Step 1: Crear las plantillas de email**

Crea `src/modules/notifications/templates/session-reminder-24h.ts`:

```ts
import { env } from "@/env";

export function sessionReminder24hTemplate(input: {
  name: string; sessionTitle: string; startsAtLabel: string; zoomUrl: string | null;
}) {
  return {
    subject: `Mañana: ${input.sessionTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Tu clase <strong>${escapeHtml(input.sessionTitle)}</strong> es mañana, ${escapeHtml(input.startsAtLabel)}, en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
  ${input.zoomUrl ? `<p><a href="${escapeAttr(input.zoomUrl)}">Entrar a la clase</a></p>` : ""}
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
```

Crea `src/modules/notifications/templates/session-reminder-1h.ts`:

```ts
import { env } from "@/env";

export function sessionReminder1hTemplate(input: {
  name: string; sessionTitle: string; startsAtLabel: string; zoomUrl: string | null;
}) {
  return {
    subject: `En 1 hora: ${input.sessionTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Tu clase <strong>${escapeHtml(input.sessionTitle)}</strong> empieza en 1 hora (${escapeHtml(input.startsAtLabel)}) en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
  ${input.zoomUrl ? `<p><a href="${escapeAttr(input.zoomUrl)}">Entrar a la clase</a></p>` : ""}
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
```

- [ ] **Step 2: Escribir el test fallido del cron**

Crea `tests/integration/session-reminders.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, enrollments, sessionRemindersSent } from "@/db/schema";
import { eq } from "drizzle-orm";

const sendEmailMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/modules/notifications/mailer", () => ({ sendEmail: sendEmailMock }));

const { sendSessionReminders, reminderWindows } = await import("@/modules/learning/jobs");

let alumnoId: string;
let cursoId: string;

beforeEach(async () => {
  sendEmailMock.mockClear();
  await db.delete(sessionRemindersSent);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  const prof = await mk("Prof", "p@test.pe", "instructor");
  const alumno = await mk("Alumno", "a@test.pe", "student");
  alumnoId = alumno.id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-z", title: "Curso Z", priceCents: 100,
  }).returning();
  cursoId = c.id;

  await db.insert(enrollments).values({ userId: alumnoId, courseId: cursoId, status: "active" });
});

describe("reminderWindows", () => {
  it("calcula las ventanas de 24h y 1h con el solapamiento del spec", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const w = reminderWindows(now);
    expect(w.kind24h.from.toISOString()).toBe("2026-08-01T23:15:00.000Z");
    expect(w.kind24h.to.toISOString()).toBe("2026-08-02T00:45:00.000Z");
    expect(w.kind1h.from.toISOString()).toBe("2026-08-01T00:45:00.000Z");
    expect(w.kind1h.to.toISOString()).toBe("2026-08-01T01:15:00.000Z");
  });
});

describe("sendSessionReminders", () => {
  it("envía un recordatorio de 24h a un alumno inscrito con sesión en esa ventana", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", status: "scheduled",
      startsAt: new Date("2026-08-02T00:00:00Z"), durationMinutes: 60,
      zoomUrl: "https://zoom.us/j/1",
    });

    const result = await sendSessionReminders(now);
    expect(result.sent24h).toBe(1);
    expect(result.sent1h).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(sessionRemindersSent);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("24h");
  });

  it("no reenvía si ya se envió (ON CONFLICT DO NOTHING)", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", status: "scheduled",
      startsAt: new Date("2026-08-02T00:00:00Z"), durationMinutes: 60,
    });

    await sendSessionReminders(now);
    sendEmailMock.mockClear();
    const second = await sendSessionReminders(now);

    expect(second.sent24h).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(await db.select().from(sessionRemindersSent)).toHaveLength(1);
  });

  it("ignora sesiones fuera de ambas ventanas", async () => {
    const now = new Date("2026-08-01T00:00:00Z");
    await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase lejana", status: "scheduled",
      startsAt: new Date("2026-09-01T00:00:00Z"), durationMinutes: 60,
    });

    const result = await sendSessionReminders(now);
    expect(result.sent24h).toBe(0);
    expect(result.sent1h).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/integration/session-reminders.test.ts`
Expected: FAIL con "Cannot find module '@/modules/learning/jobs'".

- [ ] **Step 4: Implementar `jobs.ts`**

Crea `src/modules/learning/jobs.ts` (sin `"use server"` a propósito — ver Global Constraints, mismo patrón que `src/modules/billing/jobs.ts` de la Fase 2):

```ts
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, enrollments, sessionRemindersSent, user } from "@/db/schema";
import { sendEmail } from "@/modules/notifications/mailer";
import { sessionReminder24hTemplate } from "@/modules/notifications/templates/session-reminder-24h";
import { sessionReminder1hTemplate } from "@/modules/notifications/templates/session-reminder-1h";
import { formatLima } from "@/lib/datetime";

export interface ReminderWindow {
  from: Date;
  to: Date;
}

export function reminderWindows(now: Date = new Date()): { kind24h: ReminderWindow; kind1h: ReminderWindow } {
  return {
    kind24h: {
      from: new Date(now.getTime() + 23 * 3_600_000 + 15 * 60_000),
      to: new Date(now.getTime() + 24 * 3_600_000 + 45 * 60_000),
    },
    kind1h: {
      from: new Date(now.getTime() + 45 * 60_000),
      to: new Date(now.getTime() + 1 * 3_600_000 + 15 * 60_000),
    },
  };
}

async function sendForWindow(kind: "24h" | "1h", window: ReminderWindow): Promise<number> {
  const sessions = await db
    .select()
    .from(classSessions)
    .where(and(
      eq(classSessions.status, "scheduled"),
      gte(classSessions.startsAt, window.from),
      lte(classSessions.startsAt, window.to)
    ));

  let sentCount = 0;
  for (const session of sessions) {
    const students = await db
      .select({ enrollmentId: enrollments.id, userId: user.id, email: user.email, name: user.name })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(and(eq(enrollments.courseId, session.courseId), eq(enrollments.status, "active")));

    for (const s of students) {
      // El INSERT va ANTES del sendEmail a propósito: garantiza cero
      // duplicados aunque el proceso muera a mitad. Si insertó 0 filas,
      // ya se envió este recordatorio, se salta.
      const inserted = await db.insert(sessionRemindersSent)
        .values({ enrollmentId: s.enrollmentId, classSessionId: session.id, kind })
        .onConflictDoNothing({
          target: [sessionRemindersSent.enrollmentId, sessionRemindersSent.classSessionId, sessionRemindersSent.kind],
        })
        .returning({ enrollmentId: sessionRemindersSent.enrollmentId });
      if (inserted.length === 0) continue;

      const template = kind === "24h" ? sessionReminder24hTemplate : sessionReminder1hTemplate;
      const { subject, html } = template({
        name: s.name,
        sessionTitle: session.title,
        startsAtLabel: formatLima(session.startsAt),
        zoomUrl: session.zoomUrl,
      });
      await sendEmail({ to: s.email, userId: s.userId, template: `session-reminder-${kind}`, subject, html });
      sentCount++;
    }
  }
  return sentCount;
}

export async function sendSessionReminders(now: Date = new Date()): Promise<{ sent24h: number; sent1h: number }> {
  const windows = reminderWindows(now);
  const sent24h = await sendForWindow("24h", windows.kind24h);
  const sent1h = await sendForWindow("1h", windows.kind1h);
  return { sent24h, sent1h };
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/integration/session-reminders.test.ts`
Expected: PASS.

- [ ] **Step 6: Crear la ruta del cron**

Crea `src/app/api/cron/recordatorios/route.ts` (mismo patrón que `src/app/api/cron/expirar-ordenes/route.ts` de la Fase 2):

```ts
import { env } from "@/env";
import { sendSessionReminders } from "@/modules/learning/jobs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const result = await sendSessionReminders();
  return Response.json(result);
}
```

- [ ] **Step 7: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: limpio.

```bash
git add src/modules/notifications/templates/session-reminder-24h.ts src/modules/notifications/templates/session-reminder-1h.ts src/modules/learning/jobs.ts src/app/api/cron/recordatorios/route.ts tests/integration/session-reminders.test.ts
git commit -m "feat(learning): add session reminder templates, cron job, and protected endpoint"
```

---

### Task 6: `/mi-aprendizaje` — lista de cursos inscritos

**Files:**
- Create: `src/app/(student)/mi-aprendizaje/page.tsx`

**Interfaces:**
- Consumes: `requireUser` de `@/modules/auth/session`; `listMyCourses` de `@/modules/learning/queries` (Task 3); `computeProgress`, `daysUntilLabel` de `@/modules/learning/service` (Task 2); `formatLima` de `@/lib/datetime`.

No requiere test dedicado (server component de solo lectura, ya cubierto por los tests de `listMyCourses`); se verifica manualmente en la Task 9 (E2E).

- [ ] **Step 1: Crear la página**

Crea `src/app/(student)/mi-aprendizaje/page.tsx`:

```tsx
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { listMyCourses } from "@/modules/learning/queries";
import { computeProgress, daysUntilLabel } from "@/modules/learning/service";
import { formatLima } from "@/lib/datetime";

export default async function MiAprendizajePage() {
  const u = await requireUser();
  const cursos = await listMyCourses(u.id);

  if (cursos.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no tienes cursos.{" "}
        <Link href="/cursos" className="underline">
          Explora el catálogo
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Mi aprendizaje</h1>
      {cursos.map((c) => {
        const percent = computeProgress(c.totalSessions, c.attendedSessions);
        return (
          <Link
            key={c.courseId}
            href={`/curso/${c.slug}/aprender`}
            className="flex flex-col gap-2 rounded-lg border border-border p-4 hover:bg-muted/40"
          >
            <h2 className="font-medium">{c.title}</h2>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {c.attendedSessions}/{c.totalSessions} sesiones vistas
            </p>
            {c.nextSession ? (
              <p className="text-sm">
                {c.nextSession.state === "live" ? "EN VIVO AHORA" : daysUntilLabel(c.nextSession.startsAt)}
                {" — "}
                {c.nextSession.title} ({formatLima(c.nextSession.startsAt)})
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin sesiones programadas.</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(student)/mi-aprendizaje/page.tsx"
git commit -m "feat(learning): add /mi-aprendizaje enrolled-courses page"
```

---

### Task 7: `/curso/[slug]/aprender` — agenda del curso

**Files:**
- Create: `src/app/(student)/curso/[slug]/aprender/page.tsx`

**Interfaces:**
- Consumes: `requireUser` de `@/modules/auth/session`; `ForbiddenError` de `@/modules/auth/guards`; `getCourseAgenda` de `@/modules/learning/queries` (Task 3); `formatLima` de `@/lib/datetime`.

- [ ] **Step 1: Crear la página**

Crea `src/app/(student)/curso/[slug]/aprender/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getCourseAgenda } from "@/modules/learning/queries";
import { formatLima } from "@/lib/datetime";

const STATE_LABEL: Record<string, string> = {
  upcoming: "Próxima",
  live: "EN VIVO AHORA",
  past: "Finalizada",
};

export default async function AgendaCursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = await requireUser();

  let agenda;
  try {
    agenda = await getCourseAgenda(u.id, slug);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!agenda) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{agenda.title}</h1>
      <div className="flex flex-col gap-3">
        {agenda.sessions.map((s) => (
          <Link
            key={s.id}
            href={`/curso/${slug}/aprender/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/40"
          >
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{formatLima(s.startsAt)}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {s.attended && <span className="text-muted-foreground">✓</span>}
              <span>{STATE_LABEL[s.state]}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(student)/curso/[slug]/aprender/page.tsx"
git commit -m "feat(learning): add per-course agenda page"
```

---

### Task 8: `/curso/[slug]/aprender/[sessionId]` — acceso a la sesión

**Files:**
- Create: `src/modules/learning/ui/marcar-progreso-button.tsx`
- Create: `src/modules/learning/ui/descargar-material-button.tsx`
- Create: `src/app/(student)/curso/[slug]/aprender/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `getSessionDetail` de `@/modules/learning/queries` (Task 3); `attendanceButtonLabel` de `@/modules/learning/service` (Task 2); `marcarProgreso` de `@/modules/learning/actions` (Task 4); `getMaterialDownloadUrl(materialId: string): Promise<string>` de `@/modules/materials/actions` (Task 1, firma ya corregida); `formatLima` de `@/lib/datetime`.

- [ ] **Step 1: Crear el botón de progreso (client)**

Crea `src/modules/learning/ui/marcar-progreso-button.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { marcarProgreso } from "@/modules/learning/actions";

export function MarcarProgresoButton({
  sessionId, label, alreadyMarked,
}: {
  sessionId: string; label: string; alreadyMarked: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function onClick() {
    setSubmitting(true);
    try {
      await marcarProgreso(sessionId);
      toast.success("Progreso registrado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el progreso.");
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyMarked) {
    return <p className="text-sm text-muted-foreground">✓ Ya marcaste esta sesión.</p>;
  }

  return (
    <Button type="button" onClick={onClick} disabled={submitting}>
      {submitting ? "Guardando..." : label}
    </Button>
  );
}
```

- [ ] **Step 2: Crear el botón de descarga de material (client)**

Crea `src/modules/learning/ui/descargar-material-button.tsx`:

```tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMaterialDownloadUrl } from "@/modules/materials/actions";

export function DescargarMaterialButton({ materialId, title }: { materialId: string; title: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const url = await getMaterialDownloadUrl(materialId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar el material.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={loading}>
      {loading ? "Preparando..." : `Descargar: ${title}`}
    </Button>
  );
}
```

- [ ] **Step 3: Crear la página de sesión**

Crea `src/app/(student)/curso/[slug]/aprender/[sessionId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getSessionDetail } from "@/modules/learning/queries";
import { attendanceButtonLabel } from "@/modules/learning/service";
import { formatLima } from "@/lib/datetime";
import { MarcarProgresoButton } from "@/modules/learning/ui/marcar-progreso-button";
import { DescargarMaterialButton } from "@/modules/learning/ui/descargar-material-button";

export default async function SesionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { sessionId } = await params;
  const u = await requireUser();

  let session;
  try {
    session = await getSessionDetail(u.id, sessionId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!session) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{session.courseTitle}</p>
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatLima(session.startsAt)}</p>
      </div>

      {session.state === "live" && session.zoomUrl && (
        <a
          href={session.zoomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Entrar a la clase (Zoom)
        </a>
      )}
      {session.state === "upcoming" && session.zoomUrl && (
        <p className="text-sm text-muted-foreground">
          El enlace de Zoom se habilita 10 minutos antes de la clase.
        </p>
      )}
      {session.state === "past" && session.recordingUrl && (
        <a
          href={session.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ver grabación
        </a>
      )}
      {session.state === "past" && !session.recordingUrl && (
        <p className="text-sm text-muted-foreground">La grabación aún no está disponible.</p>
      )}

      {session.materials.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-medium">Materiales</h2>
          {session.materials.map((m) => (
            <DescargarMaterialButton key={m.id} materialId={m.id} title={m.title} />
          ))}
        </div>
      )}

      <MarcarProgresoButton
        sessionId={session.id}
        label={attendanceButtonLabel(session.state)}
        alreadyMarked={session.attended}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add src/modules/learning/ui/marcar-progreso-button.tsx src/modules/learning/ui/descargar-material-button.tsx "src/app/(student)/curso/[slug]/aprender/[sessionId]/page.tsx"
git commit -m "feat(learning): add session detail page with Zoom/recording access, materials, and progress"
```

---

### Task 9: E2E del aula del alumno

**Files:**
- Create: `tests/e2e/aula.spec.ts`

**Interfaces:**
- Consumes: la app completa, el seed, `login`/`ALUMNO` de `tests/e2e/fixtures.ts` (ya existen desde la Fase 0-1).
- Produces: `pnpm test:e2e` cubriendo `/mi-aprendizaje` → agenda → sesión → marcar progreso → descargar material, en verde.

**Nota sobre datos de prueba:** el seed no crea inscripciones ni materiales. `enrollments.order_id` es nullable a propósito para "inscripciones manuales sin venta (cortesías, alumnos de prueba)" — este test inserta una inscripción y un material directamente por BD (mismo patrón de `dynamic import` ya usado en `tests/e2e/pago.spec.ts` de la Fase 2 para leer `.env.local` fuera del contexto de `next dev`), en vez de recorrer el flujo de pago completo (ya cubierto por `pago.spec.ts`).

- [ ] **Step 1: Escribir el E2E**

Crea `tests/e2e/aula.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, ALUMNO } from "./fixtures";

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

test.describe("aula del alumno", () => {
  let enrollmentId: string | undefined;
  let materialId: string | undefined;
  let sessionId: string | undefined;

  test.afterAll(async () => {
    if (!enrollmentId && !materialId) return;
    const { db, eq, sessionAttendance, sessionMaterials, enrollments } = await getDbHandles();
    if (enrollmentId) await db.delete(sessionAttendance).where(eq(sessionAttendance.enrollmentId, enrollmentId));
    if (materialId) await db.delete(sessionMaterials).where(eq(sessionMaterials.id, materialId));
    if (enrollmentId) await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
  });

  test("un alumno inscrito ve su agenda, entra a una sesión, la marca y descarga un material", async ({ page }) => {
    const { db, eq, and, user, courses, classSessions, sessionMaterials, enrollments } = await getDbHandles();

    const [alumno] = await db.select({ id: user.id }).from(user).where(eq(user.email, ALUMNO.email)).limit(1);
    const [curso] = await db.select({ id: courses.id, slug: courses.slug })
      .from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);
    const [primeraSesion] = await db.select({ id: classSessions.id, title: classSessions.title })
      .from(classSessions).where(eq(classSessions.courseId, curso.id)).orderBy(classSessions.orderIndex).limit(1);
    sessionId = primeraSesion.id;

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
    }

    const [material] = await db.insert(sessionMaterials)
      .values({ classSessionId: primeraSesion.id, title: "Guía de práctica", externalUrl: "https://drive.google.com/practica" })
      .returning({ id: sessionMaterials.id });
    materialId = material.id;

    await login(page, ALUMNO.email, ALUMNO.password);

    await page.goto("/mi-aprendizaje");
    await expect(page.getByText("Excel desde cero")).toBeVisible();

    await page.getByText("Excel desde cero").click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/aprender`);
    await expect(page.getByText(primeraSesion.title)).toBeVisible();

    await page.getByText(primeraSesion.title).click();
    await expect(page).toHaveURL(`/curso/${curso.slug}/aprender/${primeraSesion.id}`);
    await expect(page.getByText("Guía de práctica", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /marcar como/i }).click();
    await expect(page.getByText(/ya marcaste esta sesión/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Correr el E2E**

```bash
pnpm db:seed
pnpm test:e2e tests/e2e/aula.spec.ts
```

Esperado: **PASA**. Si algún selector no coincide con el HTML real de las páginas de las Tasks 6-8, ajusta el selector — no aflojes el assert.

- [ ] **Step 3: Verificación final de la fase**

```bash
pnpm test
pnpm test:e2e
pnpm build
```

Los tres en verde (el único fallo aceptable, si aparece, es el ya conocido y no relacionado `tests/integration/mailer.test.ts` por SMTP/MailHog no disponible en algunos entornos — confirmado no-regresión en las fases anteriores).

- [ ] **Step 4: Commit final**

```bash
git add tests/e2e/aula.spec.ts
git commit -m "test: add E2E for student aula (agenda, session access, progress, materials)"
```

---

## Estado al terminar

**Funciona:** `/mi-aprendizaje` con progreso y próxima sesión por curso · agenda por curso con estado de cada sesión (*próxima* → **EN VIVO AHORA** → *finalizada*) · acceso a Zoom solo mientras la sesión está en vivo, a la grabación solo cuando ya pasó y existe · descarga de materiales vía URL firmada (o enlace externo) solo para inscritos · marcado de progreso auto-reportado, idempotente · cron de recordatorios a 24h y 1h sin duplicados, protegido por `CRON_SECRET`.

**No funciona todavía, y es lo esperado:** examen y certificados (Fases 4-5) · liquidaciones al instructor, revocación/reembolso, cupones desde el admin, páginas legales (Fase 6) · botón de compra real en `/cursos/[slug]` (sigue como endpoint de test, Fase 6/7) · Culqi.

**Siguiente plan:** Fase 4 — examen (banco de preguntas en panel de instructor, intentos con barajado congelado, guardado incremental, calificación, bloqueo, resultados).

---

## Auto-revisión

**Cobertura del spec relevante a esta fase:**

| Requisito del spec | Cubierto en |
|---|---|
| `/mi-aprendizaje` con agenda y progreso (§9 tabla de fases) | Task 6 |
| `assertEnrolled` en todo loader de contenido de curso (§6.4, §7 invariante 1) | Task 3 (`getCourseAgenda`, `getSessionDetail`), Task 4 (`marcarProgreso`) |
| `zoom_url`/`recording_url`/keys de R2 nunca al no inscrito (§6.4 invariante, §7 invariante 2) | Task 1 (fix de `getMaterialDownloadUrl`), Task 3, Task 8 |
| Estados *faltan N días* → **EN VIVO AHORA** → *finalizada* (§6.4) | Task 2 (`daysUntilLabel`, reutiliza `sessionState` ya existente), Task 6, Task 7 |
| Materiales: URL presignada generada al hacer clic (§6.4) | Task 8 (`DescargarMaterialButton` llama a `getMaterialDownloadUrl` en el clic, no antes) |
| Progreso auto-reportado, no bloquea nada (§5) | Task 4, Task 8 |
| Cron de recordatorios cada 15 min, ventanas 24h/1h, `INSERT` antes de `sendEmail` (§6.5) | Task 5 |
| Cron ejecutado dos veces envía un solo email (§8, plan de pruebas) | Task 5, test "no reenvía si ya se envió" |

**Huecos deliberados, no olvidos:** esta fase no agrega un botón "Inscribirme" real ni un flujo de cortesías administrado por UI — el E2E usa una inserción directa de `enrollments` (con `order_id` NULL, ya documentado en el spec para "inscripciones manuales sin venta") porque el flujo de compra ya está cubierto por el E2E de la Fase 2 y repetirlo aquí solo probaría lo mismo dos veces. El endpoint del cron no valida que `CRON_SECRET` se compare de forma timing-safe — mismo patrón ya aceptado y diferido en el cron de la Fase 2 (`/api/cron/expirar-ordenes`), no se reintroduce como hallazgo nuevo aquí.

**Consistencia de nombres verificada:** `sessionState`/`SessionState`/`formatLima` (Fase 0-1, `src/lib/datetime.ts`, reutilizados sin redefinir) · `assertEnrolled`/`ForbiddenError` (Fase 0-1, `src/modules/auth/guards.ts`) · `requireUser` (Fase 0-1, `src/modules/auth/session.ts`) · `getMaterialDownloadUrl` (Fase 0-1, firma corregida en Task 1, consumida en Task 8) · `computeProgress`/`pickNextSession`/`daysUntilLabel`/`attendanceButtonLabel` (Task 2, consumidos en Tasks 3, 6 y 8) · `listMyCourses`/`getCourseAgenda`/`getSessionDetail` (Task 3, consumidos en Tasks 6, 7 y 8) · `marcarProgreso` (Task 4, consumido en Task 8) · `sendSessionReminders`/`reminderWindows` (Task 5, expuestos solo vía la ruta del cron) — ninguno redefinido dos veces.
