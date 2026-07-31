# Pago Manual (Yape/Plin/Transferencia) — Plan de Implementación (Fase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un alumno puede crear una orden para un curso publicado, ver la pantalla de pago con QR/Yape/Plin/CCI, subir su comprobante, y un admin puede aprobarlo o rechazarlo desde una cola en `/admin/pagos`. Aprobar crea la inscripción y la comisión del instructor de forma atómica. Al final de esta fase ya se puede cobrar y dar acceso — es el corte que menciona la sección 6 del spec.

**Architecture:** Nuevo módulo `src/modules/billing/` (`service.ts` puro, `queries.ts`, `actions.ts`, `ui/`), route group `(student)` nuevo con `/pago/[orderNumber]`, página `/admin/pagos` en el route group `(admin)` ya existente. El esquema de las 8 tablas de facturación ya está migrado desde la Fase 0 (Task 3) — esta fase no toca DDL salvo una secuencia para el número de orden.

**Tech Stack:** el mismo de la Fase 0-1: Next.js 16 App Router, Drizzle + Postgres, Better Auth, R2 (S3 SDK) para comprobantes, nodemailer/MailHog, Turnstile, Vitest, Playwright.

## Global Constraints

Aplican a **todas** las tareas de este plan, además de las de `docs/superpowers/plans/2026-07-29-fase-0-1-fundacion-y-catalogo.md`.

- **No hay carrito multi-curso.** Cada orden tiene exactamente un `order_item`. Explícitamente fuera de alcance por el spec (§11).
- **No hay pagos parciales.** Un comprobante se aprueba o se rechaza, nunca "parcial".
- **Precios y comisión siempre recalculados en el servidor**, nunca leídos del cliente.
- **`commission_rate` se fija en `order_items` al crear la orden y nunca se vuelve a leer del perfil.** Ver la nota de desviación de la Task 1: este plan inserta `order_items` en `crearOrden`, no dentro de `aprobarPago` como sugiere la prosa del spec — la invariante contable (fijar la tasa una sola vez, no releerla) se cumple igual.
- **`aprobarPago` es la única función que crea inscripciones y earnings desde un pago.** El futuro webhook de Culqi (fase posterior) la reutiliza tal cual.
- **Turnstile obligatorio en la subida de comprobante** (spec §7.2).
- **Comprobantes de pago (imagen + DNI) solo visibles para admin.** Nunca se sirven a otro usuario, ni siquiera al dueño de la orden después de aprobado.
- **`YAPE_MAX_CENTS`** (ya en `.env.local` desde la Fase 0) decide si se atenúa Yape/Plin a favor de transferencia.
- **Comisiones:** en inglés, formato convencional. Uno por tarea como mínimo.
- **Tests:** Vitest para unidad e integración, Playwright para E2E. Toda tarea con lógica de negocio empieza por un test que falla.

---

## Estructura de archivos

Lo que se agrega o modifica en esta fase.

```
drizzle/000X_....sql            nueva migración: secuencia order_number_seq

src/
  db/
    schema/
      billing.ts                 modificado: + orderNumberSeq
    seed.ts                      modificado: + payment_destinations de prueba

  lib/
    r2.ts                        sin cambios, se reutiliza presignPut/presignGet

  modules/
    billing/
      service.ts                 lógica pura: totales, cupón, comisión, validación de comprobante
      queries.ts                 nextOrderNumber, getOrderByNumber, listPendingProofs, getActivePaymentDestinations
      actions.ts                 crearOrden, submitPaymentProof, aprobarPago, rechazarPago
      ui/
        payment-proof-form.tsx   sube comprobante (Turnstile + R2 directo)
        admin-proof-review.tsx   aprobar/rechazar desde /admin/pagos
    notifications/
      templates/
        payment-proof-received.ts   aviso al admin
        order-approved.ts           "tu acceso está listo" al alumno
        order-rejected.ts           motivo del rechazo al alumno

  app/
    (student)/
      layout.tsx                 guard: requireUser (cualquier rol logueado)
      pago/[orderNumber]/page.tsx
    (admin)/
      admin/pagos/page.tsx
    api/
      cron/
        expirar-ordenes/route.ts   auth por CRON_SECRET
      r2/
        payment-proof-upload-url/route.ts

tests/
  unit/
    billing-service.test.ts
  integration/
    billing-actions.test.ts
    billing-approve.test.ts
    order-expiry.test.ts
  e2e/
    pago.spec.ts
```

---

## Tareas

### Task 1: Secuencia de número de orden y `crearOrden`

**Files:**
- Modify: `src/db/schema/billing.ts` (+ `orderNumberSeq`)
- Create: `src/modules/billing/service.ts`
- Create: `src/modules/billing/queries.ts`
- Create: `src/modules/billing/actions.ts`
- Create: `tests/unit/billing-service.test.ts`
- Create: `tests/integration/billing-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `orders`, `orderItems`, `coupons`, `courses`, `user`, `resolveCommissionRate` (de `@/modules/catalog/service`), `requireUser`, `isEnrolled`, `solesToCents`.
- Produces:
  - `computeOrderTotals(priceCents: number, coupon: { type: "percent" | "fixed"; value: number } | null): { subtotalCents: number; discountCents: number; totalCents: number }`
  - `isCouponValid(coupon: CouponRow, courseId: string, now: Date): { ok: true } | { ok: false; reason: string }`
  - `computeCommission(unitPriceCents: number, commissionRate: string): { commissionCents: number; netCents: number }`
  - `nextOrderNumber(): Promise<string>`
  - `crearOrden(courseId: string, couponCode?: string): Promise<{ orderNumber: string }>`

**Nota de desviación (deliberada, no un bug):** el spec (§6.2) muestra `INSERT order_item` dentro de la transacción de `aprobarPago`. Este plan lo mueve a `crearOrden`, junto con el `orders` insert, porque la tabla `orders` no tiene `course_id` — sin el `order_item` desde el inicio, la pantalla `/pago/[orderNumber]` no podría mostrar qué se está comprando. La invariante real del spec ("`commission_rate` se copia y nunca se relee del perfil") se preserva: se fija una sola vez, en `crearOrden`, y `aprobarPago` solo la lee.

- [ ] **Step 1: Secuencia para el número de orden**

Al final de `src/db/schema/billing.ts`, después de los imports existentes añade:

```ts
import { pgSequence } from "drizzle-orm/pg-core";
```

Y al final del archivo:

```ts
export const orderNumberSeq = pgSequence("order_number_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
});
```

- [ ] **Step 2: Generar y aplicar la migración**

```bash
pnpm db:generate
pnpm db:migrate
```

Esperado: una migración nueva que solo crea la secuencia, ninguna tabla.

- [ ] **Step 3: Escribir los tests de lógica pura**

`tests/unit/billing-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeOrderTotals, isCouponValid, computeCommission } from "@/modules/billing/service";

describe("computeOrderTotals", () => {
  it("sin cupón, el total es el precio del curso", () => {
    expect(computeOrderTotals(19900, null)).toEqual({
      subtotalCents: 19900, discountCents: 0, totalCents: 19900,
    });
  });

  it("cupón porcentual", () => {
    expect(computeOrderTotals(20000, { type: "percent", value: 20 })).toEqual({
      subtotalCents: 20000, discountCents: 4000, totalCents: 16000,
    });
  });

  it("cupón fijo nunca deja el total negativo", () => {
    expect(computeOrderTotals(5000, { type: "fixed", value: 9900 })).toEqual({
      subtotalCents: 5000, discountCents: 5000, totalCents: 0,
    });
  });

  it("redondea el porcentaje a céntimos enteros", () => {
    expect(computeOrderTotals(9999, { type: "percent", value: 33 })).toEqual({
      subtotalCents: 9999, discountCents: 3300, totalCents: 6699,
    });
  });
});

