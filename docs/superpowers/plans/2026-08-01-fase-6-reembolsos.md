# Fase 6 — Reembolsos (`revocarAcceso`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `revocarAcceso(orderId, motivo)` — la transacción atómica que reembolsa una orden pagada: revierte la orden, revoca la inscripción, reversa la comisión del instructor y revoca el certificado (si existe) — junto con una página de admin mínima para dispararla.

**Architecture:** Módulo nuevo `src/modules/refunds/` con la misma separación que `billing`/`certification`: `queries.ts` (búsqueda de la orden, sin `"use server"`) y `actions.ts` (`"use server"`, solo `revocarAcceso`). La lógica de revocación del certificado se extrae de `certification/actions.ts` a una función compartida `revocarCertificadoTx(tx, enrollmentId, motivo)` en `certification/issuance.ts`, que solo toca la fila del certificado dentro de una transacción dada, sin llamar a R2 — igual que `emitirCertificado`. Tanto `revocarCertificado` (Fase 5, admin de certificados) como `revocarAcceso` (esta fase) la reutilizan, y cada uno borra el objeto de R2 **después** de que su propia transacción cierra. Una página nueva `/admin/reembolsos` con un formulario de búsqueda (número de orden o email) y un botón de confirmación con motivo, mismo patrón visual que `RevokeCertificateButton`.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle ORM/Postgres, Zod v4, Tailwind v4/shadcn, Vitest.

## Global Constraints

- Todo el texto de la interfaz va en español de Perú. Mensajes de error incluidos.
- Ninguna función exportada de un módulo `"use server"` recibe `userId` como parámetro. Se resuelve dentro con `requireUser()`/`assertRole()`. Todo export de un módulo `"use server"` es un endpoint público sin autenticar.
- `revocarCertificadoTx` NO lleva `"use server"`. Igual que `emitirCertificado` en el mismo archivo: es lógica invocada desde otro módulo dentro de una transacción compartida, no un endpoint.
- `enrollments.status` pasa a `"refunded"` (NO `"revoked"`) al reembolsar — el enum ya distingue ambos valores; `refunded` es el correcto para esta acción.
- `revocarAcceso` es idempotente sobre `orderId`: si la orden ya está `refunded`, no hace nada más (no reenvía el correo), mismo patrón que `aprobarPago` en `billing/actions.ts`.
- `revocarAcceso` rechaza cualquier orden que no esté en estado `"paid"`.
- Todo (orden, inscripción, earnings, certificado) cambia dentro de una única `db.transaction`, o ninguno cambia.
- La revocación del certificado y el borrado de R2 nunca bloquean ni revierten el reembolso si fallan: son best-effort, con `console.error` si fallan, fuera de la transacción principal.
- Formato de commits: `tipo(ámbito): descripción en inglés, imperativo`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `src/modules/certification/issuance.ts` | Modificado: agrega `revocarCertificadoTx(tx, enrollmentId, motivo)`. | 1 |
| `src/modules/certification/actions.ts` | Modificado: `revocarCertificado` reutiliza `revocarCertificadoTx` dentro de su propia transacción. | 1 |
| `src/modules/notifications/templates/refund-processed.ts` | Plantilla de email de confirmación del reembolso. | 2 |
| `src/modules/refunds/queries.ts` | `buscarOrdenParaReembolso(query)`. | 2 |
| `src/modules/refunds/actions.ts` | `revocarAcceso(orderId, motivo)`. | 2 |
| `src/modules/refunds/ui/revoke-access-button.tsx` | Botón de confirmar reembolso (cliente). | 3 |
| `src/app/(admin)/admin/reembolsos/page.tsx` | Búsqueda + confirmación del reembolso. | 3 |
| `tests/integration/certification-revoke-tx.test.ts` | Regresión: `revocarCertificado` sigue funcionando igual tras el refactor de Task 1. | 1 |
| `tests/integration/refunds-actions.test.ts` | `revocarAcceso`: atomicidad, idempotencia, rechazo de estados no pagados, con/sin certificado. | 2 |
| `tests/integration/refunds-queries.test.ts` | `buscarOrdenParaReembolso`: por número de orden, por email, inexistente. | 2 |

