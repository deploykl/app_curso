"use server";
import { and, eq, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { instructorEarnings, payouts, user } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";

const inputSchema = z.object({
  reference: z.string().trim().max(120).optional(),
  proofFileKey: z.string().trim().min(1, "Adjunta la captura del pago como evidencia."),
});

/**
 * Liquida a un instructor todo lo que tenga "disponible" ahora mismo (pending
 * con availableAt ya vencido). Crea un payout ya "paid" — el pago real
 * (Yape/Plin/transferencia al instructor) ocurre fuera de la app, esto solo
 * lo registra junto con la captura como evidencia — y mueve esas ganancias a
 * status "paid" con ese payoutId. No toca lo que siga en garantía ni lo ya
 * reembolsado.
 */
export async function crearPagoInstructorAction(
  instructorId: string,
  input: { reference?: string; proofFileKey: string }
): Promise<{ totalCents: number }> {
  await assertRole(["admin"]);

  const parsed = inputSchema.parse(input);

  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, instructorId)).limit(1);
  if (!target) throw new Error("Instructor no encontrado.");

  const result = await db.transaction(async (tx) => {
    const disponibles = await tx
      .select({ id: instructorEarnings.id, netCents: instructorEarnings.netCents, availableAt: instructorEarnings.availableAt })
      .from(instructorEarnings)
      .where(
        and(
          eq(instructorEarnings.instructorId, instructorId),
          eq(instructorEarnings.status, "pending"),
          lte(instructorEarnings.availableAt, new Date())
        )
      )
      .for("update");

    if (disponibles.length === 0) {
      throw new Error("Este instructor no tiene ganancias disponibles para pagar.");
    }

    const totalCents = disponibles.reduce((sum, e) => sum + e.netCents, 0);
    const fechas = disponibles.map((e) => e.availableAt.getTime());

    const [payout] = await tx.insert(payouts).values({
      instructorId,
      periodStart: new Date(Math.min(...fechas)),
      periodEnd: new Date(Math.max(...fechas)),
      totalCents,
      status: "paid",
      paidAt: new Date(),
      reference: parsed.reference || null,
      proofFileKey: parsed.proofFileKey,
    }).returning({ id: payouts.id });

    await tx.update(instructorEarnings)
      .set({ status: "paid", payoutId: payout.id })
      .where(inArray(instructorEarnings.id, disponibles.map((e) => e.id)));

    return { totalCents };
  });

  revalidatePath("/admin/ganancias");
  revalidatePath("/instructor/pagos");
  return result;
}