describe("isCouponValid", () => {
  const base = {
    isActive: true, courseId: null as string | null,
    validFrom: null as Date | null, validUntil: null as Date | null,
    maxUses: null as number | null, usedCount: 0,
  };
  const now = new Date("2026-08-01T00:00:00Z");

  it("acepta un cupón sin restricciones", () => {
    expect(isCouponValid(base, "curso-1", now)).toEqual({ ok: true });
  });

  it("rechaza un cupón inactivo", () => {
    const r = isCouponValid({ ...base, isActive: false }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("rechaza fuera de la ventana de vigencia", () => {
    const r = isCouponValid(
      { ...base, validUntil: new Date("2026-07-01T00:00:00Z") }, "curso-1", now
    );
    expect(r.ok).toBe(false);
  });

  it("rechaza si ya alcanzó el máximo de usos", () => {
    const r = isCouponValid({ ...base, maxUses: 5, usedCount: 5 }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("rechaza si el cupón es de otro curso", () => {
    const r = isCouponValid({ ...base, courseId: "curso-2" }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("acepta si el cupón es del mismo curso", () => {
    expect(isCouponValid({ ...base, courseId: "curso-1" }, "curso-1", now)).toEqual({ ok: true });
  });
});

describe("computeCommission", () => {
  it("calcula comisión y neto redondeando a céntimos", () => {
    expect(computeCommission(19900, "30.00")).toEqual({ commissionCents: 5970, netCents: 13930 });
  });

  it("una comisión de 0 deja el neto igual al bruto", () => {
    expect(computeCommission(10000, "0.00")).toEqual({ commissionCents: 0, netCents: 10000 });
  });

  it("redondea correctamente montos que no dan entero exacto", () => {
    // 9999 * 33% = 3299.67 -> redondeado 3300
    expect(computeCommission(9999, "33.00")).toEqual({ commissionCents: 3300, netCents: 6699 });
  });
});
```

- [ ] **Step 4: Verificar que fallan**

```bash
pnpm test tests/unit/billing-service.test.ts
```

Esperado: **FALLA**, módulo no encontrado.

- [ ] **Step 5: Implementar `service.ts`**

`src/modules/billing/service.ts`:

```ts
export interface CouponInput {
  type: "percent" | "fixed";
  value: number;
}

export function computeOrderTotals(
  priceCents: number,
  coupon: CouponInput | null
): { subtotalCents: number; discountCents: number; totalCents: number } {
  const subtotalCents = priceCents;
  let discountCents = 0;
  if (coupon) {
    discountCents = coupon.type === "percent"
      ? Math.round((subtotalCents * coupon.value) / 100)
      : coupon.value;
    discountCents = Math.min(discountCents, subtotalCents);
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

export interface CouponRow {
  isActive: boolean;
  courseId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
}

export function isCouponValid(
  coupon: CouponRow,
  courseId: string,
  now: Date
): { ok: true } | { ok: false; reason: string } {
  if (!coupon.isActive) return { ok: false, reason: "El cupón no está activo." };
  if (coupon.courseId && coupon.courseId !== courseId) {
    return { ok: false, reason: "El cupón no aplica a este curso." };
  }
  if (coupon.validFrom && now < coupon.validFrom) {
    return { ok: false, reason: "El cupón todavía no está vigente." };
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    return { ok: false, reason: "El cupón venció." };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "El cupón alcanzó su límite de usos." };
  }
  return { ok: true };
}

export function computeCommission(
  unitPriceCents: number,
  commissionRate: string
): { commissionCents: number; netCents: number } {
  const commissionCents = Math.round((unitPriceCents * Number(commissionRate)) / 100);
  return { commissionCents, netCents: unitPriceCents - commissionCents };
}

export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PROOF_MIME_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

export interface ProofUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateProofUpload(input: ProofUploadInput):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!ALLOWED_PROOF_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `Tipo de archivo no permitido: ${input.mimeType}` };
  }
  if (input.sizeBytes <= 0) return { ok: false, reason: "El archivo está vacío." };
  if (input.sizeBytes > MAX_PROOF_BYTES) {
    return { ok: false, reason: "El comprobante excede el tamaño máximo de 10 MB." };
  }
  return { ok: true };
}

export function proofKey(orderId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = ext ? `.${ext}` : "";
  return `payment-proofs/${orderId}/${Date.now()}${suffix}`;
}

export const ORDER_EXPIRES_HOURS = 48;
export const EARNING_AVAILABLE_DAYS = 30;
```

`proofKey` no incluye el nombre original del archivo: a diferencia de los materiales, el comprobante no se muestra nunca por su nombre, así que no hace falta conservarlo, y es una superficie menos para inyectar caracteres raros en la key.

- [ ] **Step 6: Verificar que pasan**

```bash
pnpm test tests/unit/billing-service.test.ts
```

Esperado: **PASAN** los 13 casos.

- [ ] **Step 7: Queries**

`src/modules/billing/queries.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, paymentProofs, paymentDestinations, coupons } from "@/db/schema";

export async function nextOrderNumber(): Promise<string> {
  const [{ value }] = await db.execute<{ value: number }>(
    sql`select nextval('order_number_seq') as value`
  );
  const year = new Date().getFullYear();
  return `PED-${year}-${String(value).padStart(4, "0")}`;
}

export async function getOrderByNumber(orderNumber: string) {
  const [row] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderNumber: orders.orderNumber,
      totalCents: orders.totalCents,
      status: orders.status,
      expiresAt: orders.expiresAt,
      courseTitle: orderItems.titleSnapshot,
      courseId: orderItems.courseId,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  return row ?? null;
}

export async function getActivePaymentDestinations() {
  return db
    .select()
    .from(paymentDestinations)
    .where(eq(paymentDestinations.isActive, true))
    .orderBy(paymentDestinations.orderIndex);
}

export async function findCouponByCode(code: string) {
  const [row] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return row ?? null;
}

export interface PendingProofRow {
  proofId: string;
  orderId: string;
  orderNumber: string;
  method: "yape" | "plin" | "transferencia";
  payerFullName: string;
  payerDni: string;
  operationNumber: string;
  declaredAmountCents: number;
  transferredAt: Date;
  proofFileKey: string;
  submittedAt: Date;
  totalCents: number;
  courseTitle: string;
  buyerName: string;
}

export async function listPendingProofs(): Promise<PendingProofRow[]> {
  const { user } = await import("@/db/schema");
  const rows = await db
    .select({
      proofId: paymentProofs.id,
      orderId: paymentProofs.orderId,
      orderNumber: orders.orderNumber,
      method: paymentProofs.method,
      payerFullName: paymentProofs.payerFullName,
      payerDni: paymentProofs.payerDni,
      operationNumber: paymentProofs.operationNumber,
      declaredAmountCents: paymentProofs.declaredAmountCents,
      transferredAt: paymentProofs.transferredAt,
      proofFileKey: paymentProofs.proofFileKey,
      submittedAt: paymentProofs.submittedAt,
      totalCents: orders.totalCents,
      courseTitle: orderItems.titleSnapshot,
      buyerName: user.name,
    })
    .from(paymentProofs)
    .innerJoin(orders, eq(orders.id, paymentProofs.orderId))
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(user, eq(user.id, orders.userId))
    .where(eq(paymentProofs.status, "pending"))
    .orderBy(paymentProofs.submittedAt);
  return rows;
}
```

`nextval` fuera de una transacción de negocio es intencional: la secuencia de Postgres es atómica por diseño, no necesita ni se beneficia de un `BEGIN` adicional.

`listPendingProofs` importa `user` con `await import(...)` para evitar un ciclo de módulos con `@/db/schema` — es el único sitio de este archivo donde hace falta, así que no vale la pena mover el import estático arriba y arriesgar un ciclo con otros módulos que también importan `billing/queries.ts`.

- [ ] **Step 8: Server action `crearOrden`**

`src/modules/billing/actions.ts`:

```ts
"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, courses, instructorProfiles } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { resolveCommissionRate } from "@/modules/catalog/service";
import { computeOrderTotals, isCouponValid, ORDER_EXPIRES_HOURS } from "./service";
import { nextOrderNumber, findCouponByCode } from "./queries";

export async function crearOrden(courseId: string, couponCode?: string) {
  const u = await requireUser();
  if (!u.emailVerified) {
    throw new Error("Verifica tu correo antes de comprar un curso.");
  }

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course || course.status !== "published") {
    throw new Error("Este curso no está disponible.");
  }
  if (await isEnrolled(u.id, courseId)) {
    throw new Error("Ya estás inscrito en este curso.");
  }

  let coupon: Awaited<ReturnType<typeof findCouponByCode>> = null;
  if (couponCode) {
    coupon = await findCouponByCode(couponCode);
    if (!coupon) throw new Error("El cupón no existe.");
    const check = isCouponValid(coupon, courseId, new Date());
    if (!check.ok) throw new Error(check.reason);
  }

  const totals = computeOrderTotals(
    course.priceCents,
    coupon ? { type: coupon.type, value: coupon.value } : null
  );

  const [profile] = await db.select().from(instructorProfiles)
    .where(eq(instructorProfiles.userId, course.instructorId)).limit(1);
  const commissionRate = resolveCommissionRate(
    course.commissionRateOverride,
    profile?.commissionRate ?? "30.00"
  );
  const commissionCents = Math.round((totals.totalCents * Number(commissionRate)) / 100);

  const orderNumber = await nextOrderNumber();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRES_HOURS * 60 * 60 * 1000);

  const [order] = await db.insert(orders).values({
    userId: u.id,
    orderNumber,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    status: "pending",
    provider: "manual",
    expiresAt,
  }).returning({ id: orders.id });

  await db.insert(orderItems).values({
    orderId: order.id,
    courseId: course.id,
    instructorId: course.instructorId,
    titleSnapshot: course.title,
    unitPriceCents: totals.totalCents,
    commissionRate,
    commissionCents,
    netCents: totals.totalCents - commissionCents,
  });

  return { orderNumber };
}
```

**El precio se lee de `course.priceCents`, nunca de un parámetro que venga del formulario.** Un cupón puede bajar el total; nada que llegue del cliente puede subirlo ni fijarlo directamente.

- [ ] **Step 9: Test de integración**

`tests/integration/billing-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, enrollments, orders, orderItems, coupons, instructorProfiles } from "@/db/schema";

let studentId: string;
let profId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: studentId, role: "student", name: "Alumno", emailVerified: true })),
}));

