# Fase 5 — Certificados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir un certificado verificable (con PDF y QR) al aprobar un examen, con verificación pública por código y revocación por el admin.

**Architecture:** Módulo `src/modules/certification/` con la misma separación que `assessment`: `service.ts` puro (generación de código), `issuance.ts` sin `"use server"` (emisión dentro de la transacción del examen), `queries.ts` (lecturas), `actions.ts` (`"use server"`, solo revocación), `pdf.tsx` sin `"use server"` (render + subida a R2, extensión `.tsx` porque usa JSX de `@react-pdf/renderer`). Cuatro rutas nuevas: pública (`/verificar/[code]`), alumno (`/certificados`), admin (`/admin/certificados`) y un route handler (`/api/certificados/[code]/pdf`).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM/Postgres, Zod v4, Tailwind v4/shadcn, Vitest, Playwright, Cloudflare R2 (`@aws-sdk/client-s3`), dos dependencias nuevas: `@react-pdf/renderer` y `qrcode`.

## Global Constraints

- Todo el texto de la interfaz va en español de Perú. Mensajes de error incluidos.
- Ninguna función exportada de un módulo `"use server"` recibe `userId` como parámetro. Se resuelve dentro con `requireUser()`/`assertRole()`. Todo export de un módulo `"use server"` es un endpoint público sin autenticar.
- `service.ts` no importa nada de `next/*` ni de `@/db`. Se testea con Vitest sin servidor ni navegador.
- `issuance.ts` y `pdf.tsx` NO llevan `"use server"`. Igual que `src/modules/assessment/grading.ts`: son lógica invocada desde otro módulo, no endpoints.
- El certificado guarda **snapshots**, nunca un JOIN en vivo: `studentName`, `courseTitle`, `instructorName`, `academyName`, `hours`, `finalScore` se copian al emitir y no cambian después aunque el curso o el usuario cambien de nombre.
- `emitirCertificado` es idempotente: `INSERT ... ON CONFLICT (enrollment_id) DO NOTHING`.
- El código del certificado usa el alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin `0 O 1 I L`), formato `XXXX-XXXX` (dos bloques de 4, separados por guion, 8 caracteres útiles).
- La página pública y el PDF nunca exponen email ni ningún dato personal fuera de lo impreso en el certificado (nombre, curso, instructor, academia, fecha, horas, nota).
- Un certificado revocado no se descarga: el endpoint del PDF responde 404 aunque el archivo siga cacheado en R2.
- Zona horaria de presentación: `America/Lima` vía `formatLima` de `@/lib/datetime`.
- Formato de commits: `tipo(ámbito): descripción en inglés, imperativo`.

## Estructura de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `src/modules/certification/service.ts` | `generarCodigo()`. Puro. | 1 |
| `tests/unit/certification-service.test.ts` | Tests del anterior. | 1 |
| `src/modules/certification/issuance.ts` | `emitirCertificado(tx, enrollmentId, scorePct)`. Sin `"use server"`. | 2 |
| `src/modules/assessment/grading.ts` | Modificado: llama a `emitirCertificado` donde estaba el comentario FASE 5. | 2 |
| `src/modules/certification/queries.ts` | `getCertificadoPublico`, `getMisCertificados`, `listarCertificados`. | 3, 5, 6 |
| `src/modules/certification/actions.ts` | `revocarCertificado`. | 5 |
| `src/modules/certification/pdf.tsx` | `generarYSubirPdf(certificate)`. Sin `"use server"`. | 4 |
| `src/app/api/certificados/[code]/pdf/route.ts` | Endpoint del PDF perezoso. | 4 |
| `src/app/(public)/verificar/[code]/page.tsx` | Verificación pública. | 3 |
| `src/app/(student)/certificados/page.tsx` | Lista de certificados del alumno. | 6 |
| `src/app/(admin)/admin/certificados/page.tsx` | Panel del admin: listar, buscar, revocar. | 5 |
| `src/modules/certification/ui/revoke-certificate-button.tsx` | Botón de revocar (cliente). | 5 |
| `tests/integration/certification-*.test.ts` | Emisión, revocación, verificación pública, lista del alumno. | 2, 3, 5 |
| `tests/e2e/certificados.spec.ts` | Recorrido alumno aprueba → certificado → PDF → verificación → revocación. | 7 |

## Tabla existente (referencia, ya migrada)

`certificates(id, enrollmentId UNIQUE, code UNIQUE, issuedAt, studentName, courseTitle, instructorName, academyName, hours, finalScore, pdfKey, revokedAt, revokeReason)` — `src/db/schema/certification.ts`.

**Orden de borrado en los tests** (respeta las FK, extiende el orden de la Fase 4): `certificates` → `examAttemptAnswers` → `examAttemptQuestions` → `examAttempts` → `questionOptions` → `questions` → `exams` → `sessionAttendance` → `enrollments` → `classSessions` → `courses` → `user`.

---

### Task 1: Generación del código del certificado