## Tabla existente (referencia, ya migrada)

`orders(id, userId, orderNumber UNIQUE, subtotalCents, discountCents, totalCents, currency, status, provider, providerChargeId, paidAt, expiresAt, createdAt)` — `src/db/schema/billing.ts`.
`enrollments(id, userId, courseId, orderId, status, enrolledAt, completedAt)` — `enrollmentStatus` enum: `"active" | "refunded" | "revoked"` — `src/db/schema/enrollment.ts`.
`instructorEarnings(id, orderItemId UNIQUE, instructorId, grossCents, commissionCents, netCents, status, availableAt, payoutId)` — `earningStatus` enum: `"pending" | "available" | "paid" | "reversed"` — `src/db/schema/earnings.ts`.
`certificates(id, enrollmentId UNIQUE, code UNIQUE, issuedAt, studentName, courseTitle, instructorName, academyName, hours, finalScore, pdfKey, revokedAt, revokeReason)` — `src/db/schema/certification.ts`.

**Orden de borrado en los tests** (respeta las FK): `certificates` → `instructorEarnings` → `enrollments` → `orderItems` → `orders` → `courses` → `user`.

---

### Task 1: Extraer `revocarCertificadoTx` compartida

**Files:**
- Modify: `src/modules/certification/issuance.ts`
- Modify: `src/modules/certification/actions.ts`
- Test: `tests/integration/certification-revoke-tx.test.ts`

**Interfaces:**
- Consumes: nada nuevo — reutiliza `certificates` (`@/db/schema`), el tipo `Transaccion` ya definido en `issuance.ts`.
- Produces: `revocarCertificadoTx(tx: Transaccion, enrollmentId: string, motivo: string): Promise<{ pdfKey: string | null } | null>` — para Task 2.

**Contrato exacto de `revocarCertificadoTx`:**
- Busca el certificado por `enrollmentId` dentro de `tx`.
- Si no existe ninguna fila (el alumno nunca aprobó el examen), devuelve `null` sin tocar nada.
- Si existe y ya tiene `revokedAt` (ya estaba revocado), devuelve `null` sin volver a escribir — idempotente, evita pisar `revokeReason`/`revokedAt` originales.
- Si existe y NO está revocado, hace `UPDATE` fijando `revokedAt = new Date()`, `revokeReason = motivo.trim()`, `pdfKey = null`, y devuelve `{ pdfKey: <valor ANTERIOR al UPDATE> }` (para que el llamador borre ese objeto de R2 después).

- [ ] **Step 1: Leer el archivo actual para confirmar el contexto exacto**

Lee `src/modules/certification/issuance.ts` completo (ya tiene `emitirCertificado`, el tipo `Transaccion`, y los imports de `certificates`, `enrollments`, etc.) y `src/modules/certification/actions.ts` completo (tiene `revocarCertificado` con su propio `db.select` + `deleteObject` + `db.update`).

- [ ] **Step 2: Escribir el test que falla**

