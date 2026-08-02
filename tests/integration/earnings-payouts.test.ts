import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, orders, orderItems, instructorEarnings, payouts } from "@/db/schema";

const ADMIN_EMAIL = "adm-pay@test.pe";
const PROF_EMAIL = "prof-pay@test.pe";

let adminId: string;
let profId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: adminId, role: "admin", name: "Admin" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { crearPagoInstructorAction } = await import("@/modules/earnings/actions");
const { getInstructorEarningsSummary, listPayouts } = await import("@/modules/earnings/queries");

/*
  `fileParallelism: false` corre todos los archivos de test contra la misma
  BD, uno tras otro, así que un `db.delete(courses)` sin condición choca con
  filas de OTRO archivo si el orden de ejecución no es el que uno asume.
  Por eso aquí la limpieza se acota siempre a las filas de este archivo
  (los dos emails fijos de arriba), nunca a las tablas completas.
*/
async function limpiar() {
  const propios = await db.select({ id: user.id }).from(user)
    .where(inArray(user.email, [ADMIN_EMAIL, PROF_EMAIL]));
  const ids = propios.map((u) => u.id);
  if (ids.length === 0) return;

  await db.delete(instructorEarnings).where(inArray(instructorEarnings.instructorId, ids));
  await db.delete(payouts).where(inArray(payouts.instructorId, ids));
  await db.delete(orderItems).where(inArray(orderItems.instructorId, ids));
  await db.delete(orders).where(inArray(orders.userId, ids));
  await db.delete(courses).where(inArray(courses.instructorId, ids));
  await db.delete(user).where(inArray(user.id, ids));
}

async function crearGanancia(opts: { netCents: number; availableAt: Date }) {
  const [o] = await db.insert(orders).values({
    userId: profId, orderNumber: `PED-${crypto.randomUUID()}`,
    subtotalCents: opts.netCents, totalCents: opts.netCents, status: "paid", paidAt: new Date(),
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();

  const [item] = await db.insert(orderItems).values({
    orderId: o.id, courseId: cursoId, instructorId: profId, titleSnapshot: "Curso",
    unitPriceCents: opts.netCents, commissionRate: "30.00", commissionCents: 0, netCents: opts.netCents,
  }).returning();

  await db.insert(instructorEarnings).values({
    orderItemId: item.id, instructorId: profId,
    grossCents: opts.netCents, commissionCents: 0, netCents: opts.netCents,
    status: "pending", availableAt: opts.availableAt,
  });
}

beforeEach(async () => {
  await limpiar();

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Admin", email: ADMIN_EMAIL, emailVerified: true, role: "admin",
  }).returning();
  adminId = a.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: PROF_EMAIL, emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: `curso-pay-${crypto.randomUUID()}`, title: "Curso", priceCents: 10000,
  }).returning();
  cursoId = c.id;
});

afterAll(limpiar);

describe("crearPagoInstructorAction", () => {
  it("liquida solo lo disponible y deja intacto lo que sigue en garantía", async () => {
    await crearGanancia({ netCents: 7000, availableAt: new Date(Date.now() - 1000) }); // ya disponible
    await crearGanancia({ netCents: 5000, availableAt: new Date(Date.now() + 30 * 86_400_000) }); // en garantía

    const { totalCents } = await crearPagoInstructorAction(profId, {
      reference: "YAPE-123",
      proofFileKey: "payout-proofs/x/1.png",
    });
    expect(totalCents).toBe(7000);

    const resumen = await getInstructorEarningsSummary(profId);
    expect(resumen.pagadoCents).toBe(7000);
    expect(resumen.pendienteCents).toBe(5000);
    expect(resumen.disponibleCents).toBe(0);

    const pagos = await listPayouts(profId);
    expect(pagos).toHaveLength(1);
    expect(pagos[0].totalCents).toBe(7000);
    expect(pagos[0].reference).toBe("YAPE-123");
  });

  it("rechaza pagar si no hay nada disponible", async () => {
    await crearGanancia({ netCents: 5000, availableAt: new Date(Date.now() + 30 * 86_400_000) });

    await expect(
      crearPagoInstructorAction(profId, { proofFileKey: "payout-proofs/x/1.png" })
    ).rejects.toThrow(/no tiene ganancias disponibles/i);
  });

  it("no vuelve a pagar dos veces lo mismo", async () => {
    await crearGanancia({ netCents: 7000, availableAt: new Date(Date.now() - 1000) });

    await crearPagoInstructorAction(profId, { proofFileKey: "payout-proofs/x/1.png" });
    await expect(
      crearPagoInstructorAction(profId, { proofFileKey: "payout-proofs/x/2.png" })
    ).rejects.toThrow(/no tiene ganancias disponibles/i);

    const [row] = await db.select().from(instructorEarnings).where(eq(instructorEarnings.instructorId, profId));
    expect(row.status).toBe("paid");
  });

  it("exige adjuntar la evidencia del pago", async () => {
    await crearGanancia({ netCents: 7000, availableAt: new Date(Date.now() - 1000) });

    await expect(
      crearPagoInstructorAction(profId, { proofFileKey: "" })
    ).rejects.toThrow(/adjunta la captura/i);
  });
});
