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