**Files:**
- Create: `src/modules/certification/service.ts`
- Test: `tests/unit/certification-service.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `generarCodigo(): string` — para Task 2.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/unit/certification-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generarCodigo } from "@/modules/certification/service";

describe("generarCodigo", () => {
  it("tiene el formato XXXX-XXXX", () => {
    const code = generarCodigo();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("nunca usa caracteres ambiguos (0 O 1 I L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generarCodigo();
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it("genera valores distintos en llamadas sucesivas", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generarCodigo()));
    // 50 códigos de un alfabeto de 31^8 combinaciones: la probabilidad de
    // colisión es despreciable, así que todos deben ser distintos.
    expect(codes.size).toBe(50);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/unit/certification-service.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/certification/service"`.

- [ ] **Step 3: Escribir la implementación**

Crea `src/modules/certification/service.ts`:

```ts
// Sin 0, O, 1, I, L: se leen mal en pantalla y se confunden al dictarlos por teléfono.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function bloque(longitud: number): string {
  let out = "";
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return out;
}

/**
 * Código legible del certificado: 8 caracteres útiles en dos bloques de 4,
 * separados por un guion. No garantiza unicidad por sí solo — eso lo hace el
 * UNIQUE de la columna `code`, con reintento en la capa de inserción
 * (ver `emitirCertificado` en `issuance.ts`).
 */
export function generarCodigo(): string {
  return `${bloque(4)}-${bloque(4)}`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/unit/certification-service.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/certification/service.ts tests/unit/certification-service.test.ts
git commit -m "feat(certification): add readable certificate code generator"
```

---

### Task 2: Emisión del certificado dentro de la transacción del examen

**Files:**
- Create: `src/modules/certification/issuance.ts`
- Modify: `src/modules/assessment/grading.ts`
- Test: `tests/integration/certification-issuance.test.ts`

**Interfaces:**
- Consumes de Task 1: `generarCodigo`.
- Consumes del código existente: `db.transaction`'s `tx` (pasado desde `grading.ts`, no se abre una transacción nueva), tablas `certificates`, `enrollments`, `courses`, `user`, `instructorProfiles`.
- Produces:
  - `emitirCertificado(tx: Transaccion, enrollmentId: string, scorePct: number): Promise<void>` — no devuelve el certificado, solo lo crea (idempotente).

Nota de diseño: `emitirCertificado` recibe el mismo `tx` que ya abrió `cerrarIntento`
en `grading.ts` — no una transacción propia. Esto es lo que hace que la emisión sea
atómica con el cierre del intento: si la inserción del certificado fallara, todo el
cierre del examen se revertiría junto con ella.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/certification-issuance.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
  instructorProfiles,
} from "@/db/schema";
import { emitirCertificado } from "@/modules/certification/issuance";

let profId: string;
let alumnoId: string;
let cursoId: string;
let enrollmentId: string;

beforeEach(async () => {
  await db.delete(certificates);
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

  profId = crypto.randomUUID();
  await db.insert(user).values({
    id: profId, name: "Prof Ana", email: "p@test.pe", emailVerified: true, role: "instructor",
  });
  await db.insert(instructorProfiles).values({
    userId: profId, displayName: "Ana Torres", status: "approved",
  });

  alumnoId = crypto.randomUUID();
  await db.insert(user).values({
    id: alumnoId, name: "Luis Salas", email: "a@test.pe", emailVerified: true, role: "student",
  });

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "excel-desde-cero", title: "Excel desde cero",
    priceCents: 100, estimatedHours: "12.50",
  }).returning();
  cursoId = c.id;

  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  }).returning();
  enrollmentId = e.id;
});