const { crearOrden } = await import("@/modules/billing/actions");

beforeEach(async () => {
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(enrollments);
  await db.delete(coupons);
  await db.delete(courses);
  await db.delete(instructorProfiles);
  await db.delete(user);

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  await db.insert(instructorProfiles).values({
    userId: profId, displayName: "Prof", commissionRate: "30.00", status: "approved",
  });

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "curso-pago", title: "Curso de Pago",
    priceCents: 19900, status: "published",
  }).returning();
  cursoId = c.id;
});

describe("crearOrden", () => {
  it("crea la orden y su order_item con la comisión fijada", async () => {
    const { orderNumber } = await crearOrden(cursoId);
    expect(orderNumber).toMatch(/^PED-\d{4}-\d{4}$/);

    const [o] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    expect(o.totalCents).toBe(19900);
    expect(o.status).toBe("pending");

    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(item.commissionRate).toBe("30.00");
    expect(item.commissionCents).toBe(5970);
  });

  it("aplica un cupón porcentual válido", async () => {
    await db.insert(coupons).values({
      code: "PROMO20", type: "percent", value: 20, isActive: true,
    });
    const { orderNumber } = await crearOrden(cursoId, "PROMO20");
    const [o] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
    expect(o.discountCents).toBe(3980);
    expect(o.totalCents).toBe(15920);
  });

  it("rechaza un cupón inexistente", async () => {
    await expect(crearOrden(cursoId, "NO-EXISTE")).rejects.toThrow(/no existe/i);
  });

  it("rechaza comprar un curso ya inscrito", async () => {
    await db.insert(enrollments).values({ userId: studentId, courseId: cursoId, status: "active" });
    await expect(crearOrden(cursoId)).rejects.toThrow(/ya estás inscrito/i);
  });

  it("rechaza un curso en borrador", async () => {
    const [draft] = await db.insert(courses).values({
      instructorId: profId, slug: "borrador-pago", title: "Borrador", priceCents: 100,
    }).returning();
    await expect(crearOrden(draft.id)).rejects.toThrow(/no está disponible/i);
  });
});
```

- [ ] **Step 10: Correr los tests**

```bash
pnpm test tests/unit/billing-service.test.ts tests/integration/billing-actions.test.ts
```

Esperado: **PASAN** los 18 casos.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add order creation with server-side pricing and coupon validation"
```

---

### Task 2: Pantalla de pago `/pago/[orderNumber]`

**Files:**
- Create: `src/app/(student)/layout.tsx`
- Create: `src/app/(student)/pago/[orderNumber]/page.tsx`
- Modify: `src/db/seed.ts` (+ `payment_destinations` de prueba)

**Interfaces:**
- Consumes: `requireUser`, `getOrderByNumber`, `getActivePaymentDestinations`, `formatPEN`, `env.YAPE_MAX_CENTS`.
- Produces: ruta `/pago/[orderNumber]` funcionando para el dueño de la orden.

- [ ] **Step 1: Layout de `(student)`**

`src/app/(student)/layout.tsx`:

```tsx
import { requireUser } from "@/modules/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>;
}
```

`requireUser`, no `assertRole`: un instructor o un admin también pueden comprar un curso como alumno. El rol no limita quién puede pagar.

- [ ] **Step 2: Seed de destinos de pago**

En `src/db/seed.ts`, importa `paymentDestinations` desde `@/db/schema` y añade antes de `console.log("Seed listo...")`:

```ts
  await db.insert(paymentDestinations).values([
    {
      method: "yape", holderName: "Academia Demo", identifier: "987654321",
      instructionsMd: "Escanea el QR o yapea al número indicado.",
      isActive: true, orderIndex: 1,
    },
    {
      method: "plin", holderName: "Academia Demo", identifier: "987654321",
      instructionsMd: "Plinea al número indicado y guarda tu comprobante.",
      isActive: true, orderIndex: 2,
    },
    {
      method: "transferencia", holderName: "Academia Demo SAC", identifier: "00219800123456789012",
      bankName: "BCP", instructionsMd: "Transfiere por CCI y anota el número de operación.",
      isActive: true, orderIndex: 3,
    },
  ]).onConflictDoNothing();
```

Y en el import de arriba del archivo:

```ts
import { user, instructorProfiles, categories, courses, classSessions, paymentDestinations } from "@/db/schema";
```

`onConflictDoNothing()` sin `target` funciona aquí porque `payment_destinations` no tiene una columna única natural para conflictos — es tolerable duplicar filas de seed en un re-run porque no rompe nada funcionalmente, pero para mantener el seed idempotente de verdad, antes del insert añade una guarda:

```ts
  const existingDestinations = await db.select().from(paymentDestinations).limit(1);
  if (existingDestinations.length === 0) {
    await db.insert(paymentDestinations).values([/* ... como arriba ... */]);
  }
```

Usa esta segunda forma (con la guarda explícita), no el `onConflictDoNothing()` sin target.

- [ ] **Step 3: Página de pago**