Crea `tests/integration/certification-revoke-tx.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, enrollments, certificates,
} from "@/db/schema";

vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

let enrollmentId: string;
let enrollmentSinCertId: string;
let certificateId: string;

beforeEach(async () => {
  await db.delete(certificates);
  await db.delete(enrollments);
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
  const [c2] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-y", title: "Curso Y", priceCents: 100,
  }).returning();

  const [e1] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c.id, status: "active",
  }).returning();
  enrollmentId = e1.id;

  const [cert] = await db.insert(certificates).values({
    enrollmentId, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso X",
    instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
    pdfKey: "certificados/AB23-CD45/pdf/certificado.pdf",
  }).returning();
  certificateId = cert.id;

  // Inscripción a OTRO curso (el UNIQUE de enrollments es por usuario+curso),
  // sin certificado — cubre el camino "alumno nunca aprobó el examen".
  const [e2] = await db.insert(enrollments).values({
    userId: alumno.id, courseId: c2.id, status: "active",
  }).returning();
  enrollmentSinCertId = e2.id;
});

describe("revocarCertificadoTx", () => {
  it("revoca el certificado y devuelve la pdfKey anterior", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    const resultado = await db.transaction(async (tx) => {
      return revocarCertificadoTx(tx, enrollmentId, "Reembolso");
    });

    expect(resultado).toEqual({ pdfKey: "certificados/AB23-CD45/pdf/certificado.pdf" });

    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokedAt).not.toBeNull();
    expect(cert.revokeReason).toBe("Reembolso");
    expect(cert.pdfKey).toBeNull();
  });

  it("no hace nada si la inscripción no tiene certificado", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    const resultado = await db.transaction(async (tx) => {
      return revocarCertificadoTx(tx, enrollmentSinCertId, "Reembolso");
    });

    expect(resultado).toBeNull();
  });

  it("es idempotente: no vuelve a escribir si ya estaba revocado", async () => {
    const { revocarCertificadoTx } = await import("@/modules/certification/issuance");

    await db.transaction(async (tx) => revocarCertificadoTx(tx, enrollmentId, "Primer motivo"));
    const segundo = await db.transaction(async (tx) => revocarCertificadoTx(tx, enrollmentId, "Segundo motivo"));

    expect(segundo).toBeNull();
    const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
    expect(cert.revokeReason).toBe("Primer motivo");
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/certification-revoke-tx.test.ts`
Esperado: FALLA con `revocarCertificadoTx is not a function` o error de import.

- [ ] **Step 4: Agregar `revocarCertificadoTx` a `issuance.ts`**

Añade al final de `src/modules/certification/issuance.ts` (después de `emitirCertificado`, reutilizando el `Transaccion` type y el import de `certificates` ya presentes en el archivo):

```ts
/**
 * Revoca el certificado de una inscripción dentro de una transacción dada
 * (no abre una propia). No toca R2 — el llamador debe borrar el `pdfKey`
 * devuelto de R2 DESPUÉS de que su transacción cierre. Idempotente: si no
 * hay certificado, o ya estaba revocado, devuelve `null` sin escribir.
 */
export async function revocarCertificadoTx(
  tx: Transaccion,
  enrollmentId: string,
  motivo: string
): Promise<{ pdfKey: string | null } | null> {
  const [cert] = await tx
    .select({ id: certificates.id, pdfKey: certificates.pdfKey, revokedAt: certificates.revokedAt })
    .from(certificates)
    .where(eq(certificates.enrollmentId, enrollmentId))
    .limit(1);
  if (!cert || cert.revokedAt) return null;

  await tx
    .update(certificates)
    .set({ revokedAt: new Date(), revokeReason: motivo.trim(), pdfKey: null })
    .where(eq(certificates.id, cert.id));

  return { pdfKey: cert.pdfKey };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/certification-revoke-tx.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Step 6: Refactorizar `revocarCertificado` para reutilizar `revocarCertificadoTx`**

Abre `src/modules/certification/actions.ts`. Reemplaza el contenido completo de la función `revocarCertificado` para que envuelva la parte de BD en una transacción y reutilice `revocarCertificadoTx`, manteniendo exactamente el mismo comportamiento externo (mismos mensajes de error, mismo orden de validaciones):

```ts
"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { deleteObject } from "@/lib/r2";
import { revocarCertificadoTx } from "./issuance";

export async function revocarCertificado(certificateId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo de la revocación.");
  }

  const [cert] = await db.select({ id: certificates.id, enrollmentId: certificates.enrollmentId })
    .from(certificates).where(eq(certificates.id, certificateId)).limit(1);
  if (!cert) throw new Error("Certificado no encontrado.");

  const resultado = await db.transaction(async (tx) => {
    return revocarCertificadoTx(tx, cert.enrollmentId, motivo);
  });

  // Invalida el PDF ya subido a R2: si no lo borramos, una URL prefirmada
  // emitida antes de la revocación sigue sirviendo el PDF durante su tiempo
  // de vida, y el endpoint volvería a generarlo si el objeto siguiera
  // existiendo con `pdfKey` sin limpiar.
  if (resultado?.pdfKey) {
    await deleteObject(resultado.pdfKey);
  }

  revalidatePath("/admin/certificados");
}
```

Nota: el guard `!cert` ahora se basa en la existencia del certificado por `certificateId` (igual que antes), no en el resultado de `revocarCertificadoTx` — así el mensaje "Certificado no encontrado." se preserva exactamente igual que antes del refactor.

- [ ] **Step 7: Correr toda la suite de certificación para verificar que no hay regresión**

Ejecuta: `pnpm vitest run tests/integration/certification-admin.test.ts tests/integration/certification-revoke-tx.test.ts`
Esperado: PASA — todos los tests existentes de `certification-admin.test.ts` (incluidos "fija revokedAt y revokeReason", "rechaza sin motivo", "rechaza un certificado inexistente", "borra el pdfKey al revocar") siguen pasando exactamente igual que antes del refactor, más los 3 tests nuevos de `certification-revoke-tx.test.ts`.

- [ ] **Step 8: Verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/modules/certification/issuance.ts src/modules/certification/actions.ts tests/integration/certification-revoke-tx.test.ts
git commit -m "refactor(certification): extract revocarCertificadoTx for reuse in refunds"
```

