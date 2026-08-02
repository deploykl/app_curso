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
