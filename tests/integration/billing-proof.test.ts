import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
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

afterAll(async () => {
  await db.delete(paymentProofs);
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);
});

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

  it("rechaza subir un segundo comprobante mientras el primero sigue pendiente en la misma orden", async () => {
    await submitPaymentProof(orderId, validInput);

    await expect(
      submitPaymentProof(orderId, { ...validInput, operationNumber: "OP-002" })
    ).rejects.toThrow(/ya hay un comprobante pendiente/i);

    const rows = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(rows).toHaveLength(1);
  });
});
