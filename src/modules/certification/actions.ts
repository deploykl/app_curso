"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";

export async function revocarCertificado(certificateId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo de la revocación.");
  }

  const [cert] = await db.select({ id: certificates.id })
    .from(certificates).where(eq(certificates.id, certificateId)).limit(1);
  if (!cert) throw new Error("Certificado no encontrado.");

  await db
    .update(certificates)
    .set({ revokedAt: new Date(), revokeReason: motivo.trim() })
    .where(eq(certificates.id, certificateId));

  revalidatePath("/admin/certificados");
}
