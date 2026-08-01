import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, enrollments, orders, orderItems, paymentProofs } from "@/db/schema";
import { expireStaleOrders } from "@/modules/billing/jobs";

let studentId: string;
let cursoId: string;

beforeEach(async () => {
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  // enrollments debe borrarse antes que courses: si otro suite (p.ej.
  // session-reminders.test.ts) deja una fila colgando por FK, el
  // `db.delete(courses)` de abajo revienta.
  await db.delete(enrollments);
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

afterEach(async () => {
  // Evita filtrar filas de orders/order_items/payment_proofs hacia otros
  // archivos de test (fileParallelism está deshabilitado, pero el orden de
  // ejecución entre archivos no está garantizado): otros suites (p.ej.
  // catalog-queries.test.ts) hacen `db.delete(courses)` sin limpiar antes
  // order_items, lo que revienta por la FK si dejamos datos aquí.
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(enrollments);
  await db.delete(courses);
  await db.delete(user);
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