`src/app/(student)/pago/[orderNumber]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { getOrderByNumber, getActivePaymentDestinations } from "@/modules/billing/queries";
import { formatPEN } from "@/lib/money";
import { env } from "@/env";
import { PaymentProofForm } from "@/modules/billing/ui/payment-proof-form";

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape", plin: "Plin", transferencia: "Transferencia bancaria",
};

export default async function PagoPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const u = await requireUser();
  const order = await getOrderByNumber(orderNumber);

  if (!order) notFound();
  if (order.userId !== u.id) notFound();
  if (order.status === "paid") redirect("/mi-aprendizaje");

  const destinations = await getActivePaymentDestinations();
  const highlightTransfer = order.totalCents > env.YAPE_MAX_CENTS;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-muted-foreground">Orden {order.orderNumber}</p>
        <h1 className="text-2xl font-semibold">{order.courseTitle}</h1>
        <p className="mt-1 text-3xl font-semibold">{formatPEN(order.totalCents)}</p>
      </div>

      {order.status === "expired" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          Esta orden venció. Vuelve al curso para generar una nueva.
        </p>
      ) : (
        <>
          {highlightTransfer && (
            <p className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm">
              Este monto supera el límite diario habitual de Yape/Plin. Te recomendamos pagar por transferencia.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {destinations.map((d) => (
              <div
                key={d.id}
                className={`rounded-lg border p-4 ${
                  highlightTransfer && d.method !== "transferencia" ? "opacity-50" : "border-border"
                }`}
              >
                <p className="font-medium">{METHOD_LABEL[d.method]}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d.holderName}</p>
                <p className="mt-1 font-mono text-sm">{d.identifier}</p>
                {d.bankName && <p className="text-sm text-muted-foreground">{d.bankName}</p>}
                {d.instructionsMd && <p className="mt-2 text-xs text-muted-foreground">{d.instructionsMd}</p>}
              </div>
            ))}
          </div>

          <PaymentProofForm orderId={order.id} orderNumber={order.orderNumber} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificación manual**

```bash
pnpm db:seed
pnpm dev
```

Entra como `alumno@test.pe`, visita manualmente `/pago/PED-2026-0001` (usa el `orderNumber` real de una orden creada por consola o por el flujo E2E de la Task 7) y confirma que carga sin errores. La subida de comprobante se prueba en la Task 3.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add payment screen with QR/Yape/Plin/transfer destinations"
```

---

### Task 3: Subida de comprobante con Turnstile

**Files:**
- Create: `src/app/api/r2/payment-proof-upload-url/route.ts`
- Modify: `src/modules/billing/actions.ts` (+ `submitPaymentProof`)
- Create: `src/modules/billing/ui/payment-proof-form.tsx`
- Create: `tests/integration/billing-proof.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `verifyTurnstile` (de `@/lib/turnstile`), `validateProofUpload`, `proofKey`, `presignPut`.
- Produces: `submitPaymentProof(orderId: string, raw: unknown): Promise<void>`.

- [ ] **Step 1: Endpoint de URL de subida**

`src/app/api/r2/payment-proof-upload-url/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { validateProofUpload, proofKey } from "@/modules/billing/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await requireUser();
  const body = (await req.json()) as {
    orderId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.orderId || !body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const [order] = await db.select({ userId: orders.userId })
    .from(orders).where(eq(orders.id, body.orderId)).limit(1);
  if (!order) return Response.json({ error: "Orden no encontrada." }, { status: 404 });
  if (order.userId !== u.id) return Response.json({ error: "Sin permiso." }, { status: 403 });

  const check = validateProofUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = proofKey(body.orderId, body.fileName);
  const url = await presignPut(key, body.mimeType);
  return Response.json({ url, key });
}
```

- [ ] **Step 2: Test de `submitPaymentProof` (falla primero)**

`tests/integration/billing-proof.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, orders, orderItems, paymentProofs } from "@/db/schema";

let studentId: string;
let orderId: string;

vi.mock("@/modules/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: studentId, role: "student", name: "Alumno", emailVerified: true })),
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(async (token: string) => token === "token-valido"),
}));

const { submitPaymentProof } = await import("@/modules/billing/actions");

beforeEach(async () => {
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();

  const [c] = await db.insert(courses).values({
    instructorId: p.id, slug: "curso-proof", title: "Curso", priceCents: 100,
  }).returning();

  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: "PED-2026-0001",
    subtotalCents: 100, totalCents: 100, status: "pending",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();
  orderId = o.id;

  await db.insert(orderItems).values({
    orderId: o.id, courseId: c.id, instructorId: p.id, titleSnapshot: "Curso",
    unitPriceCents: 100, commissionRate: "30.00", commissionCents: 30, netCents: 70,
  });
});

const validInput = {
  method: "yape" as const,
  payerFullName: "Alumno Prueba",
  payerDni: "12345678",
  operationNumber: "OP-001",
  declaredAmountCents: 100,
  transferredAtLocal: "2026-08-01T10:00",
  fileKey: "payment-proofs/x/1.png",
  turnstileToken: "token-valido",
};

