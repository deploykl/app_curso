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