---

### Task 2: `revocarAcceso` y búsqueda de la orden

**Files:**
- Create: `src/modules/notifications/templates/refund-processed.ts`
- Create: `src/modules/refunds/queries.ts`
- Create: `src/modules/refunds/actions.ts`
- Test: `tests/integration/refunds-queries.test.ts`
- Test: `tests/integration/refunds-actions.test.ts`

**Interfaces:**
- Consumes de Task 1: `revocarCertificadoTx(tx, enrollmentId, motivo)` de `@/modules/certification/issuance`.
- Consumes del código existente: `db.transaction`, tablas `orders`, `orderItems`, `enrollments`, `instructorEarnings`, `certificates`, `user`; `deleteObject` de `@/lib/r2`; `assertRole` de `@/modules/auth/session`; `sendEmail` de `@/modules/notifications/mailer`; `computeCommission` NO es necesario aquí (no se recalcula comisión, solo se marca `reversed`).
- Produces:
  - `buscarOrdenParaReembolso(query: string): Promise<OrdenParaReembolso | null>` — para Task 3.
  - Tipo `OrdenParaReembolso`.
  - `revocarAcceso(orderId: string, motivo: string): Promise<void>` — para Task 3.

**Contrato exacto de `revocarAcceso`:**
1. `assertRole(["admin"])`.
2. Rechaza `motivo` vacío/solo-espacios con `"Escribe el motivo del reembolso."`.
3. Carga la orden por `orderId`. Si no existe, `"Orden no encontrada."`.
4. Si `order.status === "refunded"`, retorna sin hacer nada más (idempotente, sin reenviar email).
5. Si `order.status !== "paid"`, `"Solo se pueden reembolsar órdenes pagadas."`.
6. Dentro de UNA `db.transaction`:
   - `orders.status = "refunded"`.
   - `enrollments.status = "refunded"` donde `enrollments.orderId = orderId`.
   - `instructorEarnings.status = "reversed"` donde `instructorEarnings.orderItemId` pertenece a un `orderItem` de esa orden.
   - Si hay una inscripción (`enrollments.orderId = orderId`), llama `revocarCertificadoTx(tx, enrollment.id, motivo)`.
7. Fuera de la transacción: si el paso anterior devolvió `{ pdfKey }` no nulo, `deleteObject(pdfKey)` (envuelto en try/catch con `console.error`, no relanza).
8. Envía el email `refund-processed` al comprador (envuelto en try/catch vía `sendEmail`, que ya no lanza — revisa `mailer.ts`: `sendEmail` devuelve `{ ok }`, nunca lanza).
9. `revalidatePath("/admin/reembolsos")`.

- [ ] **Step 1: Escribir el test que falla — `buscarOrdenParaReembolso`**

