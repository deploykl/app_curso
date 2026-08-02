"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";

const inputSchema = z.object({
  earningAvailableDays: z.coerce.number().int().min(0).max(365),
});

export async function actualizarConfiguracionAction(input: { earningAvailableDays: number }): Promise<void> {
  await assertRole(["admin"]);

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  await db.insert(platformSettings)
    .values({ id: 1, earningAvailableDays: parsed.data.earningAvailableDays, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { earningAvailableDays: parsed.data.earningAvailableDays, updatedAt: new Date() },
    });

  revalidatePath("/admin/configuracion");
}