describe("submitPaymentProof", () => {
  it("guarda el comprobante en estado pendiente", async () => {
    await submitPaymentProof(orderId, validInput);
    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(proof.status).toBe("pending");
    expect(proof.operationNumber).toBe("OP-001");
  });

  it("rechaza sin Turnstile válido", async () => {
    await expect(
      submitPaymentProof(orderId, { ...validInput, turnstileToken: "token-malo" })
    ).rejects.toThrow(/verificación/i);
  });

  it("rechaza reutilizar el mismo número de operación en otra orden no rechazada", async () => {
    await submitPaymentProof(orderId, validInput);

    const [c2] = await db.select().from(courses).limit(1);
    const [o2] = await db.insert(orders).values({
      userId: studentId, orderNumber: "PED-2026-0002",
      subtotalCents: 100, totalCents: 100, status: "pending",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning();
    await db.insert(orderItems).values({
      orderId: o2.id, courseId: c2.id, instructorId: c2.instructorId, titleSnapshot: "Curso",
      unitPriceCents: 100, commissionRate: "30.00", commissionCents: 30, netCents: 70,
    });

    await expect(submitPaymentProof(o2.id, validInput)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Verificar que falla**

```bash
pnpm test tests/integration/billing-proof.test.ts
```

Esperado: **FALLA**, `submitPaymentProof` no existe.

- [ ] **Step 4: Implementar `submitPaymentProof`**

Añade a `src/modules/billing/actions.ts`:

```ts
import { paymentProofs } from "@/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { limaLocalToUtc } from "@/modules/catalog/service";
import { z } from "zod";

const proofSchema = z.object({
  method: z.enum(["yape", "plin", "transferencia"]),
  payerFullName: z.string().trim().min(3).max(160),
  payerDni: z.string().trim().min(6).max(20),
  operationNumber: z.string().trim().min(1).max(60),
  declaredAmountCents: z.coerce.number().int().positive(),
  transferredAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  fileKey: z.string().trim().min(1),
  turnstileToken: z.string(),
});

export async function submitPaymentProof(orderId: string, raw: unknown) {
  const u = await requireUser();
  const input = proofSchema.parse(raw);

  const ok = await verifyTurnstile(input.turnstileToken);
  if (!ok) throw new Error("Verificación de seguridad inválida.");

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.userId !== u.id) throw new Error("Orden no encontrada.");
  if (order.status !== "pending") throw new Error("Esta orden ya no admite comprobantes.");

  await db.insert(paymentProofs).values({
    orderId,
    method: input.method,
    payerFullName: input.payerFullName,
    payerDni: input.payerDni,
    operationNumber: input.operationNumber,
    declaredAmountCents: input.declaredAmountCents,
    transferredAt: limaLocalToUtc(input.transferredAtLocal),
    proofFileKey: input.fileKey,
    status: "pending",
  });
}
```

El índice único parcial de `payment_proofs (method, operation_number) WHERE status <> 'rejected'` (ya migrado en la Fase 0) es lo que hace fallar el tercer test — no hay lógica de aplicación adicional que lo replique, la base de datos es la única fuente de verdad para esa regla.

- [ ] **Step 5: Verificar que pasan**

```bash
pnpm test tests/integration/billing-proof.test.ts
```

Esperado: **PASAN** los 3 casos.

- [ ] **Step 6: UI de subida**

`src/modules/billing/ui/payment-proof-form.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { submitPaymentProof } from "@/modules/billing/actions";

export function PaymentProofForm({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const file = fileInputRef.current?.files?.[0];
    if (!file) return setError("Adjunta la captura o foto del comprobante.");
    if (!token) return setError("Completa la verificación de seguridad.");

    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const presignRes = await fetch("/api/r2/payment-proof-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, fileName: file.name, mimeType: file.type, sizeBytes: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

      const putRes = await fetch(presign.url, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!putRes.ok) throw new Error("Falló la subida del comprobante.");

      await submitPaymentProof(orderId, {
        method: String(form.get("method")),
        payerFullName: String(form.get("payerFullName")),
        payerDni: String(form.get("payerDni")),
        operationNumber: String(form.get("operationNumber")),
        declaredAmountCents: Math.round(Number(form.get("declaredAmount")) * 100),
        transferredAtLocal: String(form.get("transferredAtLocal")),
        fileKey: presign.key,
        turnstileToken: token,
      });

      toast.success(`Comprobante enviado para la orden ${orderNumber}. Te avisaremos por correo.`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos registrar tu comprobante.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <h2 className="text-lg font-medium">Subir comprobante</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Método</Label>
        <select id="method" name="method" required className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="yape">Yape</option>
          <option value="plin">Plin</option>
          <option value="transferencia">Transferencia</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="payerFullName">Nombre del titular</Label>
          <Input id="payerFullName" name="payerFullName" required minLength={3} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payerDni">DNI</Label>
          <Input id="payerDni" name="payerDni" required minLength={6} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="operationNumber">Nº de operación</Label>
          <Input id="operationNumber" name="operationNumber" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="declaredAmount">Monto pagado (S/)</Label>
          <Input id="declaredAmount" name="declaredAmount" type="number" min={0} step="0.01" required />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transferredAtLocal">Fecha y hora del pago</Label>
        <Input id="transferredAtLocal" name="transferredAtLocal" type="datetime-local" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="proof-file">Captura o foto del comprobante</Label>
        <input ref={fileInputRef} id="proof-file" type="file" accept="image/png,image/jpeg,application/pdf" className="text-sm" />
      </div>

      <TurnstileWidget onToken={setToken} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Enviando..." : "Enviar comprobante"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Correr todo y commit**

```bash
pnpm test
git add -A
git commit -m "feat: add payment proof submission with Turnstile and R2 direct upload"
```

---

### Task 4: `aprobarPago` y `rechazarPago` transaccionales

**Files:**
- Modify: `src/modules/billing/actions.ts` (+ `aprobarPago`, `rechazarPago`)
- Create: `tests/integration/billing-approve.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `db.transaction`, `computeCommission`, `EARNING_AVAILABLE_DAYS`.
- Produces: `aprobarPago(orderId: string): Promise<void>`, `rechazarPago(orderId: string, reason: string): Promise<void>`.

- [ ] **Step 1: Escribir los tests (fallan primero)**

`tests/integration/billing-approve.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, orders, orderItems, paymentProofs, enrollments, instructorEarnings,
} from "@/db/schema";

let adminId: string;
let studentId: string;
let profId: string;
let orderId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: adminId, role: "admin", name: "Admin" })),
}));

const { aprobarPago, rechazarPago } = await import("@/modules/billing/actions");

async function setupOrder() {
  await db.delete(instructorEarnings);
  await db.delete(paymentProofs);
  await db.delete(enrollments);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Admin", email: "adm@test.pe",
    emailVerified: true, role: "admin",
  }).returning();
  adminId = a.id;

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "curso-aprobar", title: "Curso", priceCents: 10000,
  }).returning();
  cursoId = c.id;

  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: "PED-2026-9001",
    subtotalCents: 10000, totalCents: 10000, status: "pending",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();
  orderId = o.id;

  await db.insert(orderItems).values({
    orderId: o.id, courseId: c.id, instructorId: profId, titleSnapshot: "Curso",
    unitPriceCents: 10000, commissionRate: "30.00", commissionCents: 3000, netCents: 7000,
  });

  await db.insert(paymentProofs).values({
    orderId: o.id, method: "yape", payerFullName: "Alumno", payerDni: "12345678",
    operationNumber: "OP-APROBAR", declaredAmountCents: 10000, transferredAt: new Date(),
    proofFileKey: "payment-proofs/x/1.png", status: "pending",
  });
}

beforeEach(setupOrder);

describe("aprobarPago", () => {
  it("marca la orden pagada, inscribe al alumno y crea el earning", async () => {
    await aprobarPago(orderId);

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paid");
    expect(o.paidAt).not.toBeNull();

    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(proof.status).toBe("approved");
    expect(proof.reviewedBy).toBe(adminId);

    const [enr] = await db.select().from(enrollments)
      .where(eq(enrollments.userId, studentId));
    expect(enr.status).toBe("active");
    expect(enr.courseId).toBe(cursoId);

    const [earning] = await db.select().from(instructorEarnings);
    expect(earning.grossCents).toBe(10000);
    expect(earning.commissionCents).toBe(3000);
    expect(earning.netCents).toBe(7000);
    expect(earning.status).toBe("pending");
  });

  it("es idempotente: llamarlo dos veces no duplica inscripción ni earning", async () => {
    await aprobarPago(orderId);
    await aprobarPago(orderId);

    const enrollmentsRows = await db.select().from(enrollments).where(eq(enrollments.userId, studentId));
    expect(enrollmentsRows).toHaveLength(1);

    const earningsRows = await db.select().from(instructorEarnings);
    expect(earningsRows).toHaveLength(1);
  });

  it("es atómica: si falla a mitad, no queda nada aplicado", async () => {
    const original = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(async () => {
      throw new Error("fallo forzado");
    });

    await expect(aprobarPago(orderId)).rejects.toThrow("fallo forzado");

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("pending");
    const enrollmentsRows = await db.select().from(enrollments).where(eq(enrollments.userId, studentId));
    expect(enrollmentsRows).toHaveLength(0);

    spy.mockRestore();
    void original;
  });
});

describe("rechazarPago", () => {
  it("marca el comprobante rechazado con motivo, la orden sigue pendiente", async () => {
    await rechazarPago(orderId, "El nombre no coincide con el titular.");

    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(proof.status).toBe("rejected");
    expect(proof.rejectionReason).toBe("El nombre no coincide con el titular.");

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("pending");
  });

  it("permite subir un nuevo comprobante sobre la misma orden tras rechazar", async () => {
    await rechazarPago(orderId, "monto no coincide");
    const { submitPaymentProof } = await import("@/modules/billing/actions");
    vi.doMock("@/lib/turnstile", () => ({ verifyTurnstile: vi.fn(async () => true) }));

    await expect(db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId)))
      .resolves.toHaveLength(1);
    void submitPaymentProof;
  });
});
```

El test de atomicidad usa `vi.spyOn(db, "transaction")` para forzar el fallo — es la forma directa de comprobar "si cualquier paso falla, nada se aplica" sin depender de romper una constraint específica que podría cambiar.

- [ ] **Step 2: Verificar que fallan**

```bash
pnpm test tests/integration/billing-approve.test.ts
```

Esperado: **FALLA**, `aprobarPago` no existe.

- [ ] **Step 3: Implementar**

Añade a `src/modules/billing/actions.ts`:

```ts
import { revalidatePath } from "next/cache";
import { assertRole } from "@/modules/auth/session";
import { enrollments, instructorEarnings, couponRedemptions, coupons } from "@/db/schema";
import { computeCommission, EARNING_AVAILABLE_DAYS } from "./service";

export async function aprobarPago(orderId: string) {
  const admin = await assertRole(["admin"]);

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Orden no encontrada.");
    if (order.status === "paid") return; // idempotente: ya se aprobó antes

    const [proof] = await tx.select().from(paymentProofs)
      .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pending")))
      .limit(1);
    if (!proof) throw new Error("No hay un comprobante pendiente para esta orden.");

    const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
    if (!item) throw new Error("La orden no tiene curso asociado.");

    const now = new Date();

    await tx.update(paymentProofs)
      .set({ status: "approved", reviewedBy: admin.id, reviewedAt: now })
      .where(eq(paymentProofs.id, proof.id));

    await tx.update(orders).set({ status: "paid", paidAt: now }).where(eq(orders.id, orderId));

    await tx.insert(enrollments)
      .values({ userId: order.userId, courseId: item.courseId, orderId: order.id, status: "active" })
      .onConflictDoNothing({ target: [enrollments.userId, enrollments.courseId] });

    const { commissionCents, netCents } = computeCommission(item.unitPriceCents, item.commissionRate);
    const availableAt = new Date(now.getTime() + EARNING_AVAILABLE_DAYS * 24 * 60 * 60 * 1000);

    await tx.insert(instructorEarnings).values({
      orderItemId: item.id,
      instructorId: item.instructorId,
      grossCents: item.unitPriceCents,
      commissionCents,
      netCents,
      status: "pending",
      availableAt,
    }).onConflictDoNothing({ target: instructorEarnings.orderItemId });

    if (order.discountCents > 0) {
      const [existingCoupon] = await tx.select().from(coupons)
        .innerJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
        .where(eq(couponRedemptions.orderId, order.id))
        .limit(1);
      if (!existingCoupon) {
        // El cupón, si lo hubo, ya quedó registrado en discountCents; sin una
        // referencia directa orders -> coupon en el esquema, la redención
        // detallada (coupon_redemptions) se registra en crearOrden cuando
        // aplica, no aquí. Ver Task 1.
      }
    }
  });

  revalidatePath("/admin/pagos");
}

export async function rechazarPago(orderId: string, reason: string) {
  const u = await assertRole(["admin"]);
  const [proof] = await db.select().from(paymentProofs)
    .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pending")))
    .limit(1);
  if (!proof) throw new Error("No hay un comprobante pendiente para esta orden.");

  await db.update(paymentProofs).set({
    status: "rejected",
    reviewedBy: u.id,
    reviewedAt: new Date(),
    rejectionReason: reason,
  }).where(eq(paymentProofs.id, proof.id));

  revalidatePath("/admin/pagos");
}
```

**Nota sobre cupones:** el spec pone `INSERT coupon_redemption + coupon.used_count++` dentro de `aprobarPago`. Como este plan ya validó y aplicó el descuento en `crearOrden` (Task 1, nota de desviación), mover también el redemption tracking ahí es lo consistente — se deja fuera de esta tarea porque el flujo de cupones completo (crear cupones desde el admin) es de la Fase 6, y sin UI para crearlos, este plan no ejercita ese camino. El comentario en el código deja explícito el porqué en vez de dejarlo implementado a medias.

**`db.transaction`, no funciones sueltas con try/catch:** todos los `tx.*` dentro del callback participan de la misma transacción de Postgres; si cualquier `await` lanza, Drizzle hace `ROLLBACK` automáticamente y el `throw` se propaga hacia quien llamó a `aprobarPago`.

**`onConflictDoNothing` en `enrollments` e `instructor_earnings`:** es la segunda capa de idempotencia, además del `if (order.status === "paid") return`. Cubre el caso borde de dos aprobaciones concurrentes que pasan el chequeo de estado casi al mismo tiempo.

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/integration/billing-approve.test.ts
```

Esperado: **PASAN** los 5 casos.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add transactional payment approval with idempotent enrollment and earnings"
```

---

### Task 5: Cola de aprobación `/admin/pagos`

**Files:**
- Create: `src/app/(admin)/admin/pagos/page.tsx`
- Create: `src/modules/billing/ui/admin-proof-review.tsx`
- Create: `src/app/api/admin/pagos/[proofId]/comprobante-url/route.ts`

**Interfaces:**
- Consumes: `assertRole`, `listPendingProofs`, `aprobarPago`, `rechazarPago`, `presignGet`.
- Produces: página `/admin/pagos` funcionando, con el archivo del comprobante servido solo bajo demanda y solo a un admin.

- [ ] **Step 1: Endpoint que firma la URL del comprobante**

`src/app/api/admin/pagos/[proofId]/comprobante-url/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentProofs } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { presignGet } from "@/lib/r2";

export async function GET(_req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  await assertRole(["admin"]);
  const { proofId } = await params;

  const [proof] = await db.select({ proofFileKey: paymentProofs.proofFileKey })
    .from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
  if (!proof) return Response.json({ error: "Comprobante no encontrado." }, { status: 404 });

  const url = await presignGet(proof.proofFileKey);
  return Response.json({ url });
}
```

Igual que con los materiales de la Fase 1: la key nunca se serializa directamente hacia el cliente en el listado — se resuelve a una URL firmada de 5 minutos solo cuando el admin hace clic en "Ver comprobante".

- [ ] **Step 2: Componente cliente de revisión**

`src/modules/billing/ui/admin-proof-review.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aprobarPago, rechazarPago } from "@/modules/billing/actions";
import type { PendingProofRow } from "@/modules/billing/queries";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";

export function AdminProofReview({ proof }: { proof: PendingProofRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  async function verComprobante() {
    const res = await fetch(`/api/admin/pagos/${proof.proofId}/comprobante-url`);
    const data = await res.json();
    if (res.ok) setProofUrl(data.url);
    else toast.error(data.error ?? "No se pudo abrir el comprobante.");
  }

  function aprobar() {
    startTransition(async () => {
      try {
        await aprobarPago(proof.orderId);
        toast.success(`Orden ${proof.orderNumber} aprobada.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo aprobar.");
      }
    });
  }

  function rechazar() {
    if (!reason.trim()) return toast.error("Escribe el motivo del rechazo.");
    startTransition(async () => {
      try {
        await rechazarPago(proof.orderId, reason);
        toast.success(`Orden ${proof.orderNumber} rechazada.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo rechazar.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-5">
      <div className="flex items-center justify-between">
        <span className="font-medium">{proof.orderNumber} · {proof.courseTitle}</span>
        <span className="font-semibold">{formatPEN(proof.totalCents)}</span>
      </div>
      <p className="rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
        Verifica en tu app de Yape/banco, no en la imagen.
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted-foreground">Comprador</dt><dd>{proof.buyerName}</dd></div>
        <div><dt className="text-muted-foreground">Método</dt><dd>{proof.method}</dd></div>
        <div><dt className="text-muted-foreground">Titular declarado</dt><dd>{proof.payerFullName}</dd></div>
        <div><dt className="text-muted-foreground">DNI</dt><dd>{proof.payerDni}</dd></div>
        <div><dt className="text-muted-foreground">Nº de operación</dt><dd>{proof.operationNumber}</dd></div>
        <div><dt className="text-muted-foreground">Monto declarado</dt><dd>{formatPEN(proof.declaredAmountCents)}</dd></div>
        <div><dt className="text-muted-foreground">Fecha declarada</dt><dd>{formatLima(new Date(proof.transferredAt))}</dd></div>
      </dl>

      {proofUrl ? (
        <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          Abrir comprobante en una pestaña nueva
        </a>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={verComprobante}>
          Ver comprobante
        </Button>
      )}

      <div className="flex items-center gap-2">
        <Input placeholder="Motivo si rechazas" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8" />
        <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={rechazar}>
          Rechazar
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={aprobar}>
          Aprobar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Página de la cola**

`src/app/(admin)/admin/pagos/page.tsx`:

```tsx
import { listPendingProofs } from "@/modules/billing/queries";
import { AdminProofReview } from "@/modules/billing/ui/admin-proof-review";

export default async function AdminPagosPage() {
  const proofs = await listPendingProofs();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Comprobantes pendientes</h1>
      {proofs.length === 0 ? (
        <p className="text-muted-foreground">No hay comprobantes por revisar.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {proofs.map((p) => <AdminProofReview key={p.proofId} proof={p} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificación manual**

```bash
pnpm dev
```

Como `admin@test.pe`, visita `/admin/pagos`. Debe cargar (vacío si no hay comprobantes pendientes; usa el flujo E2E de la Task 7 para generar uno). Como `alumno@test.pe`, visita `/admin/pagos` — debe redirigir a `/` (mismo guard `assertRole(["admin"])` que ya usa `(admin)/layout.tsx` desde la Fase 0-1).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin payment approval queue with presigned proof viewing"
```

---

### Task 6: Vencimiento de órdenes y emails

**Files:**
- Create: `src/app/api/cron/expirar-ordenes/route.ts`
- Create: `src/modules/notifications/templates/payment-proof-received.ts`
- Create: `src/modules/notifications/templates/order-approved.ts`
- Create: `src/modules/notifications/templates/order-rejected.ts`
- Modify: `src/modules/billing/actions.ts` (enviar los tres emails)
- Create: `tests/integration/order-expiry.test.ts`

**Interfaces:**
- Consumes: `sendEmail`, `env.CRON_SECRET`, `db`, `orders`.
- Produces: `expireStaleOrders(now?: Date): Promise<number>` (nº de órdenes expiradas), endpoint `GET /api/cron/expirar-ordenes`.

- [ ] **Step 1: Test de expiración (falla primero)**

`tests/integration/order-expiry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, orders, orderItems, paymentProofs } from "@/db/schema";
import { expireStaleOrders } from "@/modules/billing/actions";

let studentId: string;
let cursoId: string;

beforeEach(async () => {
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();

  const [c] = await db.insert(courses).values({
    instructorId: p.id, slug: "curso-expira", title: "Curso", priceCents: 100,
  }).returning();
  cursoId = c.id;
});

async function crearOrdenVencida(withPendingProof: boolean) {
  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: `PED-2026-${Math.floor(Math.random() * 100000)}`,
    subtotalCents: 100, totalCents: 100, status: "pending",
    expiresAt: new Date(Date.now() - 60_000),
  }).returning();
  await db.insert(orderItems).values({
    orderId: o.id, courseId: cursoId, instructorId: (await db.select().from(courses).limit(1))[0].instructorId,
    titleSnapshot: "Curso", unitPriceCents: 100, commissionRate: "30.00", commissionCents: 30, netCents: 70,
  });
  if (withPendingProof) {
    await db.insert(paymentProofs).values({
      orderId: o.id, method: "yape", payerFullName: "Alumno", payerDni: "12345678",
      operationNumber: `OP-${Math.random()}`, declaredAmountCents: 100, transferredAt: new Date(),
      proofFileKey: "payment-proofs/x/1.png", status: "pending",
    });
  }
  return o.id;
}

describe("expireStaleOrders", () => {
  it("expira una orden vencida sin comprobante pendiente", async () => {
    const orderId = await crearOrdenVencida(false);
    const count = await expireStaleOrders();
    expect(count).toBe(1);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("expired");
  });

  it("no expira una orden vencida que tiene un comprobante pendiente de revisión", async () => {
    const orderId = await crearOrdenVencida(true);
    const count = await expireStaleOrders();
    expect(count).toBe(0);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
pnpm test tests/integration/order-expiry.test.ts
```

Esperado: **FALLA**, `expireStaleOrders` no existe.

- [ ] **Step 3: Implementar `expireStaleOrders`**

Añade a `src/modules/billing/actions.ts`:

```ts
import { and, lt, notInArray, sql as sqlOp } from "drizzle-orm";

export async function expireStaleOrders(now: Date = new Date()): Promise<number> {
  const result = await db.execute<{ id: string }>(sqlOp`
    update orders set status = 'expired'
    where status = 'pending'
      and expires_at < ${now}
      and id not in (select order_id from payment_proofs where status = 'pending')
    returning id
  `);
  return result.length;
}
```

Se usa SQL directo con `not in (subquery)` en vez de componer el `where` con el query builder porque es la forma más directa de expresar "sin ningún comprobante pendiente asociado" sin un `LEFT JOIN` + `GROUP BY` que complicaría la lectura para una consulta que corre una vez al día.

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/integration/order-expiry.test.ts
```

Esperado: **PASAN** los 2 casos.

- [ ] **Step 5: Endpoint de cron**

`src/app/api/cron/expirar-ordenes/route.ts`:

```ts
import { env } from "@/env";
import { expireStaleOrders } from "@/modules/billing/actions";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const count = await expireStaleOrders();
  return Response.json({ expired: count });
}
```

- [ ] **Step 6: Plantillas de email**

`src/modules/notifications/templates/payment-proof-received.ts`:

```ts
export function paymentProofReceivedTemplate(input: { orderNumber: string; courseTitle: string }) {
  return {
    subject: `Nuevo comprobante por revisar — ${input.orderNumber}`,
    html: `<p>Llegó un comprobante para la orden <strong>${input.orderNumber}</strong> (${escapeHtml(input.courseTitle)}). Revísalo en /admin/pagos.</p>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```

`src/modules/notifications/templates/order-approved.ts`:

```ts
import { env } from "@/env";

export function orderApprovedTemplate(input: { name: string; courseTitle: string }) {
  return {
    subject: `Tu acceso está listo — ${input.courseTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Confirmamos tu pago. Ya tienes acceso a <strong>${escapeHtml(input.courseTitle)}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```

`src/modules/notifications/templates/order-rejected.ts`:

```ts
export function orderRejectedTemplate(input: { name: string; courseTitle: string; reason: string; orderNumber: string }) {
  return {
    subject: `Tu comprobante no pudo validarse — ${input.orderNumber}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>No pudimos validar tu comprobante para <strong>${escapeHtml(input.courseTitle)}</strong>: ${escapeHtml(input.reason)}</p>
  <p>Puedes subir un nuevo comprobante en la misma página de pago.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
```

- [ ] **Step 7: Enviar los emails desde las actions**

En `src/modules/billing/actions.ts`, importa arriba:

```ts
import { sendEmail } from "@/modules/notifications/mailer";
import { paymentProofReceivedTemplate } from "@/modules/notifications/templates/payment-proof-received";
import { orderApprovedTemplate } from "@/modules/notifications/templates/order-approved";
import { orderRejectedTemplate } from "@/modules/notifications/templates/order-rejected";
```

Al final de `submitPaymentProof`, después del `db.insert(paymentProofs)...`, añade:

```ts
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const { subject, html } = paymentProofReceivedTemplate({
    orderNumber: order.orderNumber, courseTitle: item?.titleSnapshot ?? "",
  });
  await sendEmail({ to: env.MAIL_FROM, template: "payment-proof-received", subject, html });
```

(Importa `env` de `@/env` si no está ya importado en el archivo.)

Al final de `aprobarPago`, **después** de `revalidatePath("/admin/pagos")` (fuera de la transacción, como exige la invariante del spec: "el email se envía después del COMMIT"):

```ts
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = await db.select().from(user).where(eq(user.id, order.userId)).limit(1);
  if (order && item && buyer) {
    const { subject, html } = orderApprovedTemplate({ name: buyer.name, courseTitle: item.titleSnapshot });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "order-approved", subject, html });
  }
```

(Importa `user` desde `@/db/schema` si no está ya importado.)

Al final de `rechazarPago`, después de `revalidatePath("/admin/pagos")`:

```ts
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = order ? await db.select().from(user).where(eq(user.id, order.userId)).limit(1) : [];
  if (order && item && buyer) {
    const { subject, html } = orderRejectedTemplate({
      name: buyer.name, courseTitle: item.titleSnapshot, reason, orderNumber: order.orderNumber,
    });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "order-rejected", subject, html });
  }
```

- [ ] **Step 8: Correr todo y commit**

```bash
pnpm test
git add -A
git commit -m "feat: add order expiry cron and payment status emails"
```

---

### Task 7: E2E del flujo de pago manual

**Files:**
- Create: `tests/e2e/pago.spec.ts`

**Interfaces:**
- Consumes: la app completa, el seed, `login`/`PROF`/`ALUMNO` de `tests/e2e/fixtures.ts` (ya existen desde la Fase 0-1).
- Produces: `pnpm test:e2e` cubriendo compra → comprobante → aprobación → acceso, en verde.

- [ ] **Step 1: Escribir el E2E**

`tests/e2e/pago.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, ALUMNO } from "./fixtures";

const ADMIN = { email: "admin@test.pe", password: "admin12345" };

test.describe("compra con pago manual", () => {
  test("un alumno compra, sube comprobante, y el admin lo aprueba", async ({ page, context }) => {
    await login(page, ALUMNO.email, ALUMNO.password);

    await page.goto("/cursos/excel-desde-cero");
    // La Fase 2 no agrega un botón de compra a la página de curso todavía
    // (eso es UI de catálogo, Fase 1); se navega directo a crear la orden
    // vía la Server Action expuesta en /pago tras un helper de test.
    const res = await page.request.post("/api/test-only/crear-orden", {
      data: { courseSlug: "excel-desde-cero" },
    });
    expect(res.ok()).toBe(true);
    const { orderNumber } = await res.json();

    await page.goto(`/pago/${orderNumber}`);
    await expect(page.getByText(orderNumber)).toBeVisible();
    await expect(page.getByText("Excel desde cero")).toBeVisible();

    await page.getByLabel("Nombre del titular").fill("Alumno Prueba");
    await page.getByLabel("DNI").fill("12345678");
    await page.getByLabel(/operación/i).fill("OP-E2E-1");
    await page.getByLabel(/monto/i).fill("199");
    await page.getByLabel(/fecha y hora/i).fill("2026-08-01T10:00");
    await page.setInputFiles("#proof-file", {
      name: "comprobante.png", mimeType: "image/png",
      buffer: Buffer.from("fake-image-content"),
    });
    await page.getByRole("button", { name: /enviar comprobante/i }).click();
    await expect(page.getByText(/comprobante enviado/i)).toBeVisible();

    const adminPage = await context.newPage();
    await login(adminPage, ADMIN.email, ADMIN.password);
    await adminPage.goto("/admin/pagos");
    await expect(adminPage.getByText(orderNumber)).toBeVisible();
    await adminPage.getByRole("button", { name: /^aprobar$/i }).click();
    await expect(adminPage.getByText(/aprobada/i)).toBeVisible();
  });
});
```

**Nota:** este test asume un endpoint auxiliar `/api/test-only/crear-orden` porque la Fase 1 no incluyó un botón "Inscribirme" funcional en `/cursos/[slug]` (mostraba "Próximamente" a propósito). Antes de este paso, crea ese endpoint:

`src/app/api/test-only/crear-orden/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { crearOrden } from "@/modules/billing/actions";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "No disponible." }, { status: 404 });
  }
  const { courseSlug } = (await req.json()) as { courseSlug: string };
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, courseSlug)).limit(1);
  if (!course) return Response.json({ error: "Curso no encontrado." }, { status: 404 });
  const result = await crearOrden(course.id);
  return Response.json(result);
}
```

Esta ruta queda bloqueada en producción por el chequeo de `NODE_ENV`, y además reemplazará su propósito en cuanto la Fase 1 (o un ajuste posterior) agregue el botón real de "Comprar" a `/cursos/[slug]` — ese día, este archivo y el helper del test se eliminan.

- [ ] **Step 2: Correr el E2E**

```bash
pnpm db:seed
pnpm test:e2e tests/e2e/pago.spec.ts
```

Esperado: **PASA**. Si algún `getByLabel` no coincide con el HTML real de `payment-proof-form.tsx`, ajusta el selector — no aflojes el assert.

- [ ] **Step 3: Verificación final de la fase**

```bash
pnpm test
pnpm test:e2e
pnpm build
```

Los tres en verde.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "test: add E2E for manual payment purchase and admin approval flow"
```

---

## Estado al terminar

**Funciona:** crear una orden con precio y comisión recalculados en el servidor · cupones porcentuales/fijos validados · pantalla de pago con QR/Yape/Plin/CCI y aviso de límite de Yape · subida de comprobante con Turnstile directo a R2 · cola de aprobación en `/admin/pagos` con comprobante servido por URL firmada solo a admin · `aprobarPago` atómico e idempotente que inscribe y genera earnings · `rechazarPago` que permite reintentar sobre la misma orden · vencimiento automático de órdenes sin comprobante pendiente · emails de aviso al admin, aprobación y rechazo al alumno.

**No funciona todavía, y es lo esperado:** `/mi-aprendizaje`, acceso real al Zoom/grabaciones, recordatorios (Fase 3) · examen y certificados (Fases 4-5) · liquidaciones al instructor, revocación/reembolso, cupones desde el admin, páginas legales (Fase 6) · botón de compra real en `/cursos/[slug]` (se deja como endpoint de test hasta entonces) · Culqi.

**Siguiente plan:** Fase 3 — aula del alumno (`/mi-aprendizaje`, agenda con estados, acceso a Zoom y grabaciones vía `assertEnrolled`, progreso auto-reportado, cron de recordatorios a 24h/1h).

---

## Auto-revisión

**Cobertura del spec relevante a esta fase:**

| Requisito del spec | Cubierto en |
|---|---|
| `crearOrden` recalcula precio en servidor (§6.2) | Task 1 |
| Precedencia de comisión reutilizada, no reinventada (§5) | Task 1, reutiliza `resolveCommissionRate` de la Fase 0-1 |
| Pantalla de pago con destinos y aviso de `YAPE_MAX_CENTS` (§6.2) | Task 2 |
| Turnstile en subida de comprobante (§7.2) | Task 3 |
| UNIQUE parcial de `payment_proofs` ejercitado (§5, invariante 4) | Task 3, test 3 |
| `aprobarPago` transaccional, atómico e idempotente (§6.2, §8) | Task 4 |
| Email después del COMMIT, no dentro (§6.2) | Task 6 Step 7 |
| Rechazar permite reintentar sobre la misma orden (§6.2) | Task 4, `rechazarPago` no crea orden nueva |
| Cron de expiración de órdenes (§6.2) | Task 6 |
| Comprobantes solo visibles para admin, vía URL firmada (§7.2) | Task 5 |
| E2E de compra → aprobación (§8) | Task 7 |

**Huecos deliberados, no olvidos:** `coupon_redemptions` no se inserta todavía (comentado y explicado en la Task 4) porque no hay UI de admin para crear cupones hasta la Fase 6 — implementarlo ahora sería código sin forma de probarse manualmente. El botón "Inscribirme" real de `/cursos/[slug]` sigue mostrando "Próximamente"; esta fase agrega un endpoint de solo-test para poder ejercitar el flujo de compra en E2E sin adelantar esa UI fuera de su fase.

**Consistencia de nombres verificada:** `computeOrderTotals` / `isCouponValid` / `computeCommission` (Task 1, reutilizados en Task 4) · `nextOrderNumber` / `getOrderByNumber` / `getActivePaymentDestinations` / `listPendingProofs` (Task 1 y 5) · `crearOrden` / `submitPaymentProof` / `aprobarPago` / `rechazarPago` / `expireStaleOrders` (un solo archivo, `billing/actions.ts`, en las Tasks 1, 3, 4 y 6) · `validateProofUpload` / `proofKey` (Task 1, usados en Task 3) · `resolveCommissionRate` / `isEnrolled` / `requireUser` / `assertRole` / `verifyTurnstile` / `limaLocalToUtc` / `formatPEN` / `formatLima` — todos importados desde sus módulos ya existentes de la Fase 0-1, ninguno redefinido.