Crea `tests/integration/refunds-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, courses, orders, orderItems } from "@/db/schema";
import { buscarOrdenParaReembolso } from "@/modules/refunds/queries";

let studentId: string;
let orderId: string;

beforeEach(async () => {
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [prof] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno Buscado", email: "buscado@test.pe", emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-buscar", title: "Curso a Buscar", priceCents: 10000,
  }).returning();

  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: "PED-2026-8001",
    subtotalCents: 10000, totalCents: 10000, status: "paid", paidAt: new Date(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();
  orderId = o.id;

  await db.insert(orderItems).values({
    orderId: o.id, courseId: c.id, instructorId: prof.id, titleSnapshot: "Curso a Buscar",
    unitPriceCents: 10000, commissionRate: "30.00", commissionCents: 3000, netCents: 7000,
  });
});

describe("buscarOrdenParaReembolso", () => {
  it("encuentra la orden por número exacto", async () => {
    const r = await buscarOrdenParaReembolso("PED-2026-8001");
    expect(r).not.toBeNull();
    expect(r!.orderId).toBe(orderId);
    expect(r!.buyerEmail).toBe("buscado@test.pe");
    expect(r!.courseTitle).toBe("Curso a Buscar");
    expect(r!.status).toBe("paid");
  });

  it("encuentra la orden por email del comprador", async () => {
    const r = await buscarOrdenParaReembolso("buscado@test.pe");
    expect(r).not.toBeNull();
    expect(r!.orderId).toBe(orderId);
  });

  it("devuelve null si no encuentra nada", async () => {
    expect(await buscarOrdenParaReembolso("PED-2026-9999")).toBeNull();
    expect(await buscarOrdenParaReembolso("nadie@test.pe")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/refunds-queries.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/refunds/queries"`.

- [ ] **Step 3: Escribir `queries.ts`**

Crea `src/modules/refunds/queries.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, user, enrollments } from "@/db/schema";

export interface OrdenParaReembolso {
  orderId: string;
  orderNumber: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  totalCents: number;
  paidAt: Date | null;
  courseTitle: string;
  buyerName: string;
  buyerEmail: string;
  enrollmentId: string | null;
}

/**
 * Busca la orden a reembolsar por número exacto (si `query` no contiene
 * "@") o por email del comprador (si lo contiene). El admin normalmente ya
 * tiene uno de los dos a mano cuando procesa un reembolso.
 */
export async function buscarOrdenParaReembolso(query: string): Promise<OrdenParaReembolso | null> {
  const q = query.trim();
  if (!q) return null;

  const condicion = q.includes("@") ? eq(user.email, q) : eq(orders.orderNumber, q);

  const [row] = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalCents: orders.totalCents,
      paidAt: orders.paidAt,
      courseTitle: orderItems.titleSnapshot,
      buyerName: user.name,
      buyerEmail: user.email,
      enrollmentId: enrollments.id,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(user, eq(user.id, orders.userId))
    .leftJoin(enrollments, eq(enrollments.orderId, orders.id))
    .where(condicion)
    .limit(1);

  return row ?? null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Ejecuta: `pnpm vitest run tests/integration/refunds-queries.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Step 5: Escribir el test que falla — `revocarAcceso`**

