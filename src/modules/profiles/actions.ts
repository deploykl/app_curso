"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { instructorProfiles } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";

const payoutMethodSchema = z.object({
  payoutMethod: z.enum(["yape", "plin", "transferencia", "interbancario"]),
  payoutHolderName: z.string().trim().min(3).max(160),
  payoutIdentifier: z.string().trim().min(3).max(40),
  payoutBankName: z.string().trim().max(120).optional(),
  payoutQrImageKey: z.string().trim().max(500).optional(),
});

/** El instructor configura cómo quiere que el admin le deposite sus ganancias. */
export async function guardarMetodoPagoAction(raw: unknown): Promise<void> {
  const u = await assertRole(["instructor", "admin"]);
  const input = payoutMethodSchema.parse(raw);

  await db
    .update(instructorProfiles)
    .set({
      payoutMethod: input.payoutMethod,
      payoutHolderName: input.payoutHolderName,
      payoutIdentifier: input.payoutIdentifier,
      payoutBankName: input.payoutBankName || null,
      payoutQrImageKey: input.payoutQrImageKey || null,
      updatedAt: new Date(),
    })
    .where(eq(instructorProfiles.userId, u.id));

  revalidatePath("/instructor/pagos");
  revalidatePath("/admin/ganancias");
}