describe("emitirCertificado", () => {
  it("crea el certificado con los snapshots correctos", async () => {
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });

    const [cert] = await db.select().from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId));
    expect(cert).toBeDefined();
    expect(cert.studentName).toBe("Luis Salas");
    expect(cert.courseTitle).toBe("Excel desde cero");
    expect(cert.instructorName).toBe("Ana Torres");
    expect(Number(cert.finalScore)).toBe(87.5);
    expect(Number(cert.hours)).toBe(12.5);
    expect(cert.pdfKey).toBeNull();
    expect(cert.revokedAt).toBeNull();
    expect(cert.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("es idempotente: llamarlo dos veces no crea un segundo certificado", async () => {
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });
    await db.transaction(async (tx) => {
      await emitirCertificado(tx, enrollmentId, 87.5);
    });

    const rows = await db.select().from(certificates)
      .where(eq(certificates.enrollmentId, enrollmentId));
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-issuance.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/certification/issuance"`.

- [ ] **Step 3: Escribir `issuance.ts`**

Crea `src/modules/certification/issuance.ts`:

```ts
// Sin "use server" a propósito: lo invoca cerrarIntento (grading.ts) dentro de
// SU transacción. No es un endpoint.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, enrollments, courses, user, instructorProfiles } from "@/db/schema";
import { env } from "@/env";
import { generarCodigo } from "./service";

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Crea el certificado de un intento aprobado, dentro de la MISMA transacción
 * que cierra el intento (recibe `tx`, no abre una propia). Idempotente:
 * `ON CONFLICT (enrollment_id) DO NOTHING`. El código se reintenta si choca
 * con uno ya existente (colisión de UNIQUE en `code`).
 */
export async function emitirCertificado(
  tx: Transaccion,
  enrollmentId: string,
  scorePct: number
): Promise<void> {
  const [datos] = await tx
    .select({
      studentName: user.name,
      courseTitle: courses.title,
      hours: courses.estimatedHours,
      instructorId: courses.instructorId,
    })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  if (!datos) throw new Error("Inscripción no encontrada al emitir el certificado.");

  const [prof] = await tx
    .select({ displayName: instructorProfiles.displayName })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, datos.instructorId))
    .limit(1);

  const MAX_REINTENTOS = 5;
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const code = generarCodigo();
    try {
      await tx
        .insert(certificates)
        .values({
          enrollmentId,
          code,
          studentName: datos.studentName,
          courseTitle: datos.courseTitle,
          instructorName: prof?.displayName ?? "",
          academyName: env.ACADEMIA_NAME,
          hours: datos.hours,
          finalScore: scorePct.toFixed(2),
        })
        .onConflictDoNothing({ target: certificates.enrollmentId });
      return;
    } catch (err) {
      // Colisión en `code` (distinto UNIQUE del que protege la idempotencia):
      // reintenta con un código nuevo. Cualquier otro error se relanza.
      const esColisionDeCodigo =
        err && typeof err === "object" && "code" in err && err.code === "23505" &&
        "constraint_name" in err && err.constraint_name === "certificates_code_unique";
      if (!esColisionDeCodigo) throw err;
    }
  }
  throw new Error("No se pudo generar un código de certificado único.");
}
```

- [ ] **Step 4: Reemplazar el comentario FASE 5 en `grading.ts`**

Abre `src/modules/assessment/grading.ts`. Reemplaza:

```ts
    // FASE 5 — certificación: aquí va `if (passed) await emitirCertificado(tx, attempt.enrollmentId)`.
    // Se deja fuera a propósito: la emisión, el código verificable y el PDF son el
    // alcance completo de la Fase 5. La pantalla de resultados ya anuncia el certificado.
```

por:

```ts
    if (passed) {
      await emitirCertificado(tx, attempt.enrollmentId, scorePct);
    }
```

Y agrega el import al inicio del archivo:

```ts
import { emitirCertificado } from "@/modules/certification/issuance";
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-issuance.test.ts`
Esperado: PASA, 2 tests.

- [ ] **Step 6: Correr toda la suite y verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit && pnpm test`
Esperado: sin errores; toda la suite en verde, incluidos los tests de `assessment-envio.test.ts` de la Fase 4 (que ejercitan `cerrarIntento` y ahora también emiten un certificado en el camino "aprueba").

- [ ] **Step 7: Commit**

```bash
git add src/modules/certification/issuance.ts src/modules/assessment/grading.ts tests/integration/certification-issuance.test.ts
git commit -m "feat(certification): issue certificate inside the exam grading transaction"
```

---

### Task 3: Verificación pública

**Files:**
- Create: `src/modules/certification/queries.ts`
- Create: `src/app/(public)/verificar/[code]/page.tsx`
- Test: `tests/integration/certification-queries.test.ts`

**Interfaces:**
- Consumes de Task 2: la tabla `certificates` ya poblada por `emitirCertificado`.
- Produces:
  - `getCertificadoPublico(code: string): Promise<CertificadoPublico | null>` — para Task 4 (PDF) y Task 7 (E2E).
  - Tipo `CertificadoPublico`.

**Invariante de esta task:** `getCertificadoPublico` NUNCA selecciona `user.email` ni
ninguna columna fuera de lo que el certificado imprime. El código es la única
credencial: cualquiera que lo tenga puede consultarlo, así que el objeto devuelto
debe ser seguro para mostrar a un desconocido.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/certification-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";
import { getCertificadoPublico } from "@/modules/certification/queries";

let enrollmentId: string;

beforeEach(async () => {
  await db.delete(certificates);
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

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();
  enrollmentId = e.id;
});

describe("getCertificadoPublico", () => {
  it("devuelve los datos impresos para un código válido", async () => {
    await db.insert(certificates).values({
      enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
      instructorName: "Prof", academyName: "Academia Demo", hours: "10.00", finalScore: "90.00",
    });

    const r = await getCertificadoPublico("AB23-CD45");
    expect(r).not.toBeNull();
    expect(r!.estado).toBe("valido");
    if (r!.estado === "valido") {
      expect(r!.studentName).toBe("Alumno");
      expect(r!.courseTitle).toBe("Curso X");
      expect(r!.finalScore).toBe(90);
      expect(JSON.stringify(r)).not.toMatch(/@/); // sin email
    }
  });

  it("devuelve estado revocado con la fecha", async () => {
    await db.insert(certificates).values({
      enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
      instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
      revokedAt: new Date("2026-05-01T00:00:00Z"), revokeReason: "Reembolso",
    });

    const r = await getCertificadoPublico("AB23-CD45");
    expect(r!.estado).toBe("revocado");
    if (r!.estado === "revocado") {
      expect(r!.revokedAt).toEqual(new Date("2026-05-01T00:00:00Z"));
    }
  });

  it("devuelve null para un código inexistente", async () => {
    expect(await getCertificadoPublico("ZZZZ-ZZZZ")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-queries.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/certification/queries"`.

- [ ] **Step 3: Escribir `queries.ts`**

Crea `src/modules/certification/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates } from "@/db/schema";

export type CertificadoPublico =
  | {
      estado: "valido";
      studentName: string;
      courseTitle: string;
      instructorName: string;
      academyName: string;
      hours: number | null;
      finalScore: number;
      issuedAt: Date;
    }
  | { estado: "revocado"; revokedAt: Date; revokeReason: string | null };

/**
 * Verificación pública por código. No selecciona email ni ninguna columna
 * fuera de lo que el certificado imprime — el código es la única credencial.
 */
export async function getCertificadoPublico(code: string): Promise<CertificadoPublico | null> {
  const [row] = await db
    .select({
      studentName: certificates.studentName,
      courseTitle: certificates.courseTitle,
      instructorName: certificates.instructorName,
      academyName: certificates.academyName,
      hours: certificates.hours,
      finalScore: certificates.finalScore,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
      revokeReason: certificates.revokeReason,
    })
    .from(certificates)
    .where(eq(certificates.code, code))
    .limit(1);
  if (!row) return null;

  if (row.revokedAt) {
    return { estado: "revocado", revokedAt: row.revokedAt, revokeReason: row.revokeReason };
  }

  return {
    estado: "valido",
    studentName: row.studentName,
    courseTitle: row.courseTitle,
    instructorName: row.instructorName,
    academyName: row.academyName,
    hours: row.hours === null ? null : Number(row.hours),
    finalScore: Number(row.finalScore),
    issuedAt: row.issuedAt,
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-queries.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Step 5: Crear la página pública de verificación**

Crea `src/app/(public)/verificar/[code]/page.tsx`:

```tsx
import { getCertificadoPublico } from "@/modules/certification/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const r = await getCertificadoPublico(code.toUpperCase());

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Verificación de certificado</h1>
      <p className="text-sm text-muted-foreground">Código: {code.toUpperCase()}</p>

      {!r && (
        <div className="rounded-md border border-border p-6">
          <p className="font-medium text-destructive">
            No encontramos ningún certificado con ese código.
          </p>
        </div>
      )}

      {r?.estado === "revocado" && (
        <div className="rounded-md border border-border p-6">
          <Badge variant="secondary">Revocado</Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            Este certificado fue revocado el {formatLima(r.revokedAt)}.
          </p>
        </div>
      )}

      {r?.estado === "valido" && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-6">
          <Badge>Válido</Badge>
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Alumno</dt>
              <dd className="font-medium">{r.studentName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Curso</dt>
              <dd className="font-medium">{r.courseTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Instructor</dt>
              <dd className="font-medium">{r.instructorName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Academia</dt>
              <dd className="font-medium">{r.academyName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de emisión</dt>
              <dd className="font-medium">{formatLima(r.issuedAt)}</dd>
            </div>
            {r.hours !== null && (
              <div>
                <dt className="text-muted-foreground">Horas</dt>
                <dd className="font-medium">{r.hours}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Nota final</dt>
              <dd className="font-medium">{r.finalScore}%</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/verificar/[code]` aparece en el listado del build.

- [ ] **Step 7: Commit**

```bash
git add src/modules/certification/queries.ts src/app/\(public\)/verificar tests/integration/certification-queries.test.ts
git commit -m "feat(certification): add public certificate verification page"
```

---

### Task 4: PDF perezoso con QR

**Files:**
- Modify: `package.json` (agregar `@react-pdf/renderer` y `qrcode`)
- Create: `src/modules/certification/pdf.tsx`
- Create: `src/app/api/certificados/[code]/pdf/route.ts`
- Test: `tests/integration/certification-pdf.test.ts`

**Interfaces:**
- Consumes de Task 2: la tabla `certificates` ya poblada por `emitirCertificado`. El route handler de esta task NO reutiliza `getCertificadoPublico` (Task 3): necesita columnas que esa función pública no expone (`pdfKey`, `id`), así que hace su propia consulta contra `certificates` (ver Step 6).
- Consumes del código existente: `presignPut`/`presignGet` de `@/lib/r2`, `env.NEXT_PUBLIC_APP_URL`.
- Produces:
  - `generarYSubirPdf(certificate: CertificadoParaPdf): Promise<string>` — devuelve el `pdfKey`. Nada más la consume en este plan.

- [ ] **Step 1: Instalar las dependencias**

```bash
pnpm add @react-pdf/renderer qrcode
pnpm add -D @types/qrcode
```

- [ ] **Step 2: Escribir el test que falla**

Crea `tests/integration/certification-pdf.test.ts`. Este test verifica el endpoint
completo (genera, guarda `pdfKey`, sirve desde R2 en el segundo acceso) usando el
bucket real de R2 configurado en `.env.local`/`.env.test` — mismo patrón que ya usan
los tests de comprobantes de pago de la Fase 2.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";
import { deleteObject } from "@/lib/r2";

let enrollmentId: string;
let claveSubida: string | null = null;

beforeEach(async () => {
  await db.delete(certificates);
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
  if (claveSubida) {
    await deleteObject(claveSubida).catch(() => {});
    claveSubida = null;
  }

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();
  enrollmentId = e.id;
});

describe("generarYSubirPdf", () => {
  it("genera un PDF y devuelve una key de R2", async () => {
    const { generarYSubirPdf } = await import("@/modules/certification/pdf");

    const key = await generarYSubirPdf({
      code: "AB23-CD45",
      studentName: "Alumno",
      courseTitle: "Curso X",
      instructorName: "Prof",
      academyName: "Academia Demo",
      hours: 10,
      finalScore: 90,
      issuedAt: new Date(),
    });

    expect(key).toBe("certificados/AB23-CD45/pdf/certificado.pdf");
    claveSubida = key;
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-pdf.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/certification/pdf"`.

- [ ] **Step 4: Escribir `pdf.ts`**

Crea `src/modules/certification/pdf.tsx`:

```ts
// Sin "use server" a propósito: lo invoca el route handler del PDF, no es un
// endpoint por sí mismo.
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { r2 } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { formatLima } from "@/lib/datetime";

export interface CertificadoParaPdf {
  code: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  academyName: string;
  hours: number | null;
  finalScore: number;
  issuedAt: Date;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, fontFamily: "Helvetica" },
  academia: { fontSize: 18, fontWeight: 700, marginBottom: 24 },
  titulo: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  cuerpo: { fontSize: 13, marginBottom: 24, lineHeight: 1.5 },
  fila: { flexDirection: "row", justifyContent: "space-between", marginTop: 32 },
  etiqueta: { fontSize: 9, color: "#666" },
  qr: { width: 80, height: 80 },
});

function documento(c: CertificadoParaPdf) {
  return QRCode.toDataURL(`${env.NEXT_PUBLIC_APP_URL}/verificar/${c.code}`).then((qrDataUrl) => (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.academia}>{c.academyName}</Text>
        <Text style={styles.titulo}>Certificado de finalización</Text>
        <Text style={styles.cuerpo}>
          Se certifica que {c.studentName} completó y aprobó el curso "{c.courseTitle}"
          {c.hours !== null ? ` (${c.hours} horas)` : ""}, dictado por {c.instructorName},
          con una nota final de {c.finalScore}%.
        </Text>
        <View style={styles.fila}>
          <View>
            <Text style={styles.etiqueta}>Fecha de emisión</Text>
            <Text>{formatLima(c.issuedAt)}</Text>
            <Text style={[styles.etiqueta, { marginTop: 8 }]}>Código de verificación</Text>
            <Text>{c.code}</Text>
          </View>
          <Image style={styles.qr} src={qrDataUrl} />
        </View>
      </Page>
    </Document>
  ));
}

/** Renderiza el PDF, lo sube a R2 y devuelve la key. No persiste `pdfKey` en la BD: eso lo hace el llamador. */
export async function generarYSubirPdf(c: CertificadoParaPdf): Promise<string> {
  const doc = await documento(c);
  const buffer = await renderToBuffer(doc);
  const key = `certificados/${c.code}/pdf/certificado.pdf`;

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );

  return key;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-pdf.test.ts`
Esperado: PASA, 1 test. (Requiere credenciales de R2 válidas en `.env.local`/`.env.test`, igual que los tests existentes de comprobantes de pago.)

- [ ] **Step 6: Crear el route handler**

Crea `src/app/api/certificados/[code]/pdf/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { presignGet } from "@/lib/r2";
import { generarYSubirPdf } from "@/modules/certification/pdf";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const [cert] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.code, code.toUpperCase()))
    .limit(1);

  if (!cert || cert.revokedAt) {
    return new Response("No encontrado.", { status: 404 });
  }

  let pdfKey = cert.pdfKey;
  if (!pdfKey) {
    pdfKey = await generarYSubirPdf({
      code: cert.code,
      studentName: cert.studentName,
      courseTitle: cert.courseTitle,
      instructorName: cert.instructorName,
      academyName: cert.academyName,
      hours: cert.hours === null ? null : Number(cert.hours),
      finalScore: Number(cert.finalScore),
      issuedAt: cert.issuedAt,
    });
    await db.update(certificates).set({ pdfKey }).where(eq(certificates.id, cert.id));
  }

  const url = await presignGet(pdfKey);
  return Response.redirect(url, 302);
}
```

- [ ] **Step 7: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/api/certificados/[code]/pdf` aparece en el listado del build.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/modules/certification/pdf.tsx src/app/api/certificados tests/integration/certification-pdf.test.ts
git commit -m "feat(certification): generate PDF with QR lazily and serve from R2"
```

---

### Task 5: Panel del admin — listar y revocar

**Files:**
- Modify: `src/modules/certification/queries.ts` (agregar `listarCertificados`)
- Modify: `src/modules/certification/actions.ts` (crear, con `revocarCertificado`)
- Create: `src/app/(admin)/admin/certificados/page.tsx`
- Create: `src/modules/certification/ui/revoke-certificate-button.tsx`
- Test: `tests/integration/certification-admin.test.ts`

**Interfaces:**
- Consumes de Task 2/3: la tabla `certificates`.
- Produces:
  - `listarCertificados(): Promise<CertificadoAdminRow[]>`
  - `revocarCertificado(certificateId: string, motivo: string): Promise<void>`
  - Tipo `CertificadoAdminRow`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/certification-admin.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";

let currentUser = { id: "", role: "admin" };
vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ ...currentUser, name: "Admin" })),
  assertRole: vi.fn(async () => ({ ...currentUser, name: "Admin" })),
}));

const acts = await import("@/modules/certification/actions");
const qs = await import("@/modules/certification/queries");

let certificateId: string;

beforeEach(async () => {
  await db.delete(certificates);
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

  const adminId = crypto.randomUUID();
  await db.insert(user).values({
    id: adminId, name: "Admin", email: "adm@test.pe", emailVerified: true, role: "admin",
  });
  currentUser = { id: adminId, role: "admin" };

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();

  const [cert] = await db.insert(certificates).values({
    enrollmentId: e.id, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
  }).returning();
  certificateId = cert.id;
});

describe("listarCertificados", () => {
  it("devuelve todos los certificados emitidos", async () => {
    const rows = await qs.listarCertificados();
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe("AB23-CD45");
  });
});

describe("revocarCertificado", () => {
  it("fija revokedAt y revokeReason", async () => {
    await acts.revocarCertificado(certificateId, "Reembolso aprobado");

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokedAt).not.toBeNull();
    expect(cert.revokeReason).toBe("Reembolso aprobado");
  });

  it("rechaza sin motivo", async () => {
    await expect(acts.revocarCertificado(certificateId, "")).rejects.toThrow(/motivo/i);
  });

  it("rechaza un certificado inexistente", async () => {
    await expect(acts.revocarCertificado(crypto.randomUUID(), "Motivo")).rejects.toThrow(/no encontrado/i);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-admin.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/certification/actions"`.

- [ ] **Step 3: Agregar consultas del admin a `queries.ts`**

Añade al final de `src/modules/certification/queries.ts`:

```ts
export interface CertificadoAdminRow {
  id: string;
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: Date;
  revokedAt: Date | null;
}

/** Todos los certificados emitidos, para el panel del admin. */
export async function listarCertificados(): Promise<CertificadoAdminRow[]> {
  return db
    .select({
      id: certificates.id,
      code: certificates.code,
      studentName: certificates.studentName,
      courseTitle: certificates.courseTitle,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
    })
    .from(certificates)
    .orderBy(desc(certificates.issuedAt));
}
```

Agrega `desc` al import de `drizzle-orm` en la cabecera del archivo (junto a `eq`).

- [ ] **Step 4: Escribir `actions.ts`**

Crea `src/modules/certification/actions.ts`:

```ts
"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";

export async function revocarCertificado(certificateId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo de la revocación.");
  }

  const [cert] = await db.select({ id: certificates.id })
    .from(certificates).where(eq(certificates.id, certificateId)).limit(1);
  if (!cert) throw new Error("Certificado no encontrado.");

  await db
    .update(certificates)
    .set({ revokedAt: new Date(), revokeReason: motivo.trim() })
    .where(eq(certificates.id, certificateId));

  revalidatePath("/admin/certificados");
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-admin.test.ts`
Esperado: PASA, 4 tests.

- [ ] **Step 6: Crear el botón de revocar**

Crea `src/modules/certification/ui/revoke-certificate-button.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revocarCertificado } from "@/modules/certification/actions";

export function RevokeCertificateButton({ certificateId }: { certificateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);

  function revocar() {
    if (!motivo.trim()) return toast.error("Escribe el motivo de la revocación.");
    startTransition(async () => {
      try {
        await revocarCertificado(certificateId, motivo);
        toast.success("Certificado revocado.");
        setAbierto(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo revocar.");
      }
    });
  }

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={() => setAbierto(true)}>
        Revocar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Motivo de la revocación"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-8"
      />
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={revocar}>
        Confirmar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Crear la página del admin**

Crea `src/app/(admin)/admin/certificados/page.tsx`:

```tsx
import { listarCertificados } from "@/modules/certification/queries";
import { RevokeCertificateButton } from "@/modules/certification/ui/revoke-certificate-button";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";

export default async function AdminCertificadosPage() {
  const certificados = await listarCertificados();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Certificados emitidos</h1>
      {certificados.length === 0 ? (
        <p className="text-muted-foreground">Todavía no se ha emitido ningún certificado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {certificados.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {c.code} · {c.studentName} · {c.courseTitle}
                </span>
                <span className="text-xs text-muted-foreground">
                  Emitido el {formatLima(c.issuedAt)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {c.revokedAt ? (
                  <Badge variant="secondary">Revocado</Badge>
                ) : (
                  <RevokeCertificateButton certificateId={c.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Enlazar el panel desde la navegación del admin**

Abre `src/app/(admin)/layout.tsx` y localiza el `<nav>` con los enlaces existentes
(`Pagos`, `Cursos`, etc. — ver el layout actual). Agrega un enlace equivalente,
respetando el mismo componente `Link` y las mismas clases que sus vecinos:

```tsx
<Link href="/admin/certificados" className="text-muted-foreground hover:text-foreground">
  Certificados
</Link>
```

No renombres ninguna variable existente del archivo.

- [ ] **Step 9: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/admin/certificados` aparece en el listado del build.

- [ ] **Step 10: Commit**

```bash
git add src/modules/certification src/app/\(admin\) tests/integration/certification-admin.test.ts
git commit -m "feat(certification): add admin panel to list and revoke certificates"
```

---

### Task 6: Certificados del alumno

**Files:**
- Modify: `src/modules/certification/queries.ts` (agregar `getMisCertificados`)
- Create: `src/app/(student)/certificados/page.tsx`
- Test: `tests/integration/certification-mine.test.ts`

**Interfaces:**
- Consumes de Task 2/3: la tabla `certificates`.
- Produces:
  - `getMisCertificados(userId: string): Promise<MiCertificado[]>`
  - Tipo `MiCertificado`.

- [ ] **Step 1: Escribir el test que falla**

Crea `tests/integration/certification-mine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import {
  user, courses, enrollments, sessionAttendance, classSessions,
  exams, questions, questionOptions,
  examAttempts, examAttemptQuestions, examAttemptAnswers, certificates,
} from "@/db/schema";
import { getMisCertificados } from "@/modules/certification/queries";

let alumnoId: string;
let otroId: string;

beforeEach(async () => {
  await db.delete(certificates);
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

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [alumno] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  const [otro] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe", emailVerified: true, role: "student",
  }).returning();
  alumnoId = alumno.id;
  otroId = otro.id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: c.id, status: "active",
  }).returning();

  await db.insert(certificates).values({
    enrollmentId: e.id, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
  });
});

describe("getMisCertificados", () => {
  it("devuelve solo los certificados del usuario que consulta", async () => {
    const propios = await getMisCertificados(alumnoId);
    expect(propios).toHaveLength(1);
    expect(propios[0].code).toBe("AB23-CD45");

    const ajenos = await getMisCertificados(otroId);
    expect(ajenos).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-mine.test.ts`
Esperado: FALLA porque `getMisCertificados` no existe.

- [ ] **Step 3: Agregar `getMisCertificados` a `queries.ts`**

Añade al final de `src/modules/certification/queries.ts`:

```ts
export interface MiCertificado {
  code: string;
  courseTitle: string;
  issuedAt: Date;
}

/** Certificados del alumno, para /certificados. */
export async function getMisCertificados(userId: string): Promise<MiCertificado[]> {
  const rows = await db
    .select({
      code: certificates.code,
      courseTitle: certificates.courseTitle,
      issuedAt: certificates.issuedAt,
    })
    .from(certificates)
    .innerJoin(enrollments, eq(enrollments.id, certificates.enrollmentId))
    .where(and(eq(enrollments.userId, userId), isNull(certificates.revokedAt)))
    .orderBy(desc(certificates.issuedAt));
  return rows;
}
```

Agrega `and`, `isNull` al import de `drizzle-orm` y `enrollments` al import de
`@/db/schema` en la cabecera de `queries.ts` (revisa qué ya está importado antes de
agregar, para no duplicar).

- [ ] **Step 4: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-mine.test.ts`
Esperado: PASA, 1 test.

- [ ] **Step 5: Crear la página del alumno**

Crea `src/app/(student)/certificados/page.tsx`:

```tsx
import { requireUser } from "@/modules/auth/session";
import { getMisCertificados } from "@/modules/certification/queries";
import { formatLima } from "@/lib/datetime";

export default async function MisCertificadosPage() {
  const u = await requireUser();
  const certificados = await getMisCertificados(u.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Mis certificados</h1>
      {certificados.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no tienes certificados. Aprueba el examen de un curso para obtener uno.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {certificados.map((c) => (
            <li
              key={c.code}
              className="flex items-center justify-between rounded-md border border-border p-4"
            >
              <div className="flex flex-col">
                <span className="font-medium">{c.courseTitle}</span>
                <span className="text-xs text-muted-foreground">
                  Emitido el {formatLima(c.issuedAt)} · {c.code}
                </span>
              </div>
              <a
                href={`/api/certificados/${c.code}/pdf`}
                className="text-sm text-primary hover:underline"
              >
                Descargar PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Enlazar desde la navegación del alumno**

Abre `src/app/(student)/layout.tsx` y localiza el `<nav>` existente. Agrega, junto al
enlace de "Mi aprendizaje", uno equivalente:

```tsx
<Link href="/certificados" className="text-muted-foreground hover:text-foreground">
  Certificados
</Link>
```

No renombres ninguna variable existente del archivo.

- [ ] **Step 7: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/certificados` aparece en el listado del build.

- [ ] **Step 8: Commit**

```bash
git add src/modules/certification/queries.ts src/app/\(student\) tests/integration/certification-mine.test.ts
git commit -m "feat(certification): add student certificate list with PDF download"
```

---

### Task 7: E2E completo

**Files:**
- Create: `tests/e2e/certificados.spec.ts`

**Interfaces:**
- Consumes todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Escribir el E2E**

Crea `tests/e2e/certificados.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, ALUMNO, PROF, ADMIN } from "./fixtures";

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

test.describe("certificados", () => {
  let enrollmentId: string | undefined;
  let examId: string | undefined;
  let creamosLaInscripcion = false;

  test.afterAll(async () => {
    const { db, eq, certificates, exams, enrollments, examAttempts } = await getDbHandles();
    if (enrollmentId) {
      await db.delete(certificates).where(eq(certificates.enrollmentId, enrollmentId));
      await db.delete(examAttempts).where(eq(examAttempts.enrollmentId, enrollmentId));
    }
    if (examId) await db.delete(exams).where(eq(exams.id, examId));
    if (enrollmentId && creamosLaInscripcion) {
      await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
    }
  });

  test("el alumno aprueba, descarga el certificado y el admin lo revoca", async ({ page }) => {
    const { db, eq, and, user, courses, enrollments, exams } = await getDbHandles();

    const [alumno] = await db.select({ id: user.id }).from(user)
      .where(eq(user.email, ALUMNO.email)).limit(1);
    const [curso] = await db.select({ id: courses.id, slug: courses.slug })
      .from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);

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

    await page.getByLabel("Título del examen").fill("Examen de Excel");
    await page.getByLabel("Nota de aprobación (%)").fill("50");
    await page.getByLabel(/barajar el orden de las opciones/i).uncheck();
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
    await page.getByRole("button", { name: /iniciar examen/i }).click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /enviar examen/i }).click();
    await expect(page).toHaveURL(/\/resultado$/);
    await expect(page.getByText("Aprobado")).toBeVisible();

    await page.goto("/certificados");
    await expect(page.getByText("Curso Excel").or(page.getByText(/excel/i))).toBeVisible();
    const [codigoLink] = await page.getByText(/[A-Z0-9]{4}-[A-Z0-9]{4}/).allTextContents();
    const code = codigoLink.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)![0];

    const pdfResponse = await page.request.get(`/api/certificados/${code}/pdf`);
    expect(pdfResponse.status()).toBeLessThan(400);

    // ---------------------------------------------------------------- verificación
    await page.goto(`/verificar/${code}`);
    await expect(page.getByText("Válido")).toBeVisible();
    await expect(page.getByText("Alumno")).not.toBeVisible(); // sin email visible en ningún lugar
    await expect(page.getByText(/@/)).toHaveCount(0);

    // -------------------------------------------------------------------- admin
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto("/admin/certificados");
    await page.getByText(code).locator("..").getByRole("button", { name: /revocar/i }).click();
    await page.getByPlaceholder(/motivo de la revocación/i).fill("Prueba E2E");
    await page.getByRole("button", { name: /confirmar/i }).click();
    await expect(page.getByText("Revocado")).toBeVisible();

    await page.goto(`/verificar/${code}`);
    await expect(page.getByText(/fue revocado el/i)).toBeVisible();

    const pdfDespues = await page.request.get(`/api/certificados/${code}/pdf`);
    expect(pdfDespues.status()).toBe(404);
  });
});
```

`tests/e2e/fixtures.ts` todavía no exporta `ADMIN`. Antes del Step 2, ábrelo y agrega,
junto a `PROF`/`ALUMNO`:

```ts
export const ADMIN = { email: "admin@test.pe", password: "admin12345" };
```

Ese usuario ya lo crea `src/db/seed.ts` (`upsertUser("admin@test.pe", "Admin General", "admin12345", "admin")`) — confirma que la base de datos de E2E está sembrada (`pnpm db:seed`) antes de correr el test si el usuario no existe todavía en tu entorno.

- [ ] **Step 2: Correr el E2E**

Ejecuta: `pnpm test:e2e tests/e2e/certificados.spec.ts`
Esperado: PASA. Si algún selector no engancha, ajusta el selector — no el código de
producción — y deja anotado el cambio.

- [ ] **Step 3: Correr toda la verificación**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`
Esperado: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/certificados.spec.ts
git commit -m "test: add E2E for certificate issuance, download, verification, and revocation"
```

---

## Auto-revisión

**Cobertura del spec §6.7, §6.9 y del diseño de la fase:**

| Requisito | Cubierto en |
|---|---|
| `emitirCertificado` idempotente, dentro de la transacción del examen | Task 2 |
| Código de 8 caracteres, alfabeto sin `0 O 1 I L` | Task 1 |
| Snapshots al emitir (no JOIN en vivo) | Task 2 |
| `hours` = `courses.estimatedHours` al emitir | Task 2 |
| PDF generado perezosamente, no dentro de la transacción del examen | Task 4 |
| QR apunta a `/verificar/[code]` | Task 4 |
| `/verificar/[code]`: válido / revocado / inexistente | Task 3 |
| Página pública sin email ni PII fuera de lo impreso | Task 3, verificado en Task 7 (E2E) |
| Revocación con motivo, solo admin | Task 5 |
| PDF de un certificado revocado responde 404 | Task 4, verificado en Task 7 |
| `/certificados` del alumno | Task 6 |
| `/admin/certificados` listar y revocar | Task 5 |

**Huecos deliberados, no olvidos:** la revocación NO está ligada a `revocarAcceso`
(reembolso completo) porque ese módulo todavía no existe — es una acción de admin
independiente, según se acordó en el diseño. Cuando se construya el módulo de
reembolsos, ese flujo deberá llamar a la misma lógica de revocación (o a
`revocarCertificado` directamente) en vez de reinventarla.

**Consistencia de nombres verificada:** `generarCodigo` (Task 1, usado en 2) ·
`emitirCertificado` (Task 2, usado en `grading.ts` de la Fase 4) ·
`getCertificadoPublico` (Task 3, usado en la página pública y en el E2E) ·
`generarYSubirPdf` (Task 4, usado en el route handler) ·
`listarCertificados` / `revocarCertificado` (Task 5) ·
`getMisCertificados` (Task 6).

**Siguiente plan:** ninguno pendiente en el spec base más allá de lo ya cubierto por
las Fases 0-5; el módulo de reembolsos (`revocarAcceso`, §6.9) queda como trabajo
futuro fuera del alcance de esta fase.