Crea `tests/integration/refunds-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, orders, orderItems, enrollments, instructorEarnings, certificates,
} from "@/db/schema";

let adminId: string;
let studentId: string;
let profId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: adminId, role: "admin", name: "Admin" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/notifications/mailer", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

const { revocarAcceso } = await import("@/modules/refunds/actions");
const { sendEmail } = await import("@/modules/notifications/mailer");

async function crearOrdenPagada(status: "paid" | "pending" | "refunded" = "paid", conCertificado = false) {
  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: `PED-2026-${Math.floor(Math.random() * 100000)}`,
    subtotalCents: 10000, totalCents: 10000, status,
    paidAt: status === "paid" || status === "refunded" ? new Date() : null,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();

  const [item] = await db.insert(orderItems).values({
    orderId: o.id, courseId: cursoId, instructorId: profId, titleSnapshot: "Curso",
    unitPriceCents: 10000, commissionRate: "30.00", commissionCents: 3000, netCents: 7000,
  }).returning();

  const [enr] = await db.insert(enrollments).values({
    userId: studentId, courseId: cursoId, orderId: o.id, status: "active",
  }).returning();

  const [earning] = await db.insert(instructorEarnings).values({
    orderItemId: item.id, instructorId: profId,
    grossCents: 10000, commissionCents: 3000, netCents: 7000,
    status: "pending", availableAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).returning();

  if (conCertificado) {
    await db.insert(certificates).values({
      enrollmentId: enr.id, code: "AB23-CD45", studentName: "Alumno", courseTitle: "Curso",
      instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
    });
  }

  return { orderId: o.id, enrollmentId: enr.id, earningId: earning.id };
}

beforeEach(async () => {
  await db.delete(certificates);
  await db.delete(instructorEarnings);
  await db.delete(enrollments);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Admin", email: "adm@test.pe", emailVerified: true, role: "admin",
  }).returning();
  adminId = a.id;

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe", emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe", emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "curso-reembolso", title: "Curso", priceCents: 10000,
  }).returning();
  cursoId = c.id;

  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  await db.delete(certificates);
  await db.delete(instructorEarnings);
  await db.delete(enrollments);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);
});

describe("revocarAcceso", () => {
  it("revierte orden, inscripción y earning en una sola transacción", async () => {
    const { orderId } = await crearOrdenPagada("paid");

    await revocarAcceso(orderId, "El alumno solicitó reembolso.");

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("refunded");

    const [enr] = await db.select().from(enrollments).where(eq(enrollments.orderId, orderId));
    expect(enr.status).toBe("refunded");

    const [earning] = await db
      .select({ status: instructorEarnings.status })
      .from(instructorEarnings)
      .innerJoin(orderItems, eq(orderItems.id, instructorEarnings.orderItemId))
      .where(eq(orderItems.orderId, orderId));
    expect(earning.status).toBe("reversed");
  });

  it("revoca el certificado si existe", async () => {
    const { orderId, enrollmentId } = await crearOrdenPagada("paid", true);

    await revocarAcceso(orderId, "Reembolso");

    const [cert] = await db.select().from(certificates).where(eq(certificates.enrollmentId, enrollmentId));
    expect(cert.revokedAt).not.toBeNull();
    expect(cert.revokeReason).toBe("Reembolso");
  });

  it("no falla si la inscripción nunca generó certificado", async () => {
    const { orderId } = await crearOrdenPagada("paid", false);
    await expect(revocarAcceso(orderId, "Reembolso")).resolves.not.toThrow();
  });

  it("es idempotente: llamarlo dos veces no reenvía el email ni falla", async () => {
    const { orderId } = await crearOrdenPagada("paid");

    await revocarAcceso(orderId, "Reembolso");
    expect(sendEmail).toHaveBeenCalledTimes(1);

    await revocarAcceso(orderId, "Reembolso otra vez");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("rechaza una orden que no está pagada", async () => {
    const { orderId } = await crearOrdenPagada("pending");
    await expect(revocarAcceso(orderId, "Reembolso")).rejects.toThrow(/pagadas/i);
  });

  it("rechaza sin motivo", async () => {
    const { orderId } = await crearOrdenPagada("paid");
    await expect(revocarAcceso(orderId, "")).rejects.toThrow(/motivo/i);
  });

  it("rechaza una orden inexistente", async () => {
    await expect(revocarAcceso(crypto.randomUUID(), "Motivo")).rejects.toThrow(/no encontrada/i);
  });
});
```

- [ ] **Step 6: Correr el test para verificar que falla**

Ejecuta: `pnpm vitest run tests/integration/refunds-actions.test.ts`
Esperado: FALLA con `Failed to resolve import "@/modules/refunds/actions"`.

- [ ] **Step 7: Crear la plantilla de email**

Crea `src/modules/notifications/templates/refund-processed.ts`:

```ts
import { env } from "@/env";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function refundProcessedTemplate(input: { name: string; courseTitle: string; motivo: string }) {
  return {
    subject: `Reembolso procesado — ${input.courseTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Procesamos el reembolso de tu compra de <strong>${escapeHtml(input.courseTitle)}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
  <p>Tu acceso al curso fue revocado. Motivo: ${escapeHtml(input.motivo)}</p>
</div>`.trim(),
  };
}
```

- [ ] **Step 8: Escribir `actions.ts`**

Crea `src/modules/refunds/actions.ts`:

```ts
"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderItems, enrollments, instructorEarnings, user } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { revocarCertificadoTx } from "@/modules/certification/issuance";
import { deleteObject } from "@/lib/r2";
import { sendEmail } from "@/modules/notifications/mailer";
import { refundProcessedTemplate } from "@/modules/notifications/templates/refund-processed";

export async function revocarAcceso(orderId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo del reembolso.");
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Orden no encontrada.");
  if (order.status === "refunded") return; // idempotente: ya se reembolsó antes
  if (order.status !== "paid") {
    throw new Error("Solo se pueden reembolsar órdenes pagadas.");
  }

  const pdfKeyAEliminar = await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId));

    const [enr] = await tx.select({ id: enrollments.id })
      .from(enrollments).where(eq(enrollments.orderId, orderId)).limit(1);
    if (enr) {
      await tx.update(enrollments).set({ status: "refunded" }).where(eq(enrollments.id, enr.id));
    }

    const items = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx.update(instructorEarnings)
        .set({ status: "reversed" })
        .where(eq(instructorEarnings.orderItemId, item.id));
    }

    if (!enr) return null;
    const resultado = await revocarCertificadoTx(tx, enr.id, motivo);
    return resultado?.pdfKey ?? null;
  });

  if (pdfKeyAEliminar) {
    try {
      await deleteObject(pdfKeyAEliminar);
    } catch (err) {
      console.error("Error borrando el PDF del certificado revocado por reembolso:", pdfKeyAEliminar, err);
    }
  }

  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = await db.select().from(user).where(eq(user.id, order.userId)).limit(1);
  if (item && buyer) {
    const { subject, html } = refundProcessedTemplate({
      name: buyer.name, courseTitle: item.titleSnapshot, motivo: motivo.trim(),
    });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "refund-processed", subject, html });
  }

  revalidatePath("/admin/reembolsos");
}
```

- [ ] **Step 9: Correr los tests para verificar que pasan**

Ejecuta: `pnpm vitest run tests/integration/refunds-actions.test.ts`
Esperado: PASA, 7 tests.

- [ ] **Step 10: Correr toda la suite de certificación y billing para verificar que no hay regresión**

Ejecuta: `pnpm vitest run tests/integration/certification-admin.test.ts tests/integration/certification-revoke-tx.test.ts tests/integration/billing-approve.test.ts tests/integration/refunds-queries.test.ts tests/integration/refunds-actions.test.ts`
Esperado: todo en verde.

- [ ] **Step 11: Verificar tipos**

Ejecuta: `pnpm exec tsc --noEmit`
Esperado: sin errores.

- [ ] **Step 12: Commit**

```bash
git add src/modules/notifications/templates/refund-processed.ts src/modules/refunds/queries.ts src/modules/refunds/actions.ts tests/integration/refunds-queries.test.ts tests/integration/refunds-actions.test.ts
git commit -m "feat(refunds): add revocarAcceso transaction and order lookup"
```

---

### Task 3: UI de admin — buscar y confirmar reembolso

**Files:**
- Create: `src/modules/refunds/ui/revoke-access-button.tsx`
- Create: `src/app/(admin)/admin/reembolsos/page.tsx`
- Modify: `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes de Task 2: `buscarOrdenParaReembolso(query)`, `revocarAcceso(orderId, motivo)`.
- Produces: nada — es la última pieza consumidora.

- [ ] **Step 1: Crear el botón de confirmar reembolso**

Crea `src/modules/refunds/ui/revoke-access-button.tsx` (mismo patrón que `RevokeCertificateButton` en `src/modules/certification/ui/revoke-certificate-button.tsx`):

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revocarAcceso } from "@/modules/refunds/actions";

export function RevokeAccessButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);

  function revocar() {
    if (!motivo.trim()) return toast.error("Escribe el motivo del reembolso.");
    startTransition(async () => {
      try {
        await revocarAcceso(orderId, motivo);
        toast.success("Reembolso procesado.");
        setAbierto(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo procesar el reembolso.");
      }
    });
  }

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={() => setAbierto(true)}>
        Revocar acceso y reembolsar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Motivo del reembolso"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-8"
      />
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={revocar}>
        Confirmar
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Crear la página de admin**

Crea `src/app/(admin)/admin/reembolsos/page.tsx`:

```tsx
import { buscarOrdenParaReembolso } from "@/modules/refunds/queries";
import { RevokeAccessButton } from "@/modules/refunds/ui/revoke-access-button";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";
import { formatPEN } from "@/lib/money";

export default async function AdminReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const orden = q ? await buscarOrdenParaReembolso(q) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reembolsos</h1>

      <form className="flex items-center gap-3" action="/admin/reembolsos">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Número de orden o email del alumno"
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Buscar
        </button>
      </form>

      {q && !orden && (
        <p className="text-muted-foreground">No encontramos ninguna orden con ese número o email.</p>
      )}

      {orden && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {orden.orderNumber} · {orden.buyerName} · {orden.courseTitle}
            </span>
            {orden.status === "refunded" && <Badge variant="secondary">Reembolsada</Badge>}
            {orden.status === "paid" && <Badge>Pagada</Badge>}
            {orden.status !== "paid" && orden.status !== "refunded" && (
              <Badge variant="outline">{orden.status}</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {formatPEN(orden.totalCents)}
            {orden.paidAt && ` · Pagada el ${formatLima(orden.paidAt)}`}
          </div>
          {orden.status === "paid" && <RevokeAccessButton orderId={orden.orderId} />}
          {orden.status !== "paid" && orden.status !== "refunded" && (
            <p className="text-sm text-muted-foreground">
              Esta orden no está pagada, no se puede reembolsar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Enlazar el panel desde la navegación del admin**

Abre `src/app/(admin)/layout.tsx` y agrega, junto a los enlaces existentes (`Pagos`, `Cursos`, `Mi aprendizaje`, `Certificados`), un enlace equivalente, respetando el mismo componente `Link` y las mismas clases que sus vecinos:

```tsx
<Link href="/admin/reembolsos" className="text-muted-foreground hover:text-foreground">
  Reembolsos
</Link>
```

No renombres ninguna variable existente del archivo.

- [ ] **Step 4: Verificar tipos, lint y build**

Ejecuta: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Esperado: sin errores; la ruta `/admin/reembolsos` aparece en el listado del build.

- [ ] **Step 5: Commit**

```bash
git add src/modules/refunds/ui src/app/\(admin\)/admin/reembolsos src/app/\(admin\)/layout.tsx
git commit -m "feat(refunds): add admin page to search orders and process refunds"
```

---

## Auto-revisión

**Cobertura del spec §6.9 y del diseño de la fase:**

| Requisito | Cubierto en |
|---|---|
| `revocarAcceso(orderId, motivo)` transaccional: `order.status=refunded`, `enrollment.status` revocado, `earnings.status=reversed`, certificado revocado | Task 2 |
| `enrollments.status = "refunded"` (no `"revoked"`, decisión del diseño) | Task 2 |
| Earnings ya `paid` quedan `reversed` igual (deuda del instructor, sin mecanismo de cobro — fuera de alcance) | Task 2 |
| Reuso de la revocación del certificado en vez de reinventarla | Task 1 |
| No revierte una orden que no esté `paid` | Task 2 |
| Idempotente sobre `orderId` | Task 2 |
| `revocarAcceso` no recibe `userId` | Task 2 |
| Notificación por email al alumno | Task 2 |
| UI de admin con búsqueda por orden/email | Task 3 |

**Huecos deliberados, no olvidos:** liquidaciones/payouts a instructores (cobro de la
deuda que deja un earning `reversed` que ya estaba `paid`), cupones, Libro de
Reclamaciones, gestión de usuarios, y páginas legales de contenido estático
(Términos, Privacidad, Política de Reembolso) quedan fuera de esta fase, según lo
acordado en el diseño.

**Consistencia de nombres verificada:** `revocarCertificadoTx` (Task 1, usado en
`certification/actions.ts` y en Task 2) · `buscarOrdenParaReembolso` (Task 2, usado
en Task 3) · `revocarAcceso` (Task 2, usado en Task 3) · `refundProcessedTemplate`
(Task 2, usado internamente en `actions.ts`) · `RevokeAccessButton` (Task 3).

**Siguiente plan:** ninguno pendiente del spec base salvo los huecos deliberados de
arriba, que quedan como trabajo futuro fuera del alcance de esta fase.
